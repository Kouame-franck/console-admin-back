// Pilote Money Fusion. Chaque pilote de ce dossier expose le même contrat (voir index.js) :
// `initier` et `verifier` parlent un vocabulaire commun à toute la console, jamais celui,
// propre à ce prestataire, de sa propre API — c'est ce qui permet de changer d'agrégateur en
// ne changeant qu'une variable d'environnement (PAIEMENT_PROVIDER), sans toucher au code
// métier (lib/billing.js).

const MONEYFUSION_PAY_URL = process.env.MONEYFUSION_PAY_URL;
// Fixe côté API Money Fusion (pas propre au marchand) — sans "www." ce sous-domaine sert un
// certificat TLS invalide (auto-signé), rejeté à raison par fetch.
const MONEYFUSION_STATUT_URL = "https://pay.moneyfusion.net/paiementNotif";

export async function initier({ montant, nomArticle, nomClient, numeroClient, infosPerso, returnUrl, webhookUrl }) {
  if (!MONEYFUSION_PAY_URL) throw new Error("MONEYFUSION_PAY_URL non configurée");

  const response = await fetch(MONEYFUSION_PAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      totalPrice: montant,
      article: [{ [nomArticle]: montant }],
      personal_Info: [infosPerso || {}],
      nomclient: nomClient,
      numeroSend: numeroClient,
      return_url: returnUrl,
      webhook_url: webhookUrl,
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  if (!data.statut) {
    throw new Error(data.message || "Échec de l'initiation du paiement Money Fusion");
  }

  return { token: data.token, url: data.url };
}

// Traduit le vocabulaire de Money Fusion ('pending' | 'paid' | 'failed' | 'no paid') vers le
// vocabulaire commun ('en_attente' | 'paye' | 'echoue') — voir index.js pour la liste
// exhaustive des trois seules valeurs que le reste de la console est autorisé à connaître.
//
// "echoue" est un verrou définitif côté billing.js (verifierEtTraiter) : une fois posé, plus
// aucune revérification n'a lieu. "no paid" ne veut pas dire "rejeté" mais "pas encore confirmé
// à cet instant" -- un paiement mobile money peut mettre quelques secondes à quelques dizaines
// de secondes à se confirmer côté Money Fusion après validation par l'opérateur. Un webhook ou
// un polling qui tombe pile dans cette fenêtre voyait "no paid" et verrouillait "echoue" à
// tort, alors que le paiement finissait par aboutir juste après (constaté le 2026-09-04 :
// paiement réel confirmé "paid" chez Money Fusion quelques minutes après avoir été enregistré
// "echoue" côté console). Seul "failed" (rejet explicite) verrouille désormais "echoue" ; tout
// le reste, y compris "no paid", reste "en_attente" et sera revérifié au prochain appel.
function normaliserStatut(statutBrut) {
  if (statutBrut === "paid") return "paye";
  if (statutBrut === "failed") return "echoue";
  return "en_attente";
}

export async function verifier(token) {
  const response = await fetch(`${MONEYFUSION_STATUT_URL}/${token}`);
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();

  // `Montant` est le net déjà amputé de la commission Money Fusion (`frais`) -- pas ce que le
  // client a réellement payé. billing.js (confirmerEtProvisionner) compare ce montant au prix
  // brut annoncé (PendingPayment.montant) et bloque l'activation si inférieur : renvoyer le net
  // seul faisait donc échouer CE contrôle sur CHAQUE paiement Money Fusion, sans exception
  // (constaté le 2026-09-04 : 194 reçus vs 200 attendus, alors que le client avait bien payé
  // 200 -- seuls 6 étaient la commission du prestataire). Montant + frais reconstitue le total
  // réellement payé par le client.
  const montantNet = data.data?.Montant ?? null;
  const frais = data.data?.frais ?? 0;

  return {
    statut: normaliserStatut(data.data?.statut),
    montant: montantNet !== null ? montantNet + frais : null,
    transactionId: data.data?.numeroTransaction ?? null,
  };
}

// Le webhook Money Fusion porte le jeton dans `tokenPay` (ou `token`, selon la version) — un
// nom de champ propre à ce prestataire, que billing.js ne doit jamais avoir à connaître.
// Async par cohérence avec les autres pilotes (KadevPay a besoin d'une recherche en base) —
// celui-ci n'a rien d'asynchrone à faire, mais garde la même signature.
export async function jetonWebhook({ corps }) {
  return corps?.tokenPay || corps?.token || null;
}
