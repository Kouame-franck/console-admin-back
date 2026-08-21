export async function fetchRealEtablissements() {
  const url = `${process.env.SSCHOOL_SYNC_URL}/admin-sync/etablissements`;
  const res = await fetch(url, {
    headers: { "x-admin-sync-key": process.env.SSCHOOL_SYNC_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`La synchronisation Sschool a échoué (${res.status}).`);
  }

  return res.json();
}

// Provisionne un établissement réellement utilisable dans Sschool (établissement + rôle
// Super_admin + compte admin + année scolaire active). Renvoie les identifiants générés
// (mot de passe en clair une seule fois) pour affichage immédiat côté console.
export async function createRealEtablissement({ nom, address, email, tel, responsable, login, password }) {
  const url = `${process.env.SSCHOOL_SYNC_URL}/admin-sync/etablissements`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-sync-key": process.env.SSCHOOL_SYNC_API_KEY,
    },
    // `login`/`password` restent undefined pour un signup normal : sschool retombe alors sur
    // son comportement historique (email du responsable, mot de passe aléatoire). Réservé au
    // provisionnement du compte de démonstration, à identifiants mémorisables.
    body: JSON.stringify({ nom, address, email, tel, responsable, login, password }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message || `La création dans Sschool a échoué (${res.status}).`);
  }
  return data;
}

// Supprime réellement et intégralement un établissement dans Sschool (établissement, users,
// étudiants, notes, cursus... — voir routes/adminSync.js côté sschool pour le détail complet
// de la cascade). Appelée par la console AVANT de retirer sa propre fiche de suivi, pour ne
// jamais désynchroniser la console d'une école qui existe toujours réellement.
export async function deleteRealEtablissement(sschoolId) {
  const url = `${process.env.SSCHOOL_SYNC_URL}/admin-sync/etablissements/${sschoolId}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "x-admin-sync-key": process.env.SSCHOOL_SYNC_API_KEY },
  });

  if (res.status === 404) return; // déjà absent côté sschool : rien à faire, on continue
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || `La suppression dans Sschool a échoué (${res.status}).`);
  }
}

// Credite des SMS a un etablissement apres paiement d'une recharge. La console encaisse,
// s-school detient le solde et le consomme (voir back/routes/adminSync.js cote s-school).
// `reference` rend l'operation idempotente : rejouer la confirmation ne credite pas deux fois.
export async function crediterSmsEtablissement({ sschoolId, quantite, reference }) {
  const url = `${process.env.SSCHOOL_SYNC_URL}/admin-sync/etablissements/${sschoolId}/sms/crediter`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-sync-key": process.env.SSCHOOL_SYNC_API_KEY,
    },
    body: JSON.stringify({ quantite, reference }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `Sschool a répondu ${response.status}`);
  }
  return data;
}
