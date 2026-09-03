// Pilote CinetPay — plateforme "Aurore" (post-migration). Une première version de ce fichier
// avait été écrite contre l'ancienne API Checkout v2 (api-checkout.cinetpay.com, apikey+site_id) ;
// documentée publiquement par recherche web, mais jamais vérifiée dans un vrai dashboard. Le
// 31/08/2026, un dashboard sandbox réel a révélé que cette ancienne API a été entièrement
// retirée (api-checkout.cinetpay.com et docs.cinetpay.com ne résolvent plus en DNS) — remplacée
// par une nouvelle plateforme, contrat confirmé par capture d'écran de la doc officielle dans le
// dashboard (Ressources > Documentation API > Référence API), pas par recherche web :
//
//   - POST {baseUrl}/v1/oauth/login  { api_key, api_password }
//       -> { access_token, token_type: "bearer", expires_in: 86400 }
//   - POST {baseUrl}/v1/payment  (Authorization: Bearer <token>)
//       -> { code, status: "OK", payment_url, details: { code, status, message, must_be_redirected } }
//     statut du paiement dans details.status, PAS dans le status racine (qui ne dit que "l'appel
//     API a réussi") — piège vu dans la doc elle-même.
//   - GET {baseUrl}/v1/payment/{merchant_transaction_id}  (Authorization: Bearer <token>)
//     = point de vérification canonique, documenté comme obligatoire ("Notification de
//     transaction" : ne jamais se fier au statut reçu par webhook, toujours revérifier ici).
//     ENVELOPPE DIFFÉRENTE de l'initiation, vérifié par un appel réel le 31/08/2026 (transaction
//     de test probe-1788202188, statut INITIATED) — PAS de wrapper `details` ici, le statut est
//     directement à la racine, et il n'y a AUCUN champ montant :
//       { code, status, merchant_transaction_id, transaction_id, user }
//
// Plus de site_id : c'est nous qui fournissons l'identifiant (merchant_transaction_id), comme
// pour Money Fusion — pas besoin de PendingPayment.referenceExterne ici.
//
// Comme le statut ('SUCCESS'|'FAILED'|'INITIATED'|'PENDING') n'a été vu qu'en INITIATED sur ce
// test réel (transaction jamais payée), le mapping SUCCESS/FAILED s'appuie sur le vocabulaire
// documenté (capture d'écran), pas sur un cas réel observé — à surveiller au premier vrai
// paiement complété.
//
// L'IP whitelistée côté CinetPay (voir dashboard > API & sécurité) doit matcher l'IP DE SORTIE
// réelle du serveur : le VPS a une IPv6 en plus de son IPv4 whitelistée, et fetch y résout
// api.cinetpay.net par défaut (Cloudflare y répond aussi) — rejeté par CinetPay
// ("This Ip is not withlisted", code 2011) tant que dns.setDefaultResultOrder("ipv4first")
// n'est pas posé (voir plus bas). Si ce VPS change ou si un autre serveur appelle ce pilote,
// vérifier sa route de sortie IPv4 réelle (`curl -4 https://api.ipify.org`), pas seulement l'IP
// affichée dans la console d'hébergement.
import crypto from "node:crypto";
import dns from "node:dns";
import { prisma } from "../prisma.js";

// Le VPS a une adresse IPv6 en plus de son IPv4 whitelistée côté CinetPay ; sans ce réglage,
// fetch (undici) résout api.cinetpay.net en IPv6 par défaut (Cloudflare y répond aussi) et
// CinetPay rejette avec "This Ip is not withlisted" — vérifié en conditions réelles le
// 31/08/2026 (curl sans -4 échoue avec code 2011/NOT_ALLOWED, curl -4 réussit). Seul le DNS de
// CE process est affecté, pas le reste du système.
dns.setDefaultResultOrder("ipv4first");

const BASE_URL = "https://api.cinetpay.net";

