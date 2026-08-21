import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { serializeBlogPost } from "../lib/serializers.js";
import { generateBlogDraft, BLOG_CATEGORIES } from "../lib/aiBlog.js";

const router = Router();

function slugify(title) {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

router.get("/", async (req, res) => {
  const rows = await prisma.blogPost.findMany({ orderBy: { date: "desc" } });
  res.json(rows.map(serializeBlogPost));
});

router.get("/categories", (req, res) => {
  res.json(BLOG_CATEGORIES);
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

export default router;
