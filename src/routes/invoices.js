import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeInvoice } from "../lib/serializers.js";
import { nextCode } from "../lib/codes.js";

const router = Router();
const withItems = { items: { orderBy: { id: "asc" } }, quote: true };

function sanitizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw Object.assign(new Error("Au moins une ligne est requise."), { status: 400 });
  }
  return items.map((it) => {
    const description = (it.description || "").trim();
    if (!description) throw Object.assign(new Error("Chaque ligne doit avoir une désignation."), { status: 400 });
    return {
      description,
      quantity: Number(it.quantity) || 1,
      unitPrice: Number(it.unitPrice) || 0,
    };
  });
}

router.get("/", async (req, res) => {
  const { status, q } = req.query;
  const where = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { code: { contains: q } },
      { clientName: { contains: q } },
      { clientCompany: { contains: q } },
    ];
  }

  const rows = await prisma.invoice.findMany({ where, include: withItems, orderBy: { issuedAt: "desc" } });
  res.json(rows.map(serializeInvoice));
});

router.get("/:code", async (req, res) => {
  const invoice = await prisma.invoice.findUnique({ where: { code: req.params.code }, include: withItems });
  if (!invoice) return res.status(404).json({ error: "Facture introuvable." });
  res.json(serializeInvoice(invoice));
});

// Facture créée directement, sans devis préalable -- ex. prestation ponctuelle ou mensualité de
// maintenance qui ne passe pas par un devis. Voir aussi routes/quotes.js > POST /:code/convert
// pour une facture issue d'un devis accepté.
router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.clientName?.trim()) return res.status(400).json({ error: "Le nom du client est requis." });

  let items;
  try {
    items = sanitizeItems(b.items);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const code = await nextCode(prisma, "invoice", "FACT");
  const created = await prisma.invoice.create({
    data: {
      code,
      clientName: b.clientName.trim(),
      clientCompany: b.clientCompany || null,
      clientEmail: b.clientEmail || null,
      clientPhone: b.clientPhone || null,
      clientAddress: b.clientAddress || null,
      object: b.object || null,
      paymentTerms: b.paymentTerms || null,
      notes: b.notes || null,
      issuedAt: b.issuedAt ? new Date(b.issuedAt) : new Date(),
      items: { create: items },
    },
    include: withItems,
  });

  res.status(201).json(serializeInvoice(created));
});

router.patch("/:code", async (req, res) => {
  const existing = await prisma.invoice.findUnique({ where: { code: req.params.code } });
  if (!existing) return res.status(404).json({ error: "Facture introuvable." });

  const b = req.body || {};
  const data = {};
  if (b.status !== undefined) {
    data.status = b.status;
    if (b.status === "payee" && !existing.paidAt) data.paidAt = new Date();
    if (b.status !== "payee") data.paidAt = null;
  }
  if (b.notes !== undefined) data.notes = b.notes || null;
  if (b.paymentTerms !== undefined) data.paymentTerms = b.paymentTerms || null;

  // Une facture déjà payée ne se corrige plus en profondeur (client, lignes) -- seul son statut
  // peut encore changer, pour ne pas faire varier un montant facturé/payé après coup sans trace.
  if (existing.status !== "payee") {
    if (b.clientName !== undefined) data.clientName = b.clientName.trim();
    if (b.clientCompany !== undefined) data.clientCompany = b.clientCompany || null;
    if (b.clientEmail !== undefined) data.clientEmail = b.clientEmail || null;
    if (b.clientPhone !== undefined) data.clientPhone = b.clientPhone || null;
    if (b.clientAddress !== undefined) data.clientAddress = b.clientAddress || null;
    if (b.object !== undefined) data.object = b.object || null;
    if (b.issuedAt !== undefined) data.issuedAt = new Date(b.issuedAt);

    if (b.items !== undefined) {
      let items;
      try {
        items = sanitizeItems(b.items);
      } catch (err) {
        return res.status(err.status || 400).json({ error: err.message });
      }
      await prisma.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      data.items = { create: items };
    }
  }

  const updated = await prisma.invoice.update({ where: { id: existing.id }, data, include: withItems });
  res.json(serializeInvoice(updated));
});

router.delete("/:code", async (req, res) => {
  const existing = await prisma.invoice.findUnique({ where: { code: req.params.code } });
  if (!existing) return res.status(404).json({ error: "Facture introuvable." });

  await prisma.invoice.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