// Le jeton OAuth est valable 24h (expires_in) : on le garde en mémoire du process pour ne pas
// relogin à chaque paiement — sûr ici, ce fichier n'est chargé que côté serveur.
let jetonCache = null; // { accessToken, expireA }

async function obtenirJeton() {
  if (jetonCache && jetonCache.expireA > Date.now()) return jetonCache.accessToken;
  if (!process.env.CINETPAY_API_KEY) throw new Error("CINETPAY_API_KEY non configurée");
  if (!process.env.CINETPAY_API_PASSWORD) throw new Error("CINETPAY_API_PASSWORD non configurée");

  const response = await fetch(`${BASE_URL}/v1/oauth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.CINETPAY_API_KEY,
      api_password: process.env.CINETPAY_API_PASSWORD,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  if (!data?.access_token) throw new Error(data?.message || "Échec de l'authentification CinetPay");

  // Marge de 60s pour ne jamais utiliser un jeton pile expiré au moment de l'appel suivant.
  jetonCache = { accessToken: data.access_token, expireA: Date.now() + (data.expires_in - 60) * 1000 };
  return jetonCache.accessToken;
}

function normaliserStatut(statutBrut) {
  if (statutBrut === "SUCCESS") return "paye";
  if (statutBrut === "FAILED" || statutBrut === "INSUFFICIENT_BALANCE") return "echoue";
  return "en_attente"; // INITIATED, PENDING
}

export async function initier({ montant, nomArticle, nomClient, email, returnUrl, webhookUrl }) {
  if (!email) throw new Error("email requis pour le paiement CinetPay");

  const token = `cnp-${crypto.randomUUID()}`;
  const accessToken = await obtenirJeton();

  const response = await fetch(`${BASE_URL}/v1/payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      currency: "XOF",
      merchant_transaction_id: token,
      amount: montant,
      lang: "fr",
      designation: nomArticle,
      client_email: email,
      client_first_name: "Client",
      client_last_name: nomClient,
      success_url: returnUrl,
      failed_url: returnUrl,
      notify_url: webhookUrl,
      direct_pay: false,
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  if (!data?.payment_url) {
    throw new Error(data?.details?.message || data?.message || "Échec de l'initiation du paiement CinetPay");
  }

  return { token, url: data.payment_url };
}

export async function verifier(token) {
  const accessToken = await obtenirJeton();

  const response = await fetch(`${BASE_URL}/v1/payment/${token}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();

  // Statut à la racine ici (pas de `details` — voir avertissement en tête de fichier), et
  // CinetPay ne renvoie aucun montant sur cet endpoint. On ne peut donc pas renvoyer `null` :
  // billing.js fait `montantPaye < pending.montant`, et `null < nombre positif` vaut TRUE en JS
  // (null coercé à 0) — un paiement pourtant réussi serait marqué "echoue" à tort. On relit notre
  // propre montant attendu, seule source fiable ici (c'est nous qui l'avons fixé à l'initiation ;
  // CinetPay ne laisse pas le payeur le modifier).
  const pending = await prisma.pendingPayment.findUnique({ where: { token } });

  return {
    statut: normaliserStatut(data.status),
    montant: pending?.montant ?? null,
    transactionId: data.transaction_id ?? token,
  };
}

// Jamais vu en conditions réelles (voir avertissement en tête de fichier) : on suppose que le
// webhook porte le même nom de champ que partout ailleurs dans cette API (merchant_transaction_id),
// avec un repli sur l'ancien nom (cpm_trans_id) au cas où. Sans effet sur la sécurité : le corps
// du webhook n'est ici QUE pour retrouver quel jeton est concerné — verifierEtTraiter revérifie
// toujours le vrai statut auprès de CinetPay ensuite (voir routes/publicPortal.js).
export async function jetonWebhook({ corps }) {
  return corps?.merchant_transaction_id || corps?.cpm_trans_id || null;
}
