// Calcule la période et le montant d'un abonnement pour une offre et une durée données.
// Une offre "mensuel" peut être prise pour 1 à 11 mois (12 pousserait vers l'offre "annuel",
// déjà moins chère grâce au mois offert — voir prisma/seed.js) ; une offre "annuel" peut être
// prise pour 1 à 10 ans (plafond arbitraire, juste pour éviter une saisie absurde — jusqu'ici
// figée à 1 an, ce qui empêchait tout paiement pluriannuel côté sschool comme côté console).
// Partagé entre le portail public (achat en libre-service depuis sschool) et la route console
// (paiement physique saisi par un agent), pour que les deux canaux calculent la période et le
// prix de la même façon.
export function calculerPeriode(offer, quantiteDemandee) {
  const max = offer.cycle === "mensuel" ? 11 : 10;
  const quantite = Math.min(Math.max(Math.trunc(Number(quantiteDemandee)) || 1, 1), max);

  const start = new Date();
  const end = new Date(start);
  if (offer.cycle === "mensuel") end.setMonth(end.getMonth() + quantite);
  else end.setFullYear(end.getFullYear() + quantite);

  const montant = offer.price * quantite;

  return { start, end, quantite, montant };
}
