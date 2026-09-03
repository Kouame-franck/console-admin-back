import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import {
  serializeOffer,
  serializeAddonOffer,
  serializeAnnouncement,
  serializeEstablishment,
  serializeBlogPost,
  serializeBlogComment,
  serializeSupportConversation,
} from "../lib/serializers.js";
import { STATUS_TO_API } from "../lib/mappers.js";
import { publicMutationLimiter } from "../middleware/rateLimit.js";
import { MODULES, LIMITES } from "../lib/catalogue.js";
import { activerOffre, initierAbonnement, verifierEtTraiter, enregistrerReferenceExterne } from "../lib/billing.js";
import { jetonDepuisWebhook } from "../lib/paiement/index.js";

const router = Router();
const toDateStr = (date) => (date ? date.toISOString().slice(0, 10) : null);
const ANNOUNCEMENT_SLOTS = [2, 3];

// Audit sécurité (2026-09-03) : comparaison à temps constant, même principe que requireSyncKey
// côté digyo-site (adminSync.js) -- un simple `!==` fuit la longueur/le préfixe correct de la
// clé via le temps de réponse.
function requirePortalKey(req, res, next) {
  const key = req.headers["x-portal-key"];
  const attendu = process.env.SCHOOL_PORTAL_API_KEY;
  if (!key || !attendu) {
    return res.status(401).json({ error: "Non autorisé." });
  }
  const bufKey = Buffer.from(key);
  const bufAttendu = Buffer.from(attendu);
  if (bufKey.length !== bufAttendu.length || !crypto.timingSafeEqual(bufKey, bufAttendu)) {
    return res.status(401).json({ error: "Non autorisé." });
  }
  next();
}

function serializePlanInfo(establishment) {
  return {
    formule: establishment.offer?.slug ?? null,
    formuleName: establishment.offer?.name ?? null,
    status: STATUS_TO_API[establishment.status],
    validity: {
      start: toDateStr(establishment.validityStart),
      end: toDateStr(establishment.validityEnd),
    },
    limits: {
      etudiants: establishment.offer?.studentLimit ?? null,
      cursus: establishment.offer?.cursusLimit ?? null,
      enseignants: establishment.offer?.teacherLimit ?? null,
      staff: establishment.offer?.staffLimit ?? null,
      roles: establishment.offer?.roleLimit ?? null,
    },
    // activeModules (sur l'établissement) prime sur offer.modules (défaut du palier) :
    // la console peut activer/désactiver un module précis pour un établissement donné sans
    // changer son offre — voir EtablissementDrawer côté console.
    modules: establishment.activeModules ?? establishment.offer?.modules ?? [],
  };
}

// Libellés du catalogue (modules et limites). Public au même titre que /offres : ce sont des
// informations commerciales, et les consommateurs (digyo, s-school) doivent les lire ici plutôt
// que d'en garder une copie qui dérive au premier module ajouté.
router.get("/catalogue", (req, res) => {
  res.json({ modules: MODULES, limites: LIMITES });
});

router.get("/offres", async (req, res) => {
  const rows = await prisma.offer.findMany({ where: { active: true }, orderBy: { price: "asc" } });
  res.json(rows.map(serializeOffer));
});

// Offres isolees : services supplementaires souscrits separement de la formule. Public au meme
// titre que /offres — c'est du catalogue commercial.
router.get("/addons", async (req, res) => {
  const rows = await prisma.addonOffer.findMany({
    where: { active: true },
    orderBy: { price: "asc" },
  });
  res.json(rows.map(serializeAddonOffer));
});

// Articles de blog digyo : publics au même titre que /offres et /addons — digyo relaie ces
// routes telles quelles (voir digyo-site/back/src/routes/blog.js) plutôt que de garder sa
// propre copie codée en dur.
router.get("/blog", async (req, res) => {
  const rows = await prisma.blogPost.findMany({ where: { published: true }, orderBy: { date: "desc" } });
  res.json(rows.map(serializeBlogPost));
});

router.get("/blog/:slug", async (req, res) => {
  const row = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
  if (!row || !row.published) return res.status(404).json({ error: "Article introuvable." });
  res.json(serializeBlogPost(row));
});

