import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { serializeEstablishment, serializeAnnouncement } from "../lib/serializers.js";
import { STATUS_TO_DB } from "../lib/mappers.js";
import { nextCode } from "../lib/codes.js";
import { fetchRealEtablissements } from "../lib/sschoolSync.js";
import { uploadFile, deleteFile, generateFileName } from "../lib/r2.js";

const router = Router();
const includeOffer = { offer: true };
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const ANNOUNCEMENT_SLOTS = [2, 3];

router.get("/", async (req, res) => {
  const rows = await prisma.establishment.findMany({
    include: includeOffer,
    orderBy: { code: "desc" },
  });
  res.json(rows.map(serializeEstablishment));
});

router.post("/sync", async (req, res) => {
  const remote = await fetchRealEtablissements();
  const results = [];

  for (const r of remote) {
    const responsableNom = [r.responsable_nom, r.responsable_prenoms].filter(Boolean).join(" ");
    const data = {
      name: r.nom,
      ville: r.address || "",
      responsableNom: responsableNom || "Non renseigné",
      responsableRole: responsableNom ? "Super_admin" : "",
      responsableTelephone: r.responsable_contact || "",
      responsableEmail: r.responsable_email || "",
      studentCount: r.student_count,
      teacherCount: r.teacher_count,
      cursusCount: r.cursus_count,
      sschoolId: r.id_etablissement,
      syncedAt: new Date(),
    };

    const existing = await prisma.establishment.findUnique({ where: { sschoolId: r.id_etablissement } });

    const row = existing
      ? await prisma.establishment.update({ where: { id: existing.id }, data, include: includeOffer })
      : await prisma.establishment.create({
          data: {
            ...data,
            code: `SSC-${String(r.id_etablissement).padStart(4, "0")}`,
            status: "en_attente",
            createdAt: new Date(r.date_creation),
            validityStart: new Date(),
            validityEnd: new Date(),
            activeModules: [],
          },
          include: includeOffer,
        });

    results.push(serializeEstablishment(row));
  }

  res.json({ synced: results.length, etablissements: results });
});

router.get("/:code", async (req, res) => {
  const row = await prisma.establishment.findUnique({
    where: { code: req.params.code },
    include: includeOffer,
  });
  if (!row) return res.status(404).json({ error: "Établissement introuvable." });
  res.json(serializeEstablishment(row));
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.ville || !b.responsable) {
    return res.status(400).json({ error: "name, ville et responsable sont requis." });
  }

  const code = await nextCode(prisma, "establishment", "SSC");
  let offerId = null;
  if (b.offerId) {
    const offer = await prisma.offer.findUnique({ where: { slug: b.offerId } });
    offerId = offer?.id ?? null;
  }

  const created = await prisma.establishment.create({
    data: {
      code,
      name: b.name,
      ville: b.ville,
      status: STATUS_TO_DB[b.status] ?? "actif",
      createdAt: new Date(),
      responsableNom: b.responsable.nom || "",
      responsableRole: b.responsable.role || "",
      responsableTelephone: b.responsable.telephone || "",
      responsableEmail: b.responsable.email || "",
      offerId,
      validityStart: b.validity?.start ? new Date(b.validity.start) : new Date(),
      validityEnd: b.validity?.end ? new Date(b.validity.end) : new Date(),
      studentCount: b.stats?.etudiants ?? 0,
      teacherCount: b.stats?.enseignants ?? 0,
      cursusCount: b.stats?.cursus ?? 0,
      activeModules: b.activeModules ?? [],
    },
    include: includeOffer,
  });

  res.status(201).json(serializeEstablishment(created));
});

