// Client vers l'API admin-sync de digyo-site — lecture seule des demandes de projet client,
// même principe que sschoolSync.js côté sschool (clé partagée en en-tête `x-admin-sync-key`).
// Contrairement à sschool, la console ne provisionne ni ne supprime rien côté digyo : les
// demandes de projet ne naissent que sur digyo lui-même.
export async function fetchRealProjects() {
  const url = `${process.env.DIGYO_SYNC_URL}/api/admin-sync/projects`;
  const res = await fetch(url, {
    headers: { "x-admin-sync-key": process.env.DIGYO_SYNC_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`La synchronisation Digyo a échoué (${res.status}).`);
  }

  return res.json();
}

// Diagnostics approfondis : même clé, même principe de lecture -- voir routes/diagnostics.js >
// POST /sync. pushDiagnosticUpdate est la seule écriture de la console vers digyo dans toute
// l'intégration digyo <-> console (tout le reste est lecture) : nécessaire ici parce que c'est
// la console qui décide du statut/résultat, mais que c'est digyo qui l'affiche au client (Espace
// client, voir DeepDiagnosticStatus.jsx côté digyo).
export async function fetchDiagnostics() {
  const url = `${process.env.DIGYO_SYNC_URL}/api/admin-sync/diagnostics`;
  const res = await fetch(url, {
    headers: { "x-admin-sync-key": process.env.DIGYO_SYNC_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`La synchronisation des diagnostics a échoué (${res.status}).`);
  }

  return res.json();
}

export async function pushDiagnosticUpdate(digyoUserId, { status, result }) {
  const url = `${process.env.DIGYO_SYNC_URL}/api/admin-sync/diagnostics/${digyoUserId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-admin-sync-key": process.env.DIGYO_SYNC_API_KEY },
    body: JSON.stringify({ status, result }),
  });

  if (!res.ok) {
    throw new Error(`La mise à jour du diagnostic côté digyo a échoué (${res.status}).`);
  }
}
