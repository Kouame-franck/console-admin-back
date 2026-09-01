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
    transactionId: p.transactionId ?? null,
    etablissementId: p.establishment?.code ?? null,
    etablissement: p.establishment?.name ?? null,
    // Contact du responsable de l'établissement, utile pour joindre l'école en cas de litige
    // ou de paiement inachevé — voir PaiementDetailsModal côté console.
    responsable: p.establishment
      ? {
          nom: p.establishment.responsableNom,
          telephone: p.establishment.responsableTelephone,
          email: p.establishment.responsableEmail,
        }
      : null,
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
    cursusLimit: o.cursusLimit,
    teacherLimit: o.teacherLimit,
    staffLimit: o.staffLimit,
    roleLimit: o.roleLimit,
    modules: o.modules ?? [],
    active: o.active,
    features: o.features,
  };
}

// Offre isolee (service supplementaire vendu a part de l'abonnement). Meme convention que
// serializeOffer : `id` porte le slug, pas la cle technique, pour que les consommateurs
// (s-school, digyo) ne dependent jamais des identifiants internes de la console.
export function serializeAddonOffer(a) {
  return {
    id: a.slug,
    name: a.name,
    description: a.description,
    type: a.type,
    price: a.price,
    quantite: a.quantite,
    unite: a.unite,
    active: a.active,
    features: a.features ?? [],
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

export function serializeDigyoProjectRequest(p) {
  return {
    id: p.id,
    digyoId: p.digyoId,
    title: p.title,
    pillar: p.pillar,
    description: p.description,
    budgetRange: p.budgetRange,
    deadline: p.deadline,
    sourceStatus: p.sourceStatus,
    status: p.status,
    client: { name: p.clientName, email: p.clientEmail },
    createdAt: toDateStr(p.createdAt),
    syncedAt: p.syncedAt ? p.syncedAt.toISOString() : null,
  };
}

export function serializeBlogPost(b) {
  return {
    slug: b.slug,
    title: b.title,
    category: b.category,
    excerpt: b.excerpt,
    date: toDateStr(b.date),
    readTime: b.readTime,
    author: b.author,
    icon: b.icon,
    image: b.image,
    coverType: b.coverType,
    body: b.body,
    published: b.published,
    updatedAt: b.updatedAt.toISOString(),
  };
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
