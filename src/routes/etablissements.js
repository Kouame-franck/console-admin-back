import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { serializeEstablishment, serializeAnnouncement } from "../lib/serializers.js";
import { STATUS_TO_DB, PAYMENT_METHOD_TO_DB } from "../lib/mappers.js";
import { nextCode } from "../lib/codes.js";
import { fetchRealEtablissements, createRealEtablissement, deleteRealEtablissement } from "../lib/sschoolSync.js";
import { uploadFile, deleteFile, generateFileName } from "../lib/r2.js";
import { calculerPeriode } from "../lib/abonnement.js";
import { MODULES } from "../lib/catalogue.js";

const router = Router();
const includeOffer = { offer: true };
// Audit sécurité (2026-09-03) : cet upload n'avait aucun fileFilter -- n'importe quel type de
// fichier passait (HTML, SVG avec script embarqué...), servi ensuite par R2 avec le Content-Type
// que le navigateur avait bien voulu déclarer. Restreint maintenant aux mêmes formats image que
// le reste de la console (voir blog.js > COVER_MIME_TYPES, sous-ensemble image uniquement ici :
// ces visuels n'accueillent jamais de vidéo).
const ANNOUNCEMENT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!ANNOUNCEMENT_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("Format non supporté. Formats acceptés : JPG, PNG, WebP, GIF."));
    }
    cb(null, true);
  },
});

function handleUploadAnnouncement(req, res, next) {
  upload.single("image")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Fichier trop volumineux (max 5 Mo)." });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

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
  if (!b.name || !b.ville || !b.responsable?.nom || !b.responsable?.email) {
    return res.status(400).json({ error: "name, ville et responsable (nom, email) sont requis." });
  }

  // L'établissement Sschool est la source de vérité : on le provisionne d'abord (établissement
  // + rôle Super_admin + compte, l'année scolaire restant à ouvrir par le client lui-même) pour
  // ne jamais créer de fiche console orpheline qui prétendrait représenter une école qui n'existe
  // pas réellement.
  let sschoolResult;
  try {
    sschoolResult = await createRealEtablissement({
      nom: b.name,
      address: b.ville,
      email: b.responsable.email,
      tel: b.responsable.telephone,
      responsable: {
        nom: b.responsable.nom,
        prenoms: b.responsable.prenoms,
        email: b.responsable.email,
        contact: b.responsable.telephone,
      },
      // Réservé au compte de démonstration (b.demo) : identifiants mémorisables plutôt que
      // l'email du responsable et un mot de passe généré. Absents pour un établissement normal.
      login: b.demo ? b.login : undefined,
      password: b.demo ? b.password : undefined,
    });
  } catch (err) {
    return res.status(502).json({ error: `Création dans Sschool impossible : ${err.message}` });
  }

  const code = await nextCode(prisma, "establishment", "SSC");

  // Une validité par défaut à "maintenant" rendrait l'établissement immédiatement "expiré"
  // aux yeux de sschool (voir getStatutAbonnement côté sschool, qui croise statut + date) —
  // donc pas réellement utilisable malgré le compte créé. Avec une offre choisie, on active
  // sa première période comme le fait /renouveler (même calcul, même trace de paiement) ;
  // sans offre, un essai de 14 jours en attendant qu'un abonnement soit choisi.
  let offerId = null;
  let activeModules = [];
  let validityStart = new Date();
  let validityEnd = new Date();
  let offer = null;
  let montant = 0;
  const quantite = b.quantite ?? 1;

  if (b.demo) {
    // Compte de démonstration : jamais rattaché à une formule (rien à facturer, rien à
    // renouveler), et une validité portée loin dans le futur plutôt qu'un essai de 14 jours —
    // c'est cette date, et elle seule, que sschool regarde pour décider si le compte est actif
    // (voir getStatutAbonnement côté sschool), donc "n'expire jamais" en pratique. Sans offre,
    // les limites (élèves, enseignants...) sont déjà illimitées par convention (voir
    // serializePlanInfo — null = "Illimité") ; seuls les modules ont besoin d'être activés à
    // la main, puisqu'ils viennent normalement de `offer.modules`, absent ici.
    validityEnd = new Date("2099-12-31");
    activeModules = MODULES.map((m) => m.id);
  } else if (b.offerId) {
    offer = await prisma.offer.findUnique({ where: { slug: b.offerId } });
    if (offer) {
      offerId = offer.id;
      activeModules = offer.modules ?? [];
      const periode = calculerPeriode(offer, quantite);
      validityStart = periode.start;
      validityEnd = periode.end;
      montant = periode.montant;
    }
  } else {
    validityEnd.setDate(validityEnd.getDate() + 14);
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
      validityStart,
      validityEnd,
      studentCount: b.stats?.etudiants ?? 0,
      teacherCount: b.stats?.enseignants ?? 0,
      cursusCount: b.stats?.cursus ?? 0,
      activeModules,
      sschoolId: sschoolResult.id_etablissement,
      syncedAt: new Date(),
    },
    include: includeOffer,
  });

  let paiement = null;
  if (offer && montant > 0) {
    const paymentCode = await nextCode(prisma, "payment", "PAY");
    const payment = await prisma.payment.create({
      data: {
        code: paymentCode,
        establishmentId: created.id,
        formule: offer.name,
        montantTotal: montant,
        montantVerse: montant,
        date: validityStart,
        modePaiement: PAYMENT_METHOD_TO_DB[b.modePaiement] ?? "especes",
        statut: "paye",
      },
    });
    paiement = { reference: payment.code, montant, modePaiement: b.modePaiement ?? "Espèces" };
  }

  res.status(201).json({ ...serializeEstablishment(created), sschoolAdmin: sschoolResult.admin, paiement });
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

  // Suppression réelle côté Sschool d'abord (établissement + toutes ses données : élèves,
  // notes, personnel...) — voir sschoolSync.js. On ne retire la fiche console qu'une fois
  // celle-ci confirmée, pour ne jamais désynchroniser la console d'une école qui existe
  // toujours réellement si cet appel échoue.
  if (existing.sschoolId) {
    try {
      await deleteRealEtablissement(existing.sschoolId);
    } catch (err) {
      return res.status(502).json({ error: `Suppression dans Sschool impossible : ${err.message}` });
    }
  }

  await prisma.payment.deleteMany({ where: { establishmentId: existing.id } });
  await prisma.announcement.deleteMany({ where: { establishmentId: existing.id } });
  await prisma.establishment.delete({ where: { code: req.params.code } });
  res.status(204).end();
});

