import { Router } from "express";
import { prisma } from "../lib/prisma.js";

// Liste, côté console, de toutes les personnes ayant demandé l'accès au compte test s-school
// (voir POST /api/public/demo/acceder). Authentifié comme le reste de la console — ce n'est
// pas une donnée publique.
const router = Router();

router.get("/", async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const parPage = Math.min(100, Number(req.query.parPage) || 25);

  const [leads, total] = await Promise.all([
    prisma.demoLead.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * parPage,
      take: parPage,
    }),
    prisma.demoLead.count(),
  ]);

  res.json({ leads, total, page, parPage });
});

export default router;
