// Backfill ponctuel : seed.js n'écrase jamais une offre déjà existante (voir `update: {}`),
// donc les offres créées avant l'ajout des colonnes limites/modules doivent être mises à jour
// une fois ici. À lancer une seule fois par base (locale puis prod) après la migration
// add_module_limits. Les éditions suivantes se font depuis la console.
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/index.js";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const LIMITES_STARTER = { cursusLimit: 3, teacherLimit: 15, staffLimit: 3, roleLimit: 3 };
const LIMITES_STANDARD = { cursusLimit: 10, teacherLimit: 50, staffLimit: 8, roleLimit: 8 };
const LIMITES_PREMIUM = { cursusLimit: null, teacherLimit: null, staffLimit: null, roleLimit: null };

const MODULES_STANDARD = ["cahierTexteAttachments", "activites", "salles", "gestionFinanciere"];
const MODULES_PREMIUM = [...MODULES_STANDARD, "espaceParent", "paiementElectronique", "importIntelligent"];

const parPalier = {
  starter: { ...LIMITES_STARTER, modules: [] },
  standard: { ...LIMITES_STANDARD, modules: MODULES_STANDARD },
  premium: { ...LIMITES_PREMIUM, modules: MODULES_PREMIUM },
};

async function main() {
  const offers = await prisma.offer.findMany();
  for (const offer of offers) {
    const palier = offer.slug.replace(/-mensuel$/, "");
    const data = parPalier[palier];
    if (!data) {
      console.warn(`Offre "${offer.slug}" ignorée : palier "${palier}" non reconnu.`);
      continue;
    }
    await prisma.offer.update({ where: { id: offer.id }, data });
    console.log(`${offer.slug} -> ${JSON.stringify(data)}`);
  }
  console.log("Backfill terminé.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