// Pendant console du select-offer public de sschool, mais pour un paiement physique saisi par
// un agent (espèces, chèque, virement, mobile money ou carte au comptoir) plutôt qu'un achat en
// libre-service — mêmes effets (établissement activé/prolongé + versement tracé), même route
// pour "prolonger" (offerSlug identique à l'offre en cours) ou "changer d'offre" (offerSlug
// différent), le bouton de l'UI choisit juste le libellé.
router.post("/:code/renouveler", async (req, res) => {
  const { offerSlug, quantite, modePaiement } = req.body || {};
  if (!offerSlug) return res.status(400).json({ error: "offerSlug requis." });

  const establishment = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const offer = await prisma.offer.findUnique({ where: { slug: offerSlug } });
  if (!offer || !offer.active) return res.status(400).json({ error: "Offre invalide ou inactive." });

  const { start, end, montant } = calculerPeriode(offer, quantite);

  const updated = await prisma.establishment.update({
    where: { id: establishment.id },
    data: {
      offerId: offer.id,
      status: "actif",
      validityStart: start,
      validityEnd: end,
      activeModules: offer.modules ?? [],
    },
    include: includeOffer,
  });

  const code = await nextCode(prisma, "payment", "PAY");
  const paiement = await prisma.payment.create({
    data: {
      code,
      establishmentId: establishment.id,
      formule: offer.name,
      montantTotal: montant,
      montantVerse: montant,
      date: start,
      modePaiement: PAYMENT_METHOD_TO_DB[modePaiement] ?? "especes",
      statut: "paye",
    },
  });

  res.json({
    etablissement: serializeEstablishment(updated),
    paiement: {
      reference: paiement.code,
      montant,
      modePaiement: modePaiement ?? "Espèces",
      date: start.toISOString(),
    },
  });
});

router.get("/:code/announcements", async (req, res) => {
  const establishment = await prisma.establishment.findUnique({ where: { code: req.params.code } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const rows = await prisma.announcement.findMany({ where: { establishmentId: establishment.id } });
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  res.json(ANNOUNCEMENT_SLOTS.map((slot) => serializeAnnouncement(bySlot.get(slot), slot)));
});

router.put("/:code/announcements/:slot", handleUploadAnnouncement, async (req, res) => {
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
    const fileName = generateFileName(req.file.mimetype, "console-announcements");
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
