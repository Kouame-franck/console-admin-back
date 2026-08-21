import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeAddonOffer } from "../lib/serializers.js";

// Offres isolées : services supplémentaires vendus à part de l'abonnement, souscrits depuis
// s-school (Mon abonnement > Services supplémentaires). Catalogue tenu ici, comme les formules.
const router = Router();

// Types de service réellement implémentés côté s-school. En ouvrir un ici sans le code qui va
// avec créerait une offre vendable mais inopérante — la liste reste donc volontairement courte.
const TYPES = ["sms"];

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

router.get("/", async (req, res) => {
  const rows = await prisma.addonOffer.findMany({ orderBy: { price: "asc" } });
  res.json(rows.map(serializeAddonOffer));
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: "name est requis." });
  if (!TYPES.includes(b.type)) {
    return res.status(400).json({ error: `type doit être parmi : ${TYPES.join(", ")}.` });
  }

  let slug = slugify(b.name);
  if (await prisma.addonOffer.findUnique({ where: { slug } })) {
    slug = `${slug}-${Date.now()}`;
  }

  const created = await prisma.addonOffer.create({
    data: {
      slug,
      name: b.name,
      description: b.description || "",
      type: b.type,
      price: b.price ?? 0,
      quantite: b.quantite ?? 0,
      unite: b.unite || "SMS",
      active: b.active ?? true,
      features: b.features ?? [],
    },
  });

  res.status(201).json(serializeAddonOffer(created));
});

router.patch("/:slug", async (req, res) => {
  const b = req.body || {};
  const existing = await prisma.addonOffer.findUnique({ where: { slug: req.params.slug } });
  if (!existing) return res.status(404).json({ error: "Offre introuvable." });

  if (b.type !== undefined && !TYPES.includes(b.type)) {
    return res.status(400).json({ error: `type doit être parmi : ${TYPES.join(", ")}.` });
  }

  // Le slug n'est jamais recalculé sur un renommage : c'est l'identifiant que s-school utilise
  // pour rattacher une souscription. Le changer orphelinerait les établissements déjà servis.
  const updated = await prisma.addonOffer.update({
    where: { slug: req.params.slug },
    data: {
      name: b.name ?? existing.name,
      description: b.description ?? existing.description,
      type: b.type ?? existing.type,
      price: b.price ?? existing.price,
      quantite: b.quantite ?? existing.quantite,
      unite: b.unite ?? existing.unite,
      active: b.active ?? existing.active,
      features: b.features ?? existing.features,
    },
  });

  res.json(serializeAddonOffer(updated));
});

router.delete("/:slug", async (req, res) => {
  const existing = await prisma.addonOffer.findUnique({ where: { slug: req.params.slug } });
  if (!existing) return res.status(404).json({ error: "Offre introuvable." });

  await prisma.addonOffer.delete({ where: { slug: req.params.slug } });
  res.status(204).end();
});

export default router;