async function findPublishedPost(slug) {
  const post = await prisma.blogPost.findUnique({ where: { slug } });
  return post && post.published ? post : null;
}

// Likes + commentaires publics d'un article : remplace le localStorage côté navigateur (voir
// digyo-site/front/src/hooks/usePostReactions.js) par un comptage réellement partagé entre
// visiteurs. `visitorId` (query) est optionnel — sans lui on renvoie juste le total et `liked:
// false`, utile pour un simple badge de compteur (voir LikeIndicator.jsx) sans connaître le
// visiteur.
// Compteur seul, sans les commentaires -- utilisé par les cartes de la liste d'articles
// (LikeIndicator.jsx, plusieurs par page) pour éviter de rapatrier tous les commentaires de
// chaque article juste pour afficher un badge. /reactions ci-dessous reste utilisé pour la page
// de détail d'un article, qui a besoin des deux.
router.get("/blog/:slug/likes", async (req, res) => {
  const post = await findPublishedPost(req.params.slug);
  if (!post) return res.status(404).json({ error: "Article introuvable." });

  const { visitorId } = req.query;
  const [likes, mine] = await Promise.all([
    prisma.blogLike.count({ where: { blogPostId: post.id } }),
    visitorId
      ? prisma.blogLike.findUnique({ where: { blogPostId_visitorId: { blogPostId: post.id, visitorId } } })
      : null,
  ]);

  res.json({ likes, liked: Boolean(mine) });
});

router.get("/blog/:slug/reactions", async (req, res) => {
  const post = await findPublishedPost(req.params.slug);
  if (!post) return res.status(404).json({ error: "Article introuvable." });

  const { visitorId } = req.query;
  const [likes, comments, mine] = await Promise.all([
    prisma.blogLike.count({ where: { blogPostId: post.id } }),
    prisma.blogComment.findMany({ where: { blogPostId: post.id }, orderBy: { createdAt: "asc" } }),
    visitorId
      ? prisma.blogLike.findUnique({ where: { blogPostId_visitorId: { blogPostId: post.id, visitorId } } })
      : null,
  ]);

  res.json({ likes, liked: Boolean(mine), comments: comments.map(serializeBlogComment) });
});

// Bascule explicite (pas un simple incrément) : le navigateur connaît déjà son état courant
// (usePostReactions optimiste) et nous dit où il veut aller — idempotent si rejoué deux fois.
router.post("/blog/:slug/like", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const post = await findPublishedPost(req.params.slug);
  if (!post) return res.status(404).json({ error: "Article introuvable." });

  const { visitorId, liked } = req.body || {};
  if (!visitorId) return res.status(400).json({ error: "visitorId requis." });

  if (liked) {
    await prisma.blogLike.upsert({
      where: { blogPostId_visitorId: { blogPostId: post.id, visitorId } },
      create: { blogPostId: post.id, visitorId },
      update: {},
    });
  } else {
    await prisma.blogLike.deleteMany({ where: { blogPostId: post.id, visitorId } });
  }

  const likes = await prisma.blogLike.count({ where: { blogPostId: post.id } });
  res.json({ likes, liked: Boolean(liked) });
});

router.post("/blog/:slug/comments", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const post = await findPublishedPost(req.params.slug);
  if (!post) return res.status(404).json({ error: "Article introuvable." });

  const name = (req.body?.name || "").trim();
  const text = (req.body?.text || "").trim();
  if (!name || !text) return res.status(400).json({ error: "name et text requis." });
  if (name.length > 100 || text.length > 2000) {
    return res.status(400).json({ error: "Nom ou commentaire trop long." });
  }

  const comment = await prisma.blogComment.create({ data: { blogPostId: post.id, name, text } });
  res.status(201).json(serializeBlogComment(comment));
});

