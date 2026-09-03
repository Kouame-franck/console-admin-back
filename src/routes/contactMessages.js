import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeContactMessage } from "../lib/serializers.js";

// Messages du formulaire de contact digyo (voir POST /api/public/contact, relayé depuis
// digyo-site/back/src/server.js). Authentifié comme le reste de la console — ce n'est pas une
// donnée publique.
const router = Router();

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const parPage = Math.min(100, Number(req.query.parPage) || 25);

  const [messages, total, unread] = await Promise.all([
    prisma.contactMessage.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where: { read: false } }),
  ]);

  res.json({ messages: messages.map(serializeContactMessage), total, unread, page, parPage });
});

router.patch("/:id", async (req, res) => {
  const existing = await prisma.contactMessage.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) return res.status(404).json({ error: "Message introuvable." });

  const { read } = req.body || {};
  if (read === undefined) return res.status(400).json({ error: "read requis." });

  const updated = await prisma.contactMessage.update({ where: { id: existing.id }, data: { read: Boolean(read) } });
  res.json(serializeContactMessage(updated));
});

router.delete("/:id", async (req, res) => {
  const existing = await prisma.contactMessage.findUnique({ where: { id: Number(req.params.id) } });
  if (!existing) return res.status(404).json({ error: "Message introuvable." });

  await prisma.contactMessage.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
