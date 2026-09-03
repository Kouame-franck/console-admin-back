// Point d'entrée unique vers l'agrégateur de paiement actif. Le métier (lib/billing.js,
// routes/publicPortal.js) n'appelle jamais un pilote directement et ne connaît que trois
// statuts : 'en_attente' | 'paye' | 'echoue' — jamais le vocabulaire propre à un prestataire
// (Money Fusion parle de 'pending'/'paid'/'no paid', un autre parlera différemment).
//
// Changer d'agrégateur = changer PAIEMENT_PROVIDER dans .env, puis redémarrer. Aucun fichier de
// ce dépôt n'a besoin d'être modifié pour un agrégateur déjà câblé ici — c'est tout le sens de
// cette indirection. Même principe que utils/sms/index.js côté s-school (PILOTES + SMS_PROVIDER).
import * as moneyfusion from "./moneyfusion.js";
import * as kadevpay from "./kadevpay.js";
import * as cinetpay from "./cinetpay.js";
import * as simulation from "./simulation.js";

const FOURNISSEURS = { moneyfusion, kadevpay, cinetpay, simulation };

function fournisseur() {
  const nom = process.env.PAIEMENT_PROVIDER || "moneyfusion";
  const f = FOURNISSEURS[nom];
  if (!f) {
    throw new Error(
      `Agrégateur de paiement inconnu : "${nom}". Valeurs possibles : ${Object.keys(FOURNISSEURS).join(", ")}.`
    );
  }
  return f;
}

/**
 * Initie un paiement. `infosPerso` est transmis tel quel au prestataire (utile pour retrouver
 * le contexte métier dans son tableau de bord) ; aucun champ n'y est jamais lu par la console.
 * @returns {Promise<{ token: string, url: string }>}
 */
export async function initierPaiementElectronique(params) {
  return fournisseur().initier(params);
}

/**
 * Interroge le statut d'un paiement auprès du prestataire actif.
 * @returns {Promise<{ statut: 'en_attente'|'paye'|'echoue', montant: number|null, transactionId: string|null }>}
 */
export async function verifierPaiementElectronique(token) {
  return fournisseur().verifier(token);
}

// Extrait notre jeton (celui de PendingPayment.token) d'une notification webhook. Chaque
// prestataire fait ce travail à sa façon : Money Fusion le lit directement dans le corps ;
// KadevPay doit d'abord vérifier une signature HMAC (d'où rawBody/headers, nécessaires
// seulement à lui) puis chercher en base quel PendingPayment porte sa référence externe.
// `null` = signature invalide ou jeton introuvable — le webhook doit alors être ignoré.
export async function jetonDepuisWebhook({ corps, rawBody, headers }) {
  return fournisseur().jetonWebhook({ corps, rawBody, headers });
}

export function nomFournisseurActif() {
  return process.env.PAIEMENT_PROVIDER || "moneyfusion";
}
