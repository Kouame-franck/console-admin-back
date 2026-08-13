import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePricingSettings } from "../lib/serializers.js";

const router = Router();

router.get("/", async (req, res) => {
  const settings = await prisma.pricingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  res.json(serializePricingSettings(settings));
});

router.patch("/", async (req, res) => {
  const b = req.body || {};
  const data = {};
  if (b.devise !== undefined) data.devise = b.devise;
  if (b.cycleParDefaut !== undefined) data.cycleParDefaut = b.cycleParDefaut === "mensuel" ? "mensuel" : "annuel";

  const settings = await prisma.pricingSettings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json(serializePricingSettings(settings));
});

export default router;
