// Source de vérité des libellés du catalogue, servie par l'API publique (GET /api/public/catalogue).
// Les consommateurs (site digyo, s-school) ne doivent plus recopier ces listes chez eux : un
// module ajouté ici apparaît partout sans redéploiement des fronts.
// Les ids doivent rester alignés sur ceux stockés dans Offer.modules / Offer.*Limit.
export const MODULES = [
  {
    id: "importIntelligent",
    name: "Importation intelligente d'étudiants",
    description: "Import en masse depuis un fichier, avec répartition automatique en classes",
  },
  {
    id: "cahierTexteAttachments",
    name: "Pièces jointes au cahier de texte",
    description: "Joindre un PDF à une entrée du cahier de texte électronique",
  },
  {
    id: "espaceParent",
    name: "Espace parent/tuteur",
    description: "Portail dédié aux tuteurs pour suivre la scolarité",
  },
  {
    id: "activites",
    name: "Gestion d'activité scolaire",
    description: "Organisation et suivi des activités extrascolaires",
  },
  {
    id: "paiementElectronique",
    name: "Paiement électronique",
    description: "Paiement en ligne des frais de scolarité",
  },
  {
    id: "gestionFinanciere",
    name: "Gestion financière",
    description: "Frais de scolarité, versements et relances",
  },
  {
    id: "salles",
    name: "Gestion des salles",
    description: "Gestion des salles de classe et de leur affectation",
  },
];

export const LIMITES = [
  { id: "studentLimit", name: "Étudiants" },
  { id: "cursusLimit", name: "Cursus" },
  { id: "teacherLimit", name: "Enseignants" },
  { id: "staffLimit", name: "Comptes personnel" },
  { id: "roleLimit", name: "Rôles créés" },
];
