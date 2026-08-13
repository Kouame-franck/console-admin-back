import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePayment } from "../lib/serializers.js";
import { PAYMENT_METHOD_TO_DB, PAYMENT_STATUS_TO_DB } from "../lib/mappers.js";
import { nextCode } from "../lib/codes.js";

const router = Router();
const includeEstablishment = { establishment: true };

router.get("/", async (req, res) => {
  const { etablissement, etablissementId, modePaiement, statut, q } = req.query;
  const where = {};

  if (etablissementId) where.establishment = { code: etablissementId };
  else if (etablissement) where.establishment = { name: etablissement };
  if (modePaiement) where.modePaiement = PAYMENT_METHOD_TO_DB[modePaiement];
  if (statut) where.statut = PAYMENT_STATUS_TO_DB[statut];
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { establishment: { name: { contains: q } } },
    ];
  }

  const rows = await prisma.payment.findMany({
    where,
    include: includeEstablishment,
    orderBy: { date: "desc" },
  });
  res.json(rows.map(serializePayment));
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.etablissementId || !b.montantTotal || !b.modePaiement || !b.statut) {
    return res
      .status(400)
      .json({ error: "etablissementId, montantTotal, modePaiement et statut sont requis." });
  }

  const establishment = await prisma.establishment.findUnique({ where: { code: b.etablissementId } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const code = await nextCode(prisma, "payment", "PAY");

  const created = await prisma.payment.create({
    data: {
      code,
      establishmentId: establishment.id,
      formule: b.formule || "",
      montantTotal: b.montantTotal,
      montantVerse: b.montantVerse ?? 0,
      date: b.date ? new Date(b.date) : new Date(),
      modePaiement: PAYMENT_METHOD_TO_DB[b.modePaiement],
      statut: PAYMENT_STATUS_TO_DB[b.statut],
    },
    include: includeEstablishment,
  });

  res.status(201).json(serializePayment(created));
});

router.patch("/:code", async (req, res) => {
  const existing = await prisma.payment.findUnique({ where: { code: req.params.code } });
  if (!existing) return res.status(404).json({ error: "Versement introuvable." });

  const b = req.body || {};
  const data = {};

  if (b.formule !== undefined) data.formule = b.formule;
  if (b.montantTotal !== undefined) data.montantTotal = b.montantTotal;
  if (b.montantVerse !== undefined) data.montantVerse = b.montantVerse;
  if (b.date !== undefined) data.date = new Date(b.date);
  if (b.modePaiement !== undefined) data.modePaiement = PAYMENT_METHOD_TO_DB[b.modePaiement];
  if (b.statut !== undefined) data.statut = PAYMENT_STATUS_TO_DB[b.statut];

  const updated = await prisma.payment.update({
    where: { code: req.params.code },
    data,
    include: includeEstablishment,
  });

  res.json(serializePayment(updated));
});

router.delete("/:code", async (req, res) => {
  const existing = await prisma.payment.findUnique({ where: { code: req.params.code } });
  if (!existing) return res.status(404).json({ error: "Versement introuvable." });

  await prisma.payment.delete({ where: { code: req.params.code } });
  res.status(204).end();
});

export default router;
