import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeSupportConversation } from "../lib/serializers.js";

// Chat d'assistance digyo (voir routes/publicPortal.js > /support/messages, alimenté par
// digyo-site/back/src/routes/support.js). Authentifié comme le reste de la console.
const router = Router();

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const parPage = Math.min(100, Number(req.query.parPage) || 25);

  const [conversations, total, unread] = await Promise.all([
    prisma.supportConversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.supportConversation.count(),
    prisma.supportConversation.count({ where: { unreadForStaff: true } }),
  ]);

  res.json({
    conversations: conversations.map((c) => ({
      ...serializeSupportConversation(c),
      lastMessage: c.messages[0]?.text ?? null,
    })),
    total,
    unread,
    page,
    parPage,
  });
});

router.get("/:id", async (req, res) => {
  const conversation = await prisma.supportConversation.findUnique({
    where: { id: Number(req.params.id) },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });

  if (conversation.unreadForStaff) {
    await prisma.supportConversation.update({ where: { id: conversation.id }, data: { unreadForStaff: false } });
  }

  res.json(serializeSupportConversation(conversation));
});

router.post("/:id/messages", async (req, res) => {
  const conversation = await prisma.supportConversation.findUnique({ where: { id: Number(req.params.id) } });
  if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });

  const text = (req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "text requis." });

  await prisma.supportMessage.create({ data: { conversationId: conversation.id, from: "staff", text } });
  const updated = await prisma.supportConversation.update({
    where: { id: conversation.id },
    data: { unreadForVisitor: true, lastMessageAt: new Date() },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  res.status(201).json(serializeSupportConversation(updated));
});

router.patch("/:id", async (req, res) => {
  const conversation = await prisma.supportConversation.findUnique({ where: { id: Number(req.params.id) } });
  if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });

  const { status } = req.body || {};
  if (!["open", "resolved"].includes(status)) {
    return res.status(400).json({ error: "status doit être 'open' ou 'resolved'." });
  }

  const updated = await prisma.supportConversation.update({ where: { id: conversation.id }, data: { status } });
  res.json(serializeSupportConversation(updated));
});

export default router;