// Message du formulaire de contact digyo (voir digyo-site/back/src/server.js > POST
// /api/contact) — la console est désormais l'interface de gestion, digyo ne fait plus que
// relayer puis notifier par email (voir routes/contactMessages.js côté console).
router.post("/contact", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const { name, email, service, message } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "name, email et message sont requis." });
  }
  // Audit sécurité (2026-09-03) : ces champs n'avaient aucun plafond, contrairement aux
  // commentaires de blog et au chat -- alignés sur les mêmes ordres de grandeur.
  if (name.length > 100 || email.length > 200 || (service && service.length > 100) || message.length > 5000) {
    return res.status(400).json({ error: "Un des champs dépasse la longueur autorisée." });
  }

  const created = await prisma.contactMessage.create({
    data: { name, email, service: service || null, message },
  });
  res.status(201).json({ ok: true, id: created.id });
});

// Chat d'assistance (widget SupportWidget.jsx côté digyo) -- une conversation par visiteur
// anonyme (`visitorToken`, généré côté navigateur), retrouvée d'un message à l'autre. La
// console est la seule source de vérité (voir schema.prisma > SupportConversation) ; digyo ne
// fait que relayer (routes/support.js).
router.post("/support/messages", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const { visitorToken, text, name, email } = req.body || {};
  const trimmed = (text || "").trim();
  if (!visitorToken || !trimmed) {
    return res.status(400).json({ error: "visitorToken et text sont requis." });
  }
  if (trimmed.length > 2000) return res.status(400).json({ error: "Message trop long." });

  let conversation = await prisma.supportConversation.findUnique({ where: { visitorToken } });
  const isNew = !conversation;

  if (!conversation) {
    conversation = await prisma.supportConversation.create({
      data: { visitorToken, visitorName: name || null, visitorEmail: email || null },
    });
  } else {
    const data = { unreadForStaff: true, lastMessageAt: new Date() };
    // Un visiteur qui réécrit sur une conversation déjà classée "résolue" la rouvre
    // implicitement -- le widget n'a pas de bouton "nouvelle conversation".
    if (conversation.status === "resolved") data.status = "open";
    if (name && !conversation.visitorName) data.visitorName = name;
    if (email && !conversation.visitorEmail) data.visitorEmail = email;
    conversation = await prisma.supportConversation.update({ where: { id: conversation.id }, data });
  }

  await prisma.supportMessage.create({
    data: { conversationId: conversation.id, from: "visitor", text: trimmed },
  });

  if (isNew) {
    await prisma.supportMessage.create({
      data: {
        conversationId: conversation.id,
        from: "auto",
        text: "Merci pour votre message ! Un membre de l'équipe digyo vous répondra dès que possible.",
      },
    });
  }

  res.status(201).json({ conversationId: conversation.id, isNew });
});

