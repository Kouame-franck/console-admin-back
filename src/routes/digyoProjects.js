import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeDigyoProjectRequest } from "../lib/serializers.js";
import { fetchRealProjects } from "../lib/digyoSync.js";

const router = Router();

router.get("/", async (req, res) => {
  const rows = await prisma.digyoProjectRequest.findMany({ orderBy: { createdAt: "desc" } });
  res.json(rows.map(serializeDigyoProjectRequest));
});

router.post("/sync", async (req, res) => {
  const remote = await fetchRealProjects();
  const results = [];

  for (const p of remote) {
    // Les champs venant de digyo sont toujours réécrits (digyo reste la source de vérité pour
    // eux) ; `status`, lui, est un statut de triage propre à la console et n'est jamais touché
    // par une resynchronisation, sans quoi retraiter une demande la ferait retomber à "nouveau"
    // au sync suivant.
    const data = {
      title: p.title,
      pillar: p.pillar,
      description: p.description,
      budgetRange: p.budgetRange,
      deadline: p.deadline,
      sourceStatus: p.status,
      clientName: p.clientName,
      clientEmail: p.clientEmail,
      syncedAt: new Date(),
    };

    const existing = await prisma.digyoProjectRequest.findUnique({ where: { digyoId: p.id } });

    const row = existing
      ? await prisma.digyoProjectRequest.update({ where: { id: existing.id }, data })
      : await prisma.digyoProjectRequest.create({
          data: { ...data, digyoId: p.id, createdAt: new Date(p.createdAt) },
        });

    results.push(serializeDigyoProjectRequest(row));
  }

  res.json({ synced: results.length, projects: results });
});

router.patch("/:digyoId", async (req, res) => {
  const digyoId = Number(req.params.digyoId);
  const { status } = req.body || {};
  const valid = ["nouveau", "en_cours", "traite", "refuse"];
  if (!valid.includes(status)) {
    return res.status(400).json({ error: `status doit être l'un de : ${valid.join(", ")}.` });
  }

  const existing = await prisma.digyoProjectRequest.findUnique({ where: { digyoId } });
  if (!existing) return res.status(404).json({ error: "Demande introuvable." });

  const updated = await prisma.digyoProjectRequest.update({ where: { id: existing.id }, data: { status } });
  res.json(serializeDigyoProjectRequest(updated));
});

export default router;
