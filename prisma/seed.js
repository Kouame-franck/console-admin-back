import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/index.js";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

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
