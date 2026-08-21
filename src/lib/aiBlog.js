import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const CATEGORIES = [
  "Transformation digitale",
  "Création web & app",
  "Formation & coaching digital",
  "Actualités digyo",
];

// Rédige un brouillon d'article dans le même format que les articles historiquement codés en
// dur (front/src/data/blog.js côté digyo-site, voir scripts/seedBlogPosts.js) : un extrait et
// un corps en blocs {type: "p"|"h2"|"ul"}. L'admin reste libre de tout modifier avant de
// publier — ceci ne fait que remplir le formulaire (voir BlogPostModal côté front).
export async function generateBlogDraft({ title, category, notes }) {
  if (!title?.trim()) throw new Error("Un titre est requis pour générer un article.");

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4000,
    system:
      "Tu rédiges des articles de blog pour digyo, une agence digitale à Abidjan (Côte d'Ivoire). " +
      "Ton : professionnel, concret, sans jargon creux, à la manière d'une agence qui parle depuis le terrain. " +
      "Réponds uniquement avec un objet JSON valide, sans texte autour, au format exact : " +
      '{"excerpt": string, "readTime": string (ex: "5 min de lecture"), "body": [{"type": "p", "text": string} | {"type": "h2", "text": string} | {"type": "ul", "items": string[]}]}. ' +
      "Le corps doit contenir entre 4 et 8 blocs, en français, structuré avec quelques h2 comme un vrai article.",
    messages: [
      {
        role: "user",
        content: `Titre : ${title}\nCatégorie : ${category || "Transformation digitale"}${notes ? `\nConsignes : ${notes}` : ""}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("Réponse IA vide.");

  let draft;
  try {
    draft = JSON.parse(textBlock.text);
  } catch {
    throw new Error("Réponse IA invalide (JSON non parsable).");
  }

  return {
    excerpt: draft.excerpt ?? "",
    readTime: draft.readTime ?? "5 min de lecture",
    body: Array.isArray(draft.body) ? draft.body : [],
  };
}

export { CATEGORIES as BLOG_CATEGORIES };
