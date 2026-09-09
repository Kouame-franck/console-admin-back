import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function sumInvoiceItems(items) {
  return items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
}

// null quand la période précédente est à 0 -- un delta n'a pas de sens face à un point de départ
// nul (ça donnerait +Infinity% ou masquerait une vraie première activité).
function pctDelta(current, previous) {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function trendFor(delta) {
  if (delta === null) return "flat";
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

function formatDelta(delta) {
  return delta === null ? null : `${delta >= 0 ? "+" : ""}${delta}%`;
}

// Chiffres réels du projet digyo (voir DigyoDashboard.jsx côté front) : revenu facturé,
// pipeline de devis, messages en attente, trafic du site -- plus une courbe de visites et un
// fil d'activité fusionnant les sources qui alimentaient jusqu'ici la maquette statique de
// data/projects.js. Le trafic (PageView) ne remonte que depuis la mise en place de ce suivi :
// pas d'historique avant son déploiement.
router.get("/digyo", async (req, res) => {
  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * DAY_MS);
  const start60 = new Date(now.getTime() - 60 * DAY_MS);

  const [
    paidInvoicesLast30,
    paidInvoicesPrev30,
    pendingQuotesCount,
    unreadContactCount,
    unreadChatCount,
    pageViewsLast30,
    pageViewsPrev30,
    recentContacts,
    recentProjectRequests,
    recentDiagnostics,
    recentDemoLeads,
    recentPaidInvoices,
  ] = await Promise.all([
    prisma.invoice.findMany({ where: { status: "payee", paidAt: { gte: start30 } }, include: { items: true } }),
    prisma.invoice.findMany({
      where: { status: "payee", paidAt: { gte: start60, lt: start30 } },
      include: { items: true },
    }),
    prisma.quote.count({ where: { status: { in: ["brouillon", "envoye"] } } }),
    prisma.contactMessage.count({ where: { read: false } }),
    prisma.supportConversation.count({ where: { unreadForStaff: true } }),
    prisma.pageView.findMany({ where: { createdAt: { gte: start30 } }, select: { createdAt: true, visitorId: true } }),
    prisma.pageView.findMany({ where: { createdAt: { gte: start60, lt: start30 } }, select: { visitorId: true } }),
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.digyoProjectRequest.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.diagnosticRequest.findMany({ orderBy: { requestedAt: "desc" }, take: 5 }),
    prisma.demoLead.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.invoice.findMany({ where: { status: "payee" }, orderBy: { paidAt: "desc" }, take: 5 }),
  ]);

  const revenue30 = paidInvoicesLast30.reduce((sum, inv) => sum + sumInvoiceItems(inv.items), 0);
  const revenuePrev30 = paidInvoicesPrev30.reduce((sum, inv) => sum + sumInvoiceItems(inv.items), 0);
  const revenueDelta = pctDelta(revenue30, revenuePrev30);

  const uniqueVisitors30 = new Set(pageViewsLast30.map((v) => v.visitorId)).size;
  const uniqueVisitorsPrev30 = new Set(pageViewsPrev30.map((v) => v.visitorId)).size;
  const visitorsDelta = pctDelta(uniqueVisitors30, uniqueVisitorsPrev30);

  const unreadMessages = unreadContactCount + unreadChatCount;

  const stats = [
    {
      label: "Revenu facturé (30j)",
      value: `${revenue30.toLocaleString("fr-FR")} F`,
      delta: formatDelta(revenueDelta),
      trend: trendFor(revenueDelta),
    },
    { label: "Devis en attente", value: String(pendingQuotesCount), delta: null, trend: "flat" },
    {
      label: "Messages non lus",
      value: String(unreadMessages),
      delta: null,
      trend: unreadMessages > 0 ? "up" : "flat",
    },
    {
      label: "Visiteurs (30j)",
      value: uniqueVisitors30.toLocaleString("fr-FR"),
      delta: formatDelta(visitorsDelta),
      trend: trendFor(visitorsDelta),
    },
  ];

  // Visiteurs uniques par jour sur les 30 derniers jours, jours à 0 inclus (sinon le graphe
  // sauterait les jours sans visite au lieu de creuser jusqu'à zéro).
  const dayBuckets = new Map();
  for (let i = 29; i >= 0; i--) {
    const key = startOfDay(new Date(now.getTime() - i * DAY_MS)).toISOString().slice(0, 10);
    dayBuckets.set(key, new Set());
  }
  for (const view of pageViewsLast30) {
    const key = startOfDay(view.createdAt).toISOString().slice(0, 10);
    if (dayBuckets.has(key)) dayBuckets.get(key).add(view.visitorId);
  }
  const visits = Array.from(dayBuckets.entries()).map(([date, visitors]) => ({ date, visits: visitors.size }));

  const activity = [
    ...recentContacts.map((m) => ({
      id: `contact-${m.id}`,
      text: `Nouveau message de contact de ${m.name}`,
      date: m.createdAt,
      type: "contact",
    })),
    ...recentProjectRequests.map((p) => ({
      id: `project-${p.id}`,
      text: `Nouvelle demande de projet : « ${p.title} »`,
      date: p.createdAt,
      type: "project",
    })),
    ...recentDiagnostics.map((d) => ({
      id: `diagnostic-${d.id}`,
      text: `Demande de diagnostic approfondi de ${d.clientName}`,
      date: d.requestedAt,
      type: "diagnostic",
    })),
    ...recentDemoLeads.map((l) => ({
      id: `demo-${l.id}`,
      text: `Demande d'accès démo s-school de ${l.nom}`,
      date: l.createdAt,
      type: "demo",
    })),
    ...recentPaidInvoices
      .filter((i) => i.paidAt)
      .map((i) => ({
        id: `invoice-${i.id}`,
        text: `Facture ${i.code} payée par ${i.clientName}`,
        date: i.paidAt,
        type: "payment",
      })),
  ]
    .sort((a, b) => b.date - a.date)
    .slice(0, 8)
    .map(({ id, text, type, date }) => ({ id, text, type, time: date.toISOString() }));

  res.json({ stats, activity, visits });
});

export default router;
