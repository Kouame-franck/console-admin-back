// Pilote KadevPay.
//
// Différence structurelle avec Money Fusion, à bien garder en tête : KadevPay n'expose aucune
// route serveur pour INITIER un paiement (vérifié sur leur documentation publique,
// https://pay.kadev.ci/developer-documentation/, à trois reprises le 2026-08-19). Le paiement
// démarre par un widget JavaScript ouvert par le NAVIGATEUR avec la clé publique — la console
// ne fait qu'y participer en amont (préparer les paramètres) et en aval (vérifier après coup).
//
// Conséquence sur `initier()` : il ne contacte jamais KadevPay. Il génère notre propre jeton et
// renvoie les paramètres dont le widget côté client a besoin (voir digyo/sschool,
// composants de paiement). Le jeton KadevPay lui-même (leur "reference") n'existe qu'une fois
// le widget terminé côté client — c'est pour ça que PendingPayment porte un `referenceExterne`
// distinct de `token`, renseigné après coup par POST /api/public/paiement/confirmer-widget.
//
// AVERTISSEMENT — zones non confirmées par la documentation publique, à valider par un vrai
// paiement de test avant mise en production réelle :
//   - La forme exacte de la réponse de GET /transactions/verify/:reference n'est pas montrée
//     dans leurs exemples (seul le corps du WEBHOOK l'est). On suppose la même forme
//     ({ data: { status, amount, reference } }) — à confirmer.
//   - Le champ `metadata` du widget est documenté comme accepté à l'envoi, mais rien ne dit
//     s'il est répercuté dans la réponse de vérification ou le webhook — on ne s'appuie donc
//     PAS dessus pour la corrélation (voir confirmer-widget, qui reçoit token ET reference
//     explicitement du navigateur, qui connaît les deux au moment du succès).
import { prisma } from "../prisma.js";
import crypto from "node:crypto";

const BASE_URL = "https://pay.kadev.ci/api/v1";

function normaliserStatut(statutBrut) {
  if (statutBrut === "paid" || statutBrut === "success" || statutBrut === "completed") return "paye";
  if (statutBrut === "failed" || statutBrut === "cancelled" || statutBrut === "expired") return "echoue";
  return "en_attente";
}

// Aucun appel réseau : voir l'avertissement en tête de fichier. `token` est généré ici, pas par
// KadevPay — c'est notre identifiant tant que le widget n'a pas abouti.
export async function initier({ montant, nomClient, numeroClient, email, returnUrl }) {
  if (!process.env.KADEVPAY_PUBLIC_KEY) throw new Error("KADEVPAY_PUBLIC_KEY non configurée");
  // KadevPay exige un email — nos flux (renouvellement, recharge) n'en collectent pas toujours
  // un côté formulaire ; à défaut on retombe sur celui du responsable de l'établissement,
  // fourni par l'appelant (voir billing.js).
  if (!email) throw new Error("email requis pour le paiement KadevPay");

  const token = `kdv-${crypto.randomUUID()}`;

  // Pas de `callback_url` transmis au widget : la documentation KadevPay indique qu'un
  // `callback_url` déclenche une redirection automatique à la place du callback `onSuccess` côté
  // JS (https://pay.kadev.ci/developer-documentation/, vérifié le 2026-08-19) — or c'est
  // justement `onSuccess(response.reference)` dont le frontend a besoin pour appeler
  // /paiement/confirmer-widget avant de quitter la page. `returnUrl` est renvoyé à part : c'est
  // le frontend qui y navigue lui-même, une fois confirmer-widget passé, pas KadevPay.
  return {
    token,
    mode: "widget",
    returnUrl,
    widget: {
      publicKey: process.env.KADEVPAY_PUBLIC_KEY,
      amount: montant,
      email,
      method: "momo",
      name: nomClient,
      phone: numeroClient,
      metadata: { token },
    },
  };
}

export async function verifier(token) {
  const pending = await prisma.pendingPayment.findUnique({ where: { token } });

  // Le widget n'a pas encore terminé côté navigateur (ou jamais) : rien à vérifier pour
  // l'instant, ce n'est pas une erreur — c'est l'état normal avant que confirmer-widget ne
  // renseigne referenceExterne.
  if (!pending?.referenceExterne) {
    return { statut: "en_attente", montant: null, transactionId: null };
  }
  if (!process.env.KADEVPAY_SECRET_KEY) throw new Error("KADEVPAY_SECRET_KEY non configurée");

  const reponse = await fetch(`${BASE_URL}/transactions/verify/${pending.referenceExterne}`, {
    headers: { Authorization: `Bearer ${process.env.KADEVPAY_SECRET_KEY}` },
  });
  if (!reponse.ok) throw new Error(await reponse.text());
  const data = await reponse.json();

  const statutBrut = data?.data?.status ?? data?.status;
  return {
    statut: normaliserStatut(statutBrut),
    montant: data?.data?.amount ?? data?.amount ?? null,
    transactionId: data?.data?.reference ?? data?.reference ?? pending.referenceExterne,
  };
}

// Contrairement à Money Fusion (jeton lu directement dans le corps), KadevPay nécessite :
//  1. de vérifier la signature HMAC-SHA512 avant de faire confiance au corps ;
//  2. de retrouver, par la référence KadevPay qu'il porte, LEQUEL de nos PendingPayment est
//     concerné — leur jeton à eux n'est pas le nôtre.
// Renvoie notre `token`, ou `null` si la signature est invalide ou la référence inconnue.
export async function jetonWebhook({ corps, rawBody, headers }) {
  const secret = process.env.KADEVPAY_WEBHOOK_SECRET;
  const signature = headers?.["x-kadevpay-signature"] || headers?.["X-KADEVPAY-SIGNATURE"];
  if (!secret || !signature || !rawBody) return null;

  const attendu = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const recu = Buffer.from(String(signature));
  const calcule = Buffer.from(attendu);
  if (recu.length !== calcule.length || !crypto.timingSafeEqual(recu, calcule)) {
    console.error("Webhook KadevPay : signature invalide, rejeté.");
    return null;
  }

  const reference = corps?.data?.reference;
  if (!reference) return null;

  const pending = await prisma.pendingPayment.findUnique({ where: { referenceExterne: reference } });
  return pending?.token ?? null;
}
