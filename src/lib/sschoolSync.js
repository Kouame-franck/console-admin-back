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
