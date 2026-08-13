import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializePerformanceConfig } from "../lib/serializers.js";

const router = Router();

router.get("/", async (req, res) => {
  const config = await prisma.performanceConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  res.json(serializePerformanceConfig(config));
});

router.patch("/", async (req, res) => {
  const b = req.body || {};
  const data = {};

  if (b.alertThresholds?.cpu !== undefined) data.cpuThreshold = b.alertThresholds.cpu;
  if (b.alertThresholds?.latency !== undefined) data.latencyThreshold = b.alertThresholds.latency;
  if (b.alertThresholds?.storage !== undefined) data.storageThreshold = b.alertThresholds.storage;
  if (b.cacheTTL !== undefined) data.cacheTTL = b.cacheTTL;
  if (b.maxUploadSize !== undefined) data.maxUploadSize = b.maxUploadSize;
  if (b.backupFrequency !== undefined) data.backupFrequency = b.backupFrequency;
  if (b.backupRetention !== undefined) data.backupRetention = b.backupRetention;
  if (b.optimizations?.lazyLoading !== undefined) data.lazyLoading = b.optimizations.lazyLoading;
  if (b.optimizations?.compressImages !== undefined) data.compressImages = b.optimizations.compressImages;
  if (b.optimizations?.cdn !== undefined) data.cdn = b.optimizations.cdn;
  if (b.optimizations?.queryCache !== undefined) data.queryCache = b.optimizations.queryCache;

  const config = await prisma.performanceConfig.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });
  res.json(serializePerformanceConfig(config));
});

export default router;
