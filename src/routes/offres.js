import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeOffer } from "../lib/serializers.js";

const router = Router();

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

router.get("/", async (req, res) => {
  const rows = await prisma.offer.findMany({ orderBy: { price: "asc" } });
  res.json(rows.map(serializeOffer));
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name est requis." });

  const cycle = b.cycle === "mensuel" ? "mensuel" : "annuel";
  // Le mensuel garde le slug "nu" (rétro-compatible avec les établissements déjà abonnés),
  // l'annuel reçoit le suffixe -annuel — stable d'un enregistrement à l'autre, plutôt que le
  // timestamp de secours ci-dessous qui rendrait chaque resauvegarde imprévisible.
  let slug = slugify(b.name);
  if (cycle === "annuel") slug = `${slug}-annuel`;
  const exists = await prisma.offer.findUnique({ where: { slug } });
  if (exists) slug = `${slug}-${Date.now()}`;

  const created = await prisma.offer.create({
    data: {
      slug,
      name: b.name,
      description: b.description || "",
      price: b.price ?? 0,
      cycle,
      studentLimit: b.studentLimit ?? null,
      cursusLimit: b.cursusLimit ?? null,
      teacherLimit: b.teacherLimit ?? null,
      staffLimit: b.staffLimit ?? null,
      roleLimit: b.roleLimit ?? null,
      modules: b.modules ?? [],
      active: b.active ?? true,
      features: b.features ?? [],
    },
  });

  res.status(201).json(serializeOffer(created));
});

router.patch("/:slug", async (req, res) => {
  const existing = await prisma.offer.findUnique({ where: { slug: req.params.slug } });
  if (!existing) return res.status(404).json({ error: "Offre introuvable." });

  const b = req.body || {};
  const data = {};
  if (b.name !== undefined) data.name = b.name;
  if (b.description !== undefined) data.description = b.description;
  if (b.price !== undefined) data.price = b.price;
  if (b.cycle !== undefined) data.cycle = b.cycle === "mensuel" ? "mensuel" : "annuel";
  if (b.studentLimit !== undefined) data.studentLimit = b.studentLimit;
  if (b.cursusLimit !== undefined) data.cursusLimit = b.cursusLimit;
  if (b.teacherLimit !== undefined) data.teacherLimit = b.teacherLimit;
  if (b.staffLimit !== undefined) data.staffLimit = b.staffLimit;
  if (b.roleLimit !== undefined) data.roleLimit = b.roleLimit;
  if (b.modules !== undefined) data.modules = b.modules;
  if (b.active !== undefined) data.active = b.active;
  if (b.features !== undefined) data.features = b.features;

  const updated = await prisma.offer.update({ where: { slug: req.params.slug }, data });
  res.json(serializeOffer(updated));
});

router.delete("/:slug", async (req, res) => {
  const existing = await prisma.offer.findUnique({ where: { slug: req.params.slug } });
  if (!existing) return res.status(404).json({ error: "Offre introuvable." });

  await prisma.establishment.updateMany({ where: { offerId: existing.id }, data: { offerId: null } });
  await prisma.offer.delete({ where: { slug: req.params.slug } });
  res.status(204).end();
});

export default router;
