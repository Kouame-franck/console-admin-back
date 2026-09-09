import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeQuote, serializeInvoice } from "../lib/serializers.js";
import { nextCode } from "../lib/codes.js";

const router = Router();
const withItems = { items: { orderBy: { id: "asc" } }, invoice: true };

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

  const rows = await prisma.quote.findMany({ where, include: withItems, orderBy: { issuedAt: "desc" } });
  res.json(rows.map(serializeQuote));
});

router.get("/:code", async (req, res) => {
  const quote = await prisma.quote.findUnique({ where: { code: req.params.code }, include: withItems });
  if (!quote) return res.status(404).json({ error: "Devis introuvable." });
  res.json(serializeQuote(quote));
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.clientName?.trim()) return res.status(400).json({ error: "Le nom du client est requis." });

  let items;
  try {
    items = sanitizeItems(b.items);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const code = await nextCode(prisma, "quote", "DEV");
  const created = await prisma.quote.create({
    data: {
      code,
      clientName: b.clientName.trim(),
      clientCompany: b.clientCompany || null,
      clientEmail: b.clientEmail || null,
      clientPhone: b.clientPhone || null,
      clientAddress: b.clientAddress || null,
      object: b.object || null,
      validityDays: b.validityDays ? Number(b.validityDays) : 30,
      paymentTerms: b.paymentTerms || null,
      notes: b.notes || null,
      issuedAt: b.issuedAt ? new Date(b.issuedAt) : new Date(),
      items: { create: items },
    },
    include: withItems,
  });

  res.status(201).json(serializeQuote(created));
});

router.patch("/:code", async (req, res) => {
  const existing = await prisma.quote.findUnique({ where: { code: req.params.code }, include: { invoice: true } });
  if (!existing) return res.status(404).json({ error: "Devis introuvable." });
  // Une fois converti, seule la facture générée fait foi -- voir POST /:code/convert.
  if (existing.invoice) {
    return res.status(409).json({ error: "Ce devis a déjà été converti en facture, il ne peut plus être modifié." });
  }

  const b = req.body || {};
  const data = {};
  if (b.clientName !== undefined) data.clientName = b.clientName.trim();
  if (b.clientCompany !== undefined) data.clientCompany = b.clientCompany || null;
  if (b.clientEmail !== undefined) data.clientEmail = b.clientEmail || null;
  if (b.clientPhone !== undefined) data.clientPhone = b.clientPhone || null;
  if (b.clientAddress !== undefined) data.clientAddress = b.clientAddress || null;
  if (b.object !== undefined) data.object = b.object || null;
  if (b.validityDays !== undefined) data.validityDays = Number(b.validityDays) || 30;
  if (b.paymentTerms !== undefined) data.paymentTerms = b.paymentTerms || null;
  if (b.notes !== undefined) data.notes = b.notes || null;
  if (b.status !== undefined) data.status = b.status;
  if (b.issuedAt !== undefined) data.issuedAt = new Date(b.issuedAt);

  if (b.items !== undefined) {
    let items;
    try {
      items = sanitizeItems(b.items);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
    await prisma.quoteItem.deleteMany({ where: { quoteId: existing.id } });
    data.items = { create: items };
  }

  const updated = await prisma.quote.update({ where: { id: existing.id }, data, include: withItems });
  res.json(serializeQuote(updated));
});

router.delete("/:code", async (req, res) => {
  const existing = await prisma.quote.findUnique({ where: { code: req.params.code }, include: { invoice: true } });
  if (!existing) return res.status(404).json({ error: "Devis introuvable." });
  if (existing.invoice) {
    return res.status(409).json({ error: "Ce devis a déjà été converti en facture." });
  }

  await prisma.quote.delete({ where: { id: existing.id } });
  res.status(204).end();
});

// Transforme un devis en facture : copie client + lignes, verrouille le devis (voir PATCH/DELETE
// ci-dessus) puisque Invoice.quoteId est unique -- un devis ne se convertit qu'une fois.
router.post("/:code/convert", async (req, res) => {
  const quote = await prisma.quote.findUnique({
    where: { code: req.params.code },
    include: { items: true, invoice: true },
  });
  if (!quote) return res.status(404).json({ error: "Devis introuvable." });
  if (quote.invoice) return res.status(409).json({ error: "Ce devis a déjà été converti en facture." });

  const invoiceCode = await nextCode(prisma, "invoice", "FACT");

  const [invoice] = await prisma.$transaction([
    prisma.invoice.create({
      data: {
        code: invoiceCode,
        quoteId: quote.id,
        clientName: quote.clientName,
        clientCompany: quote.clientCompany,
        clientEmail: quote.clientEmail,
        clientPhone: quote.clientPhone,
        clientAddress: quote.clientAddress,
        object: quote.object,
        paymentTerms: quote.paymentTerms,
        notes: quote.notes,
        items: {
          create: quote.items.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
        },
      },
      include: { items: { orderBy: { id: "asc" } }, quote: true },
    }),
    prisma.quote.update({ where: { id: quote.id }, data: { status: "accepte" } }),
  ]);

  res.status(201).json(serializeInvoice(invoice));
});

export default router;
