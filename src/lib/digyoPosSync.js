// Client vers les routes /plateforme de l'API digyo-pos (caisse et gestion de stock multi-entreprise).
// Même mécanisme que sschoolSync.js : clé partagée dans l'en-tête x-admin-sync-key.
//
// Contrairement à sschool, la console ne garde AUCUNE copie des entreprises digyo-pos : elle lit et
// écrit directement chez digyo-pos, seule source de vérité (décision du 2026-10-28). L'abonnement est
// poussé par la console et conservé par digyo-pos, qui ne dépend donc pas de la console pour fonctionner.

const TIMEOUT_MS = Number(process.env.DIGYO_POS_SYNC_TIMEOUT_MS) || 10000;

// « digyo-pos est injoignable » (réseau, délai, configuration absente) → 502 côté console ;
// une réponse métier de digyo-pos (400, 404, 409…) est relayée telle quelle.
export class DigyoPosInjoignable extends Error {}

export async function appelDigyoPos(chemin, { method = "GET", body } = {}) {
  const base = process.env.DIGYO_POS_SYNC_URL;
  const cle = process.env.DIGYO_POS_SYNC_API_KEY;
  if (!base || !cle) {
    throw new DigyoPosInjoignable("DIGYO_POS_SYNC_URL ou DIGYO_POS_SYNC_API_KEY non configurée.");
  }

  const headers = { "x-admin-sync-key": cle };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let reponse;
  try {
    reponse = await fetch(`${base}/plateforme${chemin}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const cause = err.name === "TimeoutError" ? `pas de réponse en ${TIMEOUT_MS} ms` : err.message;
    throw new DigyoPosInjoignable(`${method} ${chemin} — ${cause}`);
  }

  const texte = await reponse.text();
  let data = null;
  try {
    data = texte ? JSON.parse(texte) : null;
  } catch {
    throw new DigyoPosInjoignable(`${method} ${chemin} — réponse illisible (${reponse.status})`);
  }
  return { status: reponse.status, data };
}