router.patch("/:code", async (req, res) => {
  const existing = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!existing) return res.status(404).json({ error: "Établissement introuvable." });

  const b = req.body || {};
  const data = {};

  if (b.name !== undefined) data.name = b.name;
  if (b.ville !== undefined) data.ville = b.ville;
  if (b.status !== undefined) data.status = STATUS_TO_DB[b.status];
  if (b.responsable) {
    if (b.responsable.nom !== undefined) data.responsableNom = b.responsable.nom;
    if (b.responsable.role !== undefined) data.responsableRole = b.responsable.role;
    if (b.responsable.telephone !== undefined) data.responsableTelephone = b.responsable.telephone;
    if (b.responsable.email !== undefined) data.responsableEmail = b.responsable.email;
  }
  if (b.offerId !== undefined) {
    const offer = b.offerId ? await prisma.offer.findUnique({ where: { slug: b.offerId } }) : null;
    data.offerId = offer?.id ?? null;
  }
  if (b.validity?.start) data.validityStart = new Date(b.validity.start);
  if (b.validity?.end) data.validityEnd = new Date(b.validity.end);
  if (b.stats?.etudiants !== undefined) data.studentCount = b.stats.etudiants;
  if (b.stats?.enseignants !== undefined) data.teacherCount = b.stats.enseignants;
  if (b.stats?.cursus !== undefined) data.cursusCount = b.stats.cursus;

  const updated = await prisma.establishment.update({
    where: { code: req.params.code },
    data,
    include: includeOffer,
  });

  res.json(serializeEstablishment(updated));
});

router.patch("/:code/modules", async (req, res) => {
  const { moduleId, active } = req.body || {};
  if (!moduleId || typeof active !== "boolean") {
    return res.status(400).json({ error: "moduleId (string) et active (boolean) sont requis." });
  }

  const existing = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!existing) return res.status(404).json({ error: "Établissement introuvable." });

  const current = new Set(existing.activeModules);
  if (active) current.add(moduleId);
  else current.delete(moduleId);

  const updated = await prisma.establishment.update({
    where: { code: req.params.code },
    data: { activeModules: [...current] },
    include: includeOffer,
  });

  res.json(serializeEstablishment(updated));
});

router.delete("/:code", async (req, res) => {
  const existing = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!existing) return res.status(404).json({ error: "Établissement introuvable." });

  await prisma.payment.deleteMany({ where: { establishmentId: existing.id } });
  await prisma.announcement.deleteMany({ where: { establishmentId: existing.id } });
  await prisma.establishment.delete({ where: { code: req.params.code } });
  res.status(204).end();
});

router.get("/:code/announcements", async (req, res) => {
  const establishment = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const rows = await prisma.announcement.findMany({ where: { establishmentId: establishment.id } });
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  res.json(ANNOUNCEMENT_SLOTS.map((slot) => serializeAnnouncement(bySlot.get(slot), slot)));
});

router.put("/:code/announcements/:slot", upload.single("image"), async (req, res) => {
  const slot = Number(req.params.slot);
  if (!ANNOUNCEMENT_SLOTS.includes(slot)) {
    return res.status(400).json({ error: "Slot invalide (2 ou 3 uniquement)." });
  }

  const establishment = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const { title, badge, text } = req.body || {};

  const existing = await prisma.announcement.findUnique({
    where: { establishmentId_slot: { establishmentId: establishment.id, slot } },
  });

  let imageKey = existing?.imageKey ?? null;
  if (req.file) {
    const fileName = generateFileName(req.file.originalname, "console-announcements");
    const result = await uploadFile(req.file.buffer, fileName, req.file.mimetype);
    imageKey = result.fileName;
    if (existing?.imageKey) deleteFile(existing.imageKey).catch(() => {});
  }

  if (!title && !badge && !text && !imageKey) {
    return res.status(400).json({ error: "Ajoutez au moins un titre, un texte ou une image." });
  }

  const data = { title: title || null, badge: badge || null, text: text || null, imageKey };
  const updated = existing
    ? await prisma.announcement.update({ where: { id: existing.id }, data })
    : await prisma.announcement.create({ data: { ...data, slot, establishmentId: establishment.id } });

  res.json(serializeAnnouncement(updated, slot));
});

router.delete("/:code/announcements/:slot", async (req, res) => {
  const slot = Number(req.params.slot);
  const establishment = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const existing = await prisma.announcement.findUnique({
    where: { establishmentId_slot: { establishmentId: establishment.id, slot } },
  });
  if (!existing) return res.status(404).json({ error: "Aucune actualité pour ce slot." });

  if (existing.imageKey) deleteFile(existing.imageKey).catch(() => {});
  await prisma.announcement.delete({ where: { id: existing.id } });
  res.status(204).end();
});

export default router;