router.get("/support/messages", async (req, res) => {
  const { visitorToken } = req.query;
  if (!visitorToken) return res.status(400).json({ error: "visitorToken requis." });

  const conversation = await prisma.supportConversation.findUnique({
    where: { visitorToken },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return res.json({ status: null, messages: [] });

  if (conversation.unreadForVisitor) {
    await prisma.supportConversation.update({ where: { id: conversation.id }, data: { unreadForVisitor: false } });
  }

  res.json(serializeSupportConversation(conversation));
});

// Poll léger pour le badge du bouton flottant quand le widget est fermé -- sans effet de bord,
// contrairement à /support/messages ci-dessus qui marque la conversation comme lue.
router.get("/support/unread", async (req, res) => {
  const { visitorToken } = req.query;
  if (!visitorToken) return res.status(400).json({ error: "visitorToken requis." });

  const conversation = await prisma.supportConversation.findUnique({ where: { visitorToken } });
  res.json({ unread: conversation?.unreadForVisitor ?? false });
});

router.get("/etablissements/:sschoolId", requirePortalKey, async (req, res) => {
  const sschoolId = Number(req.params.sschoolId);
  const establishment = await prisma.establishment.findUnique({
    where: { sschoolId },
    include: { offer: true },
  });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  res.json(serializePlanInfo(establishment));
});

// Activation directe, sans passage par un prestataire de paiement : utilisée par un agent
// depuis la console (versement encaissé hors ligne). Le paiement en ligne, lui, passe par
// /paiement/initier ci-dessous et n'active qu'après confirmation du paiement électronique.
router.post("/etablissements/:sschoolId/select-offer", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const sschoolId = Number(req.params.sschoolId);
  const { offerSlug, quantite, modePaiement, transactionId } = req.body || {};
  if (!offerSlug) return res.status(400).json({ error: "offerSlug requis." });

  const establishment = await prisma.establishment.findUnique({ where: { sschoolId } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const offer = await prisma.offer.findUnique({ where: { slug: offerSlug } });
  if (!offer || !offer.active) return res.status(400).json({ error: "Offre invalide ou inactive." });

  const { establishment: updated, paiement } = await activerOffre({
    establishment,
    offer,
    quantite,
    modePaiement,
    transactionId,
  });

  res.json({ ...serializePlanInfo(updated), paiement });
});

router.get("/etablissements/:sschoolId/announcements", requirePortalKey, async (req, res) => {
  const sschoolId = Number(req.params.sschoolId);
  const establishment = await prisma.establishment.findUnique({ where: { sschoolId } });
  if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

  const rows = await prisma.announcement.findMany({ where: { establishmentId: establishment.id } });
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  res.json(ANNOUNCEMENT_SLOTS.map((slot) => serializeAnnouncement(bySlot.get(slot), slot)));
});

// ---------------------------------------------------------------------------
// Paiement d'abonnement. La console est la seule autorité de facturation : c'est ici que le
// paiement est initié, suivi et confirmé, et ici seulement que l'abonnement est activé.
// digyo et s-school ne font que relayer ces routes (voir digyo-site/back/src/routes/
// sschoolSignup.js et projet-sschool/back/routes/abonnementPortal.js) — aucun des deux
// n'appelle jamais l'agrégateur de paiement ni ne décide d'un montant.
// ---------------------------------------------------------------------------

// Met en forme la réponse de suivi, différente selon l'origine : une inscription rend
// l'établissement créé et ses identifiants, un renouvellement rend le plan mis à jour.
async function reponseStatut({ pending, statut, resultat, dejaTraite }) {
  if (statut !== "paye") return { statut };

  if (dejaTraite) {
    // Le navigateur peut repasser ici après coup : on rejoue ce qui est déjà acquis. Le mot de
    // passe admin n'est pas stocké, il n'est donc jamais rejoué — il n'est montré qu'une fois,
    // au moment de la création, et parallèlement envoyé par email.
    if (pending.type === "addon") {
      // Le detail du credit n'est pas rejoue : il a ete applique une fois cote s-school, et
      // c'est le solde affiche par s-school qui fait foi.
      return { statut };
    }

    if (pending.type === "signup") {
      const etab = pending.establishmentCode
        ? await prisma.establishment.findUnique({
            where: { code: pending.establishmentCode },
            include: { offer: true },
          })
        : null;
      return { statut, etablissement: etab ? serializeEstablishment(etab) : null };
    }

    const etab = await prisma.establishment.findUnique({
      where: { id: pending.establishmentId },
      include: { offer: true },
    });
    return { statut, abonnement: etab ? serializePlanInfo(etab) : null };
  }

  if (pending.type === "addon") {
    return { statut, recharge: resultat?.recharge ?? null };
  }

  if (pending.type === "signup") {
    return {
      statut,
      etablissement: resultat ? serializeEstablishment(resultat.establishment) : null,
      admin: resultat?.admin ?? null,
    };
  }

  return {
    statut,
    abonnement: resultat ? serializePlanInfo(resultat.establishment) : null,
    paiement: resultat?.paiement ?? null,
  };
}

// Compte test s-school (démo unique et partagée, voir DEMO_SSCHOOL_* dans .env) : capture le
// lead — nom, email, téléphone — puis remet les identifiants partagés. Ne provisionne jamais
// rien ; c'est ce qui distingue ce chemin du signup payant juste en dessous.
router.post("/demo/acceder", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const { nom, email, telephone } = req.body || {};
  const manquants = ["nom", "email", "telephone"].filter((c) => !req.body?.[c]);
  if (manquants.length) {
    return res.status(400).json({ error: `Champs requis manquants : ${manquants.join(", ")}.` });
  }

  if (!process.env.DEMO_SSCHOOL_LOGIN || !process.env.DEMO_SSCHOOL_PASSWORD) {
    return res.status(503).json({ error: "Compte de démonstration indisponible pour le moment." });
  }

  await prisma.demoLead.create({ data: { nom, email, telephone } });

  res.json({
    login: process.env.DEMO_SSCHOOL_LOGIN,
    password: process.env.DEMO_SSCHOOL_PASSWORD,
    url: process.env.SSCHOOL_LOGIN_URL,
  });
});

// Étape 1a — nouvelle école, demandée depuis digyo. Aucun établissement n'est créé à ce stade :
// seulement une demande en attente, provisionnée si et seulement si le paiement est confirmé.
router.post("/signup/initier", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const b = req.body || {};
  const required = ["offerSlug", "nom", "ville", "responsableNom", "responsableTelephone", "responsableEmail"];
  const missing = required.filter((f) => !b[f]);
  if (missing.length) return res.status(400).json({ error: `Champs requis manquants : ${missing.join(", ")}.` });

  const offer = await prisma.offer.findUnique({ where: { slug: b.offerSlug } });
  if (!offer || !offer.active) return res.status(400).json({ error: "Offre invalide ou inactive." });

  try {
    const { url, token, mode, widget, returnUrl } = await initierAbonnement({
      type: "signup",
      offer,
      quantite: b.quantite,
      nomClient: b.responsableNom,
      numeroClient: b.responsableTelephone,
      email: b.responsableEmail,
      infosPerso: { origine: "digyo", offerSlug: b.offerSlug, etablissement: b.nom },
      returnUrl: process.env.SIGNUP_RETURN_URL,
      signup: {
        nom: b.nom,
        ville: b.ville,
        responsableNom: b.responsableNom,
        responsableRole: b.responsableRole || "Super_admin",
        responsableTelephone: b.responsableTelephone,
        responsableEmail: b.responsableEmail,
      },
    });
    res.json({ url, token, mode, widget, returnUrl });
  } catch (err) {
    console.error("Erreur initiation paiement inscription :", err);
    res.status(502).json({ error: "Impossible d'initier le paiement pour le moment." });
  }
});

// Étape 1b — réabonnement d'une école existante, demandé depuis s-school. L'établissement est
// identifié par son id Sschool ; s-school ne transmet ni montant ni offre autre que son slug.
router.post(
  "/etablissements/:sschoolId/paiement/initier",
  publicMutationLimiter,
  requirePortalKey,
  async (req, res) => {
    const sschoolId = Number(req.params.sschoolId);
    const { offerSlug, quantite, numeroClient, nomClient } = req.body || {};
    if (!offerSlug || !numeroClient) {
      return res.status(400).json({ error: "offerSlug et numeroClient requis." });
    }

    const establishment = await prisma.establishment.findUnique({ where: { sschoolId } });
    if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

    const offer = await prisma.offer.findUnique({ where: { slug: offerSlug } });
    if (!offer || !offer.active) return res.status(400).json({ error: "Offre invalide ou inactive." });

    try {
      const { url, token, mode, widget, returnUrl } = await initierAbonnement({
        type: "renouvellement",
        offer,
        quantite,
        nomClient: nomClient || establishment.name,
        numeroClient,
        infosPerso: { origine: "sschool", offerSlug, idEtablissement: sschoolId },
        returnUrl: process.env.SSCHOOL_RETURN_URL,
        establishmentId: establishment.id,
      });
      res.json({ url, token, mode, widget, returnUrl });
    } catch (err) {
      console.error("Erreur initiation paiement renouvellement :", err);
      res.status(502).json({ error: "Impossible d'initier le paiement pour le moment." });
    }
  }
);

// Étape 1c — achat d'une offre isolée (recharge de crédits SMS) par une école déjà cliente.
// Le prix vient du catalogue, jamais de la requête.
router.post(
  "/etablissements/:sschoolId/addons/:slug/paiement/initier",
  publicMutationLimiter,
  requirePortalKey,
  async (req, res) => {
    const sschoolId = Number(req.params.sschoolId);
    const { numeroClient, nomClient } = req.body || {};
    if (!numeroClient) return res.status(400).json({ error: "numeroClient requis." });

    const establishment = await prisma.establishment.findUnique({ where: { sschoolId } });
    if (!establishment) return res.status(404).json({ error: "Établissement introuvable." });

    const addonOffer = await prisma.addonOffer.findUnique({ where: { slug: req.params.slug } });
    if (!addonOffer || !addonOffer.active) {
      return res.status(400).json({ error: "Service indisponible." });
    }

    try {
      const { url, token, mode, widget, returnUrl } = await initierAbonnement({
        type: "addon",
        addonOffer,
        nomClient: nomClient || establishment.name,
        numeroClient,
        infosPerso: { origine: "sschool", addon: addonOffer.slug, idEtablissement: sschoolId },
        returnUrl: process.env.SSCHOOL_ADDON_RETURN_URL || process.env.SSCHOOL_RETURN_URL,
        establishmentId: establishment.id,
      });
      res.json({ url, token, mode, widget, returnUrl });
    } catch (err) {
      console.error("Erreur initiation paiement recharge :", err);
      res.status(502).json({ error: "Impossible d'initier le paiement pour le moment." });
    }
  }
);

// Étape 2 — suivi par le navigateur (polling au retour du paiement électronique), pendant que le webhook
// de l'étape 3 peut arriver en parallèle, avant, ou pas du tout.
router.get("/paiement/statut/:token", requirePortalKey, async (req, res) => {
  try {
    const resultat = await verifierEtTraiter(req.params.token);
    if (resultat.introuvable) return res.status(404).json({ error: "Transaction introuvable." });
    res.json(await reponseStatut(resultat));
  } catch (err) {
    console.error("Erreur vérification paiement :", err);
    res.status(502).json({ error: "Vérification du paiement indisponible pour le moment." });
  }
});

// Étape 2bis — propre aux agrégateurs en mode "widget" (KadevPay aujourd'hui) : le navigateur
// connaît, au moment où le widget aboutit, à la fois notre `token` et la référence attribuée par
// l'agrégateur — c'est le seul moment où les deux identifiants coexistent côté client. Sans
// effet et jamais appelée pour un agrégateur en mode "redirect" (Money Fusion, simulation).
router.post("/paiement/confirmer-widget", publicMutationLimiter, requirePortalKey, async (req, res) => {
  const { token, reference } = req.body || {};
  if (!token || !reference) return res.status(400).json({ error: "token et reference requis." });

  try {
    const resultat = await enregistrerReferenceExterne(token, reference);
    if (resultat.introuvable) return res.status(404).json({ error: "Transaction introuvable." });
    res.json(await reponseStatut(resultat));
  } catch (err) {
    console.error("Erreur confirmation widget paiement :", err);
    res.status(502).json({ error: "Vérification du paiement indisponible pour le moment." });
  }
});

// Étape 3 — notification serveur-à-serveur de l'agrégateur actif. Volontairement sans clé
// (c'est le prestataire qui appelle), mais le corps n'est jamais cru sur parole :
// verifierEtTraiter revérifie systématiquement le statut auprès de lui, si bien qu'un appel
// forgé vers cette URL publique ne peut ni créer un établissement ni prolonger un abonnement
// gratuitement — quel que soit l'agrégateur, le nom de son champ de jeton (jetonDepuisWebhook)
// est le seul détail propre au prestataire qui reste ici.
router.post("/paiement/webhook", async (req, res) => {
  // rawBody vient du hook `verify` posé sur express.json() (voir server.js) — nécessaire à
  // KadevPay pour vérifier sa signature HMAC sur les octets exacts qu'il a envoyés.
  const token = await jetonDepuisWebhook({ corps: req.body, rawBody: req.rawBody, headers: req.headers });
  if (!token) return res.status(400).end();

  try {
    await verifierEtTraiter(token);
  } catch (err) {
    // 200 quand même : l'erreur est journalisée, inutile que le prestataire s'acharne à
    // retenter si le problème vient de notre côté — le polling reste le filet de sécurité.
    console.error("Erreur webhook paiement :", err);
  }
  res.status(200).end();
});

export default router;
