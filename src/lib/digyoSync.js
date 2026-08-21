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
