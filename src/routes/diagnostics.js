import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeDiagnosticRequest } from "../lib/serializers.js";
import { fetchDiagnostics, pushDiagnosticUpdate } from "../lib/digyoSync.js";

const router = Router();

const VALID_STATUSES = ["requested", "in_progress", "completed", "onsite_required"];

router.get("/", async (req, res) => {
  const rows = await prisma.diagnosticRequest.findMany({ orderBy: { requestedAt: "desc" } });
  res.json(rows.map(serializeDiagnosticRequest));
});

router.post("/sync", async (req, res) => {
  const remote = await fetchDiagnostics();
  const results = [];

  for (const d of remote) {
    // Les champs venant de digyo sont toujours réécrits (digyo reste la source de vérité de la
    // demande elle-même) ; `status`/`result`, eux, ne sont JAMAIS touchés par une
    // resynchronisation une fois la demande importée -- c'est la console qui les possède
    // désormais (voir PATCH /:id ci-dessous et le commentaire sur DiagnosticRequest côté
    // schema.prisma).
    const data = {
      companyName: d.companyName,
      clientName: d.clientName,
      clientEmail: d.clientEmail,
      sector: d.sector,
      quickScore: d.quickScore,
      detailedChallenge: d.detailedChallenge,
      constraints: d.constraints,
      businessGoals: d.businessGoals,
      differentiation: d.differentiation,
      clientele: d.clientele,
      annualRevenue: d.annualRevenue,
      decisionMaker: d.decisionMaker,
      lostProspects: d.lostProspects,
      interestAreas: d.interestAreas,
      investmentBudget: d.investmentBudget,
      digitalImportance: d.digitalImportance,
      expectations: d.expectations,
      address: d.address,
      phone: d.phone,
      contactMethod: d.contactMethod,
      availability: d.availability,
      acceptPhysicalAudit: d.acceptPhysicalAudit,
      requestedAt: new Date(d.requestedAt),
      syncedAt: new Date(),
    };

    const existing = await prisma.diagnosticRequest.findUnique({ where: { digyoUserId: d.userId } });

    const row = existing
      ? await prisma.diagnosticRequest.update({ where: { id: existing.id }, data })
      : await prisma.diagnosticRequest.create({
          data: { ...data, digyoUserId: d.userId, status: d.status },
        });

    results.push(serializeDiagnosticRequest(row));
  }

  res.json({ synced: results.length, diagnostics: results });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.diagnosticRequest.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) return res.status(404).json({ error: "Diagnostic introuvable." });

  const { status, result } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status doit être l'un de : ${VALID_STATUSES.join(", ")}.` });
  }

  const updated = await prisma.diagnosticRequest.update({
    where: { id: existing.id },
    data: { status, result: result || null },
  });

  try {
    await pushDiagnosticUpdate(existing.digyoUserId, { status, result: result || null });
  } catch (err) {
    // La console reste autoritaire même si digyo est injoignable à cet instant : le
    // changement est déjà enregistré ici, seul son affichage côté client attendra la
    // prochaine tentative (pas de retry auto pour l'instant -- resauvegarder relance l'envoi).
    console.error("Erreur push diagnostic vers digyo :", err);
  }

  res.json(serializeDiagnosticRequest(updated));
});

export default router;
