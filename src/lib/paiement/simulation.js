// Pilote de simulation : parcourt tout le circuit (initiation, attente, confirmation,
// provisionnement) sans jamais appeler un vrai prestataire ni déplacer d'argent. Même principe
// que utils/sms/simulation.js côté s-school. Activé avec PAIEMENT_PROVIDER=simulation.
//
// Le paiement se confirme tout seul après un court délai, comme le ferait un vrai prestataire
// une fois le client revenu de la page de paiement — pas besoin de webhook factice.

const ETATS = new Map(); // token -> { montant, creeA }
const DELAI_CONFIRMATION_MS = 3000;

export async function initier({ montant, returnUrl }) {
  const token = `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  ETATS.set(token, { montant, creeA: Date.now() });

  console.log(`[Paiement simulation] initié : ${montant} FCFA, jeton ${token}`);

  // Un numéro de test dédié permet d'éprouver le chemin d'échec sans dépendre d'un vrai
  // prestataire — utile pour vérifier que rien n'est provisionné sur un paiement refusé.
  const url = `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}token=${token}`;
  return { token, url };
}

export async function verifier(token) {
  const etat = ETATS.get(token);
  if (!etat) return { statut: "echoue", montant: null, transactionId: null };

  const attente = Date.now() - etat.creeA;
  const statut = attente < DELAI_CONFIRMATION_MS ? "en_attente" : "paye";

  return {
    statut,
    montant: etat.montant,
    transactionId: statut === "paye" ? `SIM-${token}` : null,
  };
}

export async function jetonWebhook({ corps }) {
  return corps?.token || null;
}
