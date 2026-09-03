import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { serializeBlogPost, serializeBlogComment } from "../lib/serializers.js";
import { generateBlogDraft, BLOG_CATEGORIES } from "../lib/aiBlog.js";
import { uploadFile, generateFileName } from "../lib/r2.js";

const router = Router();
// Couverture d'article : image ou courte vidéo, servie ensuite en <video> côté digyo-site --
// limite plus large que les 5 Mo des images d'annonce (etablissements.js), qui n'accueillent
// jamais de vidéo.
const COVER_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);
const COVER_MAX_SIZE_MB = 80;
const COVER_FORMATS_LABEL = "JPG, PNG, WebP, GIF, MP4, WebM, MOV";

const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: COVER_MAX_SIZE_MB * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!COVER_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error(`Format non supporté. Formats acceptés : ${COVER_FORMATS_LABEL}.`));
    }
    cb(null, true);
  },
});

// multer signale une erreur (taille dépassée, format rejeté par fileFilter) via `next(err)` avant
// même d'atteindre le handler de la route -- on la traduit ici en message clair plutôt que de
// laisser passer le "File too large" par défaut de multer jusqu'au front.
function handleUploadCover(req, res, next) {
  uploadCover.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `Fichier trop volumineux (max ${COVER_MAX_SIZE_MB} Mo).` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}

function slugify(title) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

router.get("/", async (req, res) => {
  const rows = await prisma.blogPost.findMany({
    orderBy: { date: "desc" },
    include: { _count: { select: { comments: true, likes: true } } },
  });
  res.json(rows.map(serializeBlogPost));
});

router.get("/categories", (req, res) => {
  res.json(BLOG_CATEGORIES);
});

// Upload de la couverture (image ou vidéo) vers R2 -- renvoie l'URL publique et le type détecté
// du fichier ; l'admin inclut ensuite ces deux valeurs (image, coverType) dans le payload
// JSON classique de POST / ou PATCH /:slug, qui ne gèrent que du texte.
router.post("/upload-cover", handleUploadCover, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Fichier manquant." });
  }
  const coverType = req.file.mimetype.startsWith("video/") ? "video" : "image";
  const fileName = generateFileName(req.file.mimetype, "blog-covers");
  const { publicUrl } = await uploadFile(req.file.buffer, fileName, req.file.mimetype);
  res.json({ url: publicUrl, coverType });
});

// Assiste la rédaction (voir lib/aiBlog.js) — ne touche pas la base, l'admin valide et
// enregistre ensuite via POST / ou PATCH /:slug comme n'importe quel article.
router.post("/generate", async (req, res) => {
  const { title, category, notes } = req.body || {};
  try {
    const draft = await generateBlogDraft({ title, category, notes });
    res.json(draft);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.get("/:slug", async (req, res) => {
  const row = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
  if (!row) return res.status(404).json({ error: "Article introuvable." });
  res.json(serializeBlogPost(row));
});

router.post("/", async (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.category || !b.excerpt) {
    return res.status(400).json({ error: "title, category et excerpt sont requis." });
  }

  let slug = b.slug?.trim() || slugify(b.title);
  const clash = await prisma.blogPost.findUnique({ where: { slug } });
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;

  const created = await prisma.blogPost.create({
    data: {
      slug,
      title: b.title,
      category: b.category,
      excerpt: b.excerpt,
      date: b.date ? new Date(b.date) : new Date(),
      readTime: b.readTime || "5 min de lecture",
      author: b.author || "L'équipe digyo",
      icon: b.icon || "spark",
      image: b.image || "",
      coverType: b.coverType === "video" ? "video" : "image",
      body: b.body ?? [],
      published: b.published ?? true,
    },
  });

  res.status(201).json(serializeBlogPost(created));
});

router.patch("/:slug", async (req, res) => {
  const existing = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
  if (!existing) return res.status(404).json({ error: "Article introuvable." });

  const b = req.body || {};
  const data = {};
  if (b.title !== undefined) data.title = b.title;
  if (b.category !== undefined) data.category = b.category;
  if (b.excerpt !== undefined) data.excerpt = b.excerpt;
  if (b.date !== undefined) data.date = new Date(b.date);
  if (b.readTime !== undefined) data.readTime = b.readTime;
  if (b.author !== undefined) data.author = b.author;
  if (b.icon !== undefined) data.icon = b.icon;
  if (b.image !== undefined) data.image = b.image;
  if (b.coverType !== undefined) data.coverType = b.coverType === "video" ? "video" : "image";
  if (b.body !== undefined) data.body = b.body;
  if (b.published !== undefined) data.published = b.published;

  const updated = await prisma.blogPost.update({ where: { id: existing.id }, data });
  res.json(serializeBlogPost(updated));
});

router.delete("/:slug", async (req, res) => {
  const existing = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
  if (!existing) return res.status(404).json({ error: "Article introuvable." });

  await prisma.blogPost.delete({ where: { id: existing.id } });
  res.status(204).end();
});

// Modération des commentaires publics (postés depuis digyo, voir routes/publicPortal.js >
// POST /public/blog/:slug/comments) : lecture seule côté digyo, la console peut en revanche
// en supprimer un après coup — aucune autre édition (pas de statut "approuvé/rejeté", les
// commentaires sont visibles immédiatement à la publication, comme prévu par PostReactions.jsx).
router.get("/:slug/comments", async (req, res) => {
  const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
  if (!post) return res.status(404).json({ error: "Article introuvable." });

  const comments = await prisma.blogComment.findMany({
    where: { blogPostId: post.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(comments.map(serializeBlogComment));
});

router.delete("/:slug/comments/:id", async (req, res) => {
  const post = await prisma.blogPost.findUnique({ where: { slug: req.params.slug } });
  if (!post) return res.status(404).json({ error: "Article introuvable." });

  const comment = await prisma.blogComment.findUnique({ where: { id: Number(req.params.id) } });
  if (!comment || comment.blogPostId !== post.id) {
    return res.status(404).json({ error: "Commentaire introuvable." });
  }

  await prisma.blogComment.delete({ where: { id: comment.id } });
  res.status(204).end();
});

export default router;
