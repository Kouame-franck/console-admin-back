import { Router } from "express";
import { appelDigyoPos, DigyoPosInjoignable } from "../lib/digyoPosSync.js";

// Onglet digyo-pos de la console : relais vers les routes /plateforme de digyo-pos (voir
// lib/digyoPosSync.js). Seules les routes listées ici sont relayées : la console n'expose jamais
// un accès générique à l'API plateforme.
const router = Router();

// digyo-pos répond { erreur: { code, message, details } } ; le front de la console attend { error }.
async function relayer(res, chemin, options = {}) {
  try {
    const { status, data } = await appelDigyoPos(chemin, options);
    if (status >= 400) {
      return res.status(status).json({ error: data?.erreur?.message || `digyo-pos a répondu ${status}.`, details: data?.erreur?.details });
    }
    if (status === 204) return res.status(204).end();
    return res.status(status).json(data);
  } catch (err) {
    if (err instanceof DigyoPosInjoignable) {
      console.error(`digyo-pos injoignable : ${err.message}`);
      return res.status(502).json({ error: "digyo-pos est injoignable pour le moment. Réessayez dans quelques instants." });
    }
    throw err;
  }
}

const id = (v) => encodeURIComponent(v);

router.get("/catalogue", (req, res) => relayer(res, "/catalogue"));

router.get("/disponibilite", (req, res) => {
  const qs = new URLSearchParams();
  for (const k of ["login", "slug", "domaine"]) if (req.query[k]) qs.set(k, String(req.query[k]));
  return relayer(res, `/disponibilite?${qs}`);
});

router.get("/entreprises", (req, res) => relayer(res, "/entreprises"));
router.post("/entreprises", (req, res) => relayer(res, "/entreprises", { method: "POST", body: req.body }));
router.get("/entreprises/:id", (req, res) => relayer(res, `/entreprises/${id(req.params.id)}`));
router.patch("/entreprises/:id", (req, res) =>
  relayer(res, `/entreprises/${id(req.params.id)}`, { method: "PATCH", body: req.body })
);
router.put("/entreprises/:id/abonnement", (req, res) =>
  relayer(res, `/entreprises/${id(req.params.id)}/abonnement`, { method: "PUT", body: req.body })
);
router.post("/entreprises/:id/domaines", (req, res) =>
  relayer(res, `/entreprises/${id(req.params.id)}/domaines`, { method: "POST", body: req.body })
);
router.delete("/entreprises/:id/domaines/:domaineId", (req, res) =>
  relayer(res, `/entreprises/${id(req.params.id)}/domaines/${id(req.params.domaineId)}`, { method: "DELETE" })
);
router.post("/entreprises/:id/postes/:posteId/revoquer", (req, res) =>
  relayer(res, `/entreprises/${id(req.params.id)}/postes/${id(req.params.posteId)}/revoquer`, { method: "POST" })
);
router.post("/entreprises/:id/utilisateurs/:utilisateurId/reinitialiser-mot-de-passe", (req, res) =>
  relayer(res, `/entreprises/${id(req.params.id)}/utilisateurs/${id(req.params.utilisateurId)}/reinitialiser-mot-de-passe`, {
    method: "POST",
  })
);

// Tableau de bord : agrégé à partir de la liste (une seule source, aucun stockage côté console).
router.get("/dashboard", async (req, res) => {
  try {
    const { status, data } = await appelDigyoPos("/entreprises");
    if (status >= 400) return res.status(status).json({ error: data?.erreur?.message || `digyo-pos a répondu ${status}.` });

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const dans30j = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const actives = data.filter((e) => e.statut === "actif");
    const somme = (champ) => actives.reduce((s, e) => s + Number(e[champ] || 0), 0);
    const finDe = (e) => (e.abonnement_fin ? String(e.abonnement_fin).slice(0, 10) : null);

    res.json({
      stats: {
        entreprisesActives: actives.length,
        entreprisesSuspendues: data.filter((e) => e.statut === "suspendu").length,
        ventes30j: somme("ventes_30j"),
        chiffreAffaires30j: somme("chiffre_affaires_30j"),
        utilisateurs: somme("nb_utilisateurs"),
        postes: somme("nb_postes"),
      },
      // Abonnements à renouveler : échus ou arrivant à échéance dans les 30 jours.
      echeances: actives
        .filter((e) => finDe(e) && finDe(e) <= dans30j)
        .map((e) => ({ id: e.id, nom: e.nom, formule: e.formule, fin: finDe(e), echu: finDe(e) < aujourdhui }))
        .sort((a, b) => a.fin.localeCompare(b.fin)),
    });
  } catch (err) {
    if (err instanceof DigyoPosInjoignable) {
      console.error(`digyo-pos injoignable : ${err.message}`);
      return res.status(502).json({ error: "digyo-pos est injoignable pour le moment." });
    }
    throw err;
  }
});

export default router;
