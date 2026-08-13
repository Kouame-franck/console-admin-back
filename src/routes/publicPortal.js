import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeOffer, serializeAnnouncement } from "../lib/serializers.js";
import { STATUS_TO_API } from "../lib/mappers.js";
import { publicMutationLimiter } from "../middleware/rateLimit.js";

const router = Router();
const toDateStr = (date) => (date ? date.toISOString().slice(0, 10) : null);
const ANNOUNCEMENT_SLOTS = [2, 3];

function requirePortalKey(req, res, next) {
  const key = req.headers["x-portal-key"];
  if (!key || key !== process.env.SCHOOL_PORTAL_API_KEY) {
    return res.status(401).json({ error: "Non autorisé." });
  }
  next();
}

function serializePlanInfo(establishment) {
  return {
    formule: establishment.offer?.slug ?? null,
    formuleName: establishment.offer?.name ?? null,
    status: STATUS_TO_API[establishment.status],
    validity: {
      start: toDateStr(establishment.validityStart),
      end: toDateStr(establishment.validityEnd),
    },
  };
}

router.get("/offres", async (req, res) => {
  const rows = await prisma.offer.findMany({ where: { active: true }, orderBy: { price: "asc" } });
  res.json(rows.map(serializeOffer));
});

router.get("/etablissements/:sschoolId", requirePortalKey, async (req, res) => {
  const sschoolId = Number(req.params.sschoolId);
  const establishment = await prisma.establishment.findUnique({
    where: { sschoolId },
    include: { offer: true },
  });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  res.json(serializePlanInfo(establishment));
});

router.post("/etablissements/:sschoolId/select-offer", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const sschoolId = Number(req.params.sschoolId);
  const { offerSlug } = req.body || {};
  if (!offerSlug) return res.status(400).json({ error: "offerSlug requis." });

  const establishment = await prisma.establishment.findUnique({ where: { sschoolId } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const offer = await prisma.offer.findUnique({ where: { slug: offerSlug } });
  if (!offer || !offer.active) return res.status(400).json({ error: "Offre invalide ou inactive." });

  const start = new Date();
  const end = new Date(start);
  if (offer.cycle === "mensuel") end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);

  const updated = await prisma.establishment.update({
    where: { id: establishment.id },
    data: { offerId: offer.id, status: "actif", validityStart: start, validityEnd: end },
    include: { offer: true },
  });

  res.json(serializePlanInfo(updated));
});

router.get("/etablissements/:sschoolId/announcements", requirePortalKey, async (req, res) => {
  const sschoolId = Number(req.params.sschoolId);
  const establishment = await prisma.establishment.findUnique({ where: { sschoolId } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const rows = await prisma.announcement.findMany({ where: { establishmentId: establishment.id } });
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  res.json(ANNOUNCEMENT_SLOTS.map((slot) => serializeAnnouncement(bySlot.get(slot), slot)));
});

export default router;
