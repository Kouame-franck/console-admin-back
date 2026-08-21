import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import authRoutes from "./auth.js";
import etablissementsRoutes from "./etablissements.js";
import abonnementsRoutes from "./abonnements.js";
import offresRoutes from "./offres.js";
import addonsRoutes from "./addons.js";
import demoLeadsRoutes from "./demoLeads.js";
import pricingSettingsRoutes from "./pricingSettings.js";
import performanceConfigRoutes from "./performanceConfig.js";
import publicPortalRoutes from "./publicPortal.js";
import digyoProjectsRoutes from "./digyoProjects.js";
import blogRoutes from "./blog.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

router.use("/auth", authRoutes);
router.use("/etablissements", requireAuth, etablissementsRoutes);
router.use("/abonnements", requireAuth, abonnementsRoutes);
router.use("/offres", requireAuth, offresRoutes);
router.use("/addons", requireAuth, addonsRoutes);
router.use("/demo-leads", requireAuth, demoLeadsRoutes);
router.use("/pricing-settings", requireAuth, pricingSettingsRoutes);
router.use("/performance-config", requireAuth, performanceConfigRoutes);
router.use("/digyo-projects", requireAuth, digyoProjectsRoutes);
router.use("/blog", requireAuth, blogRoutes);
router.use("/public", publicPortalRoutes);

export default router;
