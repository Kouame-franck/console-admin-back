import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { PAYMENT_STATUS_TO_API } from "../lib/mappers.js";

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

// Série quotidienne générique pour les 30 derniers jours (jours à 0 inclus, sinon le graphe
// sauterait les jours sans activité au lieu de creuser jusqu'à zéro) -- `reducer` agrège les
// lignes tombées ce jour-là (compte d'uniques pour le trafic, somme pour un revenu...).
function buildDailySeries(now, days, rows, dateOf, reducer) {
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const key = startOfDay(new Date(now.getTime() - i * DAY_MS)).toISOString().slice(0, 10);
    buckets.set(key, []);
  }
  for (const row of rows) {
    const key = startOfDay(dateOf(row)).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.get(key).push(row);
  }
  return Array.from(buckets.entries()).map(([date, rowsForDay]) => ({ date, value: reducer(rowsForDay) }));
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

  const trendChart = buildDailySeries(
    now,
    30,
    pageViewsLast30,
    (v) => v.createdAt,
    (rows) => new Set(rows.map((r) => r.visitorId)).size
  );

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

  res.json({ stats, activity, trend: trendChart, trendLabel: "Visiteurs uniques par jour", trendUnit: "visiteur" });
});

// Chiffres réels du projet sschool : établissements actifs, élèves inscrits, revenu encaissé (les
// vrais versements enregistrés en console, voir Payment) et abonnements arrivant à échéance --
// plus une courbe de revenu quotidien et un fil d'activité (nouveaux établissements, paiements).
router.get("/sschool", async (req, res) => {
  const now = new Date();
  const start30 = new Date(now.getTime() - 30 * DAY_MS);
  const start60 = new Date(now.getTime() - 60 * DAY_MS);
  const in30Days = new Date(now.getTime() + 30 * DAY_MS);

  const [
    activeCount,
    studentsAgg,
    paymentsLast30,
    paymentsPrev30,
    renewalsCount,
    recentEstablishments,
    recentPayments,
  ] = await Promise.all([
    prisma.establishment.count({ where: { status: "actif" } }),
    prisma.establishment.aggregate({ where: { status: "actif" }, _sum: { studentCount: true } }),
    prisma.payment.findMany({ where: { date: { gte: start30 } } }),
    prisma.payment.findMany({ where: { date: { gte: start60, lt: start30 } } }),
    prisma.establishment.count({ where: { validityEnd: { gte: now, lte: in30Days } } }),
    prisma.establishment.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.payment.findMany({ orderBy: { date: "desc" }, take: 5, include: { establishment: true } }),
  ]);

  const revenue30 = paymentsLast30.reduce((sum, p) => sum + p.montantVerse, 0);
  const revenuePrev30 = paymentsPrev30.reduce((sum, p) => sum + p.montantVerse, 0);
  const revenueDelta = pctDelta(revenue30, revenuePrev30);

  const stats = [
    { label: "Établissements actifs", value: String(activeCount), delta: null, trend: "flat" },
    {
      label: "Élèves inscrits",
      value: (studentsAgg._sum.studentCount ?? 0).toLocaleString("fr-FR"),
      delta: null,
      trend: "flat",
    },
    {
      label: "Revenu encaissé (30j)",
      value: `${revenue30.toLocaleString("fr-FR")} F`,
      delta: formatDelta(revenueDelta),
      trend: trendFor(revenueDelta),
    },
    {
      label: "Abonnements à renouveler (30j)",
      value: String(renewalsCount),
      delta: null,
      trend: renewalsCount > 0 ? "up" : "flat",
    },
  ];

  const trendChart = buildDailySeries(
    now,
    30,
    paymentsLast30,
    (p) => p.date,
    (rows) => rows.reduce((sum, p) => sum + p.montantVerse, 0)
  );

  const activity = [
    ...recentEstablishments.map((e) => ({
      id: `establishment-${e.id}`,
      text: `Nouvel établissement activé : ${e.name}`,
      date: e.createdAt,
      type: "establishment",
    })),
    ...recentPayments.map((p) => ({
      id: `payment-${p.id}`,
      text: `Paiement de ${p.montantVerse.toLocaleString("fr-FR")} F reçu -- ${p.establishment.name} (${PAYMENT_STATUS_TO_API[p.statut]})`,
      date: p.date,
      type: "payment",
    })),
  ]
    .sort((a, b) => b.date - a.date)
    .slice(0, 8)
    .map(({ id, text, type, date }) => ({ id, text, type, time: date.toISOString() }));

  res.json({ stats, activity, trend: trendChart, trendLabel: "Revenu encaissé par jour", trendUnit: "F" });
});

export default router;
