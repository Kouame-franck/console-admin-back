import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/index.js";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

// Modules verrouillables (voir Establishment.activeModules côté console, et
// utils/moduleGuard.js côté sschool) : liste des ids valides, à garder synchronisée avec
// projet-sschool/back/utils/moduleGuard.js.
//   importIntelligent, cahierTexteAttachments, espaceParent, activites,
//   paiementElectronique, gestionFinanciere, salles

// Limites/modules par palier — première passe, ajustable ensuite offre par offre depuis la
// console (Configuration > Tarifs & offres) sans repasser par ce seed.
const LIMITES_STARTER = { cursusLimit: 3, teacherLimit: 15, staffLimit: 3, roleLimit: 3 };
const LIMITES_STANDARD = { cursusLimit: 10, teacherLimit: 50, staffLimit: 8, roleLimit: 8 };
const LIMITES_PREMIUM = { cursusLimit: null, teacherLimit: null, staffLimit: null, roleLimit: null };

const MODULES_STARTER = [];
const MODULES_STANDARD = ["cahierTexteAttachments", "activites", "salles", "gestionFinanciere"];
const MODULES_PREMIUM = [...MODULES_STANDARD, "espaceParent", "paiementElectronique", "importIntelligent"];

// Offres par défaut, créées uniquement si elles n'existent pas encore.
// Une fois créées, elles sont éditables via la console (Configuration > Tarifs & offres)
// et ce seed ne les écrasera plus jamais — voir `update: {}` ci-dessous.
const offers = [
  {
    slug: "starter",
    name: "Starter",
    description: "Pour les petits établissements qui démarrent avec Sschool.",
    price: 650000,
    cycle: "annuel",
    studentLimit: 300,
    ...LIMITES_STARTER,
    modules: MODULES_STARTER,
    active: true,
    features: ["Gestion des élèves", "Bulletins standards", "Support par email"],
  },
  {
    slug: "standard",
    name: "Standard",
    description: "Le plus choisi par les établissements de taille moyenne.",
    price: 1200000,
    cycle: "annuel",
    studentLimit: 800,
    ...LIMITES_STANDARD,
    modules: MODULES_STANDARD,
    active: true,
    features: ["Tout Starter", "Gestion des enseignants", "Export des bulletins", "Support prioritaire"],
  },
  {
    slug: "premium",
    name: "Premium",
    description: "Pour les groupes scolaires et les réseaux multi-sites.",
    price: 2500000,
    cycle: "annuel",
    studentLimit: null,
    ...LIMITES_PREMIUM,
    modules: MODULES_PREMIUM,
    active: true,
    features: ["Tout Standard", "Multi-établissements", "API & intégrations", "Support dédié 24/7"],
  },
  // Pendants mensuels : même nom/description/features/limites/modules que la formule
  // annuelle correspondante (regroupés côté UI par nom), prix = annuel / 8. Logique métier :
  // l'année scolaire dure 9 mois (rentrée à fin d'année), et l'abonnement annuel équivaut à
  // payer 8 des 9 mois — soit "1 mois offert" par rapport à un paiement mensuel sur toute
  // l'année scolaire.
  {
    slug: "starter-mensuel",
    name: "Starter",
    description: "Pour les petits établissements qui démarrent avec Sschool.",
    price: 81250,
    cycle: "mensuel",
    studentLimit: 300,
    ...LIMITES_STARTER,
    modules: MODULES_STARTER,
    active: true,
    features: ["Gestion des élèves", "Bulletins standards", "Support par email"],
  },
  {
    slug: "standard-mensuel",
    name: "Standard",
    description: "Le plus choisi par les établissements de taille moyenne.",
    price: 150000,
    cycle: "mensuel",
    studentLimit: 800,
    ...LIMITES_STANDARD,
    modules: MODULES_STANDARD,
    active: true,
    features: ["Tout Starter", "Gestion des enseignants", "Export des bulletins", "Support prioritaire"],
  },
  {
    slug: "premium-mensuel",
    name: "Premium",
    description: "Pour les groupes scolaires et les réseaux multi-sites.",
    price: 312500,
    cycle: "mensuel",
    studentLimit: null,
    ...LIMITES_PREMIUM,
    modules: MODULES_PREMIUM,
    active: true,
    features: ["Tout Standard", "Multi-établissements", "API & intégrations", "Support dédié 24/7"],
  },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || "Admin";

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL et ADMIN_PASSWORD doivent être définis dans .env pour le seed.");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.adminUser.upsert({
    where: { email: adminEmail },
    update: { passwordHash, name: adminName },
    create: { email: adminEmail, passwordHash, name: adminName },
  });

  await prisma.pricingSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, devise: "FCFA", cycleParDefaut: "annuel" },
  });

  await prisma.performanceConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  for (const offer of offers) {
    await prisma.offer.upsert({
      where: { slug: offer.slug },
      update: {},
      create: offer,
    });
  }

  console.log("Seed terminé.");
  console.log(`Connecte-toi avec : ${adminEmail} / (mot de passe défini dans .env)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
