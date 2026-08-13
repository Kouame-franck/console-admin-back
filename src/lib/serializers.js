import { STATUS_TO_API, PAYMENT_METHOD_TO_API, PAYMENT_STATUS_TO_API } from "./mappers.js";
import { getPublicUrl } from "./r2.js";

const toDateStr = (date) => (date ? date.toISOString().slice(0, 10) : null);

export function serializeEstablishment(e) {
  return {
    id: e.code,
    name: e.name,
    ville: e.ville,
    status: STATUS_TO_API[e.status],
    createdAt: toDateStr(e.createdAt),
    responsable: {
      nom: e.responsableNom,
      role: e.responsableRole,
      telephone: e.responsableTelephone,
      email: e.responsableEmail,
    },
    formule: e.offer?.name ?? null,
    offerId: e.offer?.slug ?? null,
    cycle: e.offer?.cycle ?? null,
    validity: { start: toDateStr(e.validityStart), end: toDateStr(e.validityEnd) },
    stats: { etudiants: e.studentCount, enseignants: e.teacherCount, cursus: e.cursusCount },
    activeModules: e.activeModules,
  };
}

export function serializePayment(p) {
  return {
    id: p.code,
    etablissementId: p.establishment?.code ?? null,
    etablissement: p.establishment?.name ?? null,
    formule: p.formule,
    montantTotal: p.montantTotal,
    montantVerse: p.montantVerse,
    date: toDateStr(p.date),
    modePaiement: PAYMENT_METHOD_TO_API[p.modePaiement],
    statut: PAYMENT_STATUS_TO_API[p.statut],
  };
}

export function serializeOffer(o) {
  return {
    id: o.slug,
    name: o.name,
    description: o.description,
    price: o.price,
    cycle: o.cycle,
    studentLimit: o.studentLimit,
    active: o.active,
    features: o.features,
  };
}

export function serializeAnnouncement(a, slot) {
  if (!a) return { slot, title: "", badge: "", text: "", imageUrl: null };
  return {
    slot: a.slot,
    title: a.title ?? "",
    badge: a.badge ?? "",
    text: a.text ?? "",
    imageUrl: getPublicUrl(a.imageKey),
  };
}

export function serializePricingSettings(s) {
  return { devise: s.devise, cycleParDefaut: s.cycleParDefaut };
}

export function serializePerformanceConfig(c) {
  return {
    alertThresholds: { cpu: c.cpuThreshold, latency: c.latencyThreshold, storage: c.storageThreshold },
    cacheTTL: c.cacheTTL,
    maxUploadSize: c.maxUploadSize,
    backupFrequency: c.backupFrequency,
    backupRetention: c.backupRetention,
    optimizations: {
      lazyLoading: c.lazyLoading,
      compressImages: c.compressImages,
      cdn: c.cdn,
      queryCache: c.queryCache,
    },
  };
}
