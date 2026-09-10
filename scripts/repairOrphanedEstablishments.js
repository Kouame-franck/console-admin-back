// Réparation ponctuelle (audit du 2026-09-10) : DELETE /offres/:slug détachait jusqu'ici
// silencieusement tout établissement encore sur l'offre supprimée (offerId -> null), sans
// avertissement ni confirmation — voir routes/offres.js, corrigé pour refuser la suppression
// tant que des établissements y sont rattachés. Ce script répare les établissements déjà
// orphelins de cet ancien comportement (le résultat le plus visible côté client : plus aucune
// formule ni plafond affichés, alors que l'abonnement était bien payé).
//
// Source de vérité : Payment.formule est une chaîne figée au moment du paiement (pas une
// relation vers Offer), donc toujours fiable même si l'offre d'origine a été supprimée entre
// temps -- on y retrouve le nom de la formule réellement payée en dernier, puis on rattache
// l'établissement à l'offre ACTUELLE portant ce même nom. validityStart/validityEnd/status ne
// sont jamais touchés ici : ce sont des champs directs sur l'établissement, jamais affectés par
// le bug (voir la conversation d'audit) -- seul offerId est réparé.
//
// Aperçu par défaut (aucune écriture) : `node scripts/repairOrphanedEstablishments.js`.
// Application réelle, après relecture de l'aperçu : `node scripts/repairOrphanedEstablishments.js --apply`.
import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/index.js";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes("--apply");

// Formules historiques qui n'existent plus dans le catalogue actuel — décidé au cas par cas
// avec Franck le 2026-09-10 : "Essaie" était un ancien palier d'essai, retiré du catalogue
// avant même la restructuration Starter/Standard/Pro/Premium, donc invisible depuis /offres.
// Les établissements encore dessus sont rattachés à Starter.
const RENOMMAGES_HISTORIQUES = {
  Essaie: "Starter",
};

async function main() {
  const orphelins = await prisma.establishment.findMany({
    where: { offerId: null },
    include: { payments: { orderBy: { date: "desc" }, take: 1 } },
  });

  if (orphelins.length === 0) {
    console.log("Aucun établissement orphelin (offerId manquant) trouvé — rien à réparer.");
    return;
  }

  const offres = await prisma.offer.findMany();

  console.log(`${orphelins.length} établissement(s) sans offre rattachée :\n`);

  let reparables = 0;
  for (const etab of orphelins) {
    const dernierPaiement = etab.payments[0];
    const nomFormule = dernierPaiement?.formule;

    if (!nomFormule) {
      console.log(`- [${etab.code}] ${etab.name} : aucun historique de paiement — impossible de déduire la formule, à traiter à la main.`);
      continue;
    }

    const nomCible = RENOMMAGES_HISTORIQUES[nomFormule] ?? nomFormule;
    const candidats = offres.filter((o) => o.name === nomCible);
    if (candidats.length === 0) {
      console.log(`- [${etab.code}] ${etab.name} : dernier paiement pour "${nomFormule}", mais aucune offre actuelle ne porte ce nom (renommée ?) — à traiter à la main.`);
      continue;
    }

    // Mêmes plafonds/modules quel que soit le cycle pour une même formule (le mensuel et
    // l'annuel d'une offre ne diffèrent que par le prix) : le choix entre les deux candidats ne
    // change rien au résultat fonctionnel, on retient juste une ligne stable et déterministe.
    const offre = candidats.find((o) => o.cycle === "annuel") ?? candidats[0];
    reparables++;

    console.log(
      `- [${etab.code}] ${etab.name} : "${nomFormule}" (dernier paiement du ${dernierPaiement.date.toISOString().slice(0, 10)}) -> offre #${offre.id} (${offre.slug}, ${offre.cycle})`
    );

    if (APPLY) {
      await prisma.establishment.update({ where: { id: etab.id }, data: { offerId: offre.id } });
    }
  }

  console.log(
    APPLY
      ? `\n${reparables} établissement(s) réparé(s).`
      : `\nAperçu seulement (${reparables} réparable(s) automatiquement) — relancez avec --apply pour appliquer réellement ces changements.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
