import "dotenv/config";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../src/generated/prisma/index.js";

const adapter = new PrismaMariaDb(process.env.DATABASE_URL);
const prisma = new PrismaClient({ adapter });

// Reprise telle quelle des articles jusqu'ici codés en dur dans
// digyo-site/front/src/data/blog.js, pour peupler BlogPost sans perdre l'historique au moment
// où digyo bascule de son tableau statique vers l'API de la console (voir routes/blog.js,
// routes/publicPortal.js). À exécuter une fois : `node scripts/seedBlogPosts.js`.
const posts = [
  {
    slug: "5-signes-transformation-digitale",
    title: "5 signes qu'il est temps de digitaliser votre activité",
    category: "Transformation digitale",
    excerpt:
      "Entre les tableurs qui se multiplient et les informations qui se perdent dans les échanges WhatsApp, certains signaux ne trompent pas. Voici comment les repérer avant qu'ils ne coûtent cher.",
    date: "2026-07-14",
    readTime: "5 min de lecture",
    author: "L'équipe digyo",
    icon: "signal",
    image: "https://images.pexels.com/photos/7793645/pexels-photo-7793645.jpeg?auto=compress&cs=tinysrgb&w=1600",
    body: [
      {
        type: "p",
        text: "La transformation digitale est souvent perçue comme un projet réservé aux grandes structures. Dans la réalité, la plupart des PME et des institutions accumulent des signaux d'alerte bien avant de s'en rendre compte — et attendent souvent trop longtemps pour agir.",
      },
      { type: "h2", text: "1. L'information vit dans la tête des gens, pas dans un système" },
      {
        type: "p",
        text: "Quand une seule personne sait où trouver un document, un chiffre ou un historique client, l'organisation entière dépend de sa disponibilité. C'est un risque silencieux qui ne se voit qu'au pire moment — un départ, une absence, une urgence.",
      },
      { type: "h2", text: "2. Les mêmes données sont ressaisies plusieurs fois" },
      {
        type: "p",
        text: "Un client saisi dans un tableur, puis recopié dans un cahier, puis reporté dans une facture manuscrite : chaque ressaisie est une occasion d'erreur et une perte de temps qui ne dit pas son nom.",
      },
      { type: "h2", text: "3. Personne ne sait donner un chiffre fiable rapidement" },
      {
        type: "p",
        text: "Combien de clients actifs avez-vous ce mois-ci ? Quel est votre taux d'impayés ? Si la réponse demande plusieurs jours et plusieurs personnes, c'est le signe d'un pilotage à l'aveugle.",
      },
      { type: "h2", text: "4. Les outils actuels sont utilisés à contre-emploi" },
      {
        type: "p",
        text: "WhatsApp pour gérer des commandes, Excel pour héberger une base clients de plusieurs milliers de lignes : ces outils sont excellents pour ce qu'ils font, pas pour ce qu'on leur demande de faire à défaut d'alternative.",
      },
      { type: "h2", text: "5. La croissance ralentit à cause de l'organisation, pas du marché" },
      {
        type: "p",
        text: "C'est souvent le signal le plus net : la demande est là, mais l'entreprise n'arrive plus à suivre parce que ses process internes n'ont pas évolué au même rythme que son activité.",
      },
      {
        type: "p",
        text: "Aucun de ces signes ne justifie, seul, un grand projet de refonte. Mais réunis, ils indiquent qu'un diagnostic vaut mieux qu'une nouvelle année à colmater les brèches.",
      },
    ],
  },
  {
    slug: "site-vitrine-vs-application-metier",
    title: "Site vitrine ou application métier : comment choisir ?",
    category: "Création web & app",
    excerpt:
      "Les deux répondent à des besoins très différents. Un mauvais choix de départ coûte du temps et de l'argent — voici comment trancher selon votre situation.",
    date: "2026-06-30",
    readTime: "4 min de lecture",
    author: "L'équipe digyo",
    icon: "layers",
    image: "https://images.unsplash.com/photo-1763568258239-d3b5c95019af?q=80&w=1600&auto=format&fit=crop",
    body: [
      {
        type: "p",
        text: "« On veut un site internet » est souvent la première phrase d'un projet — et la moins précise. Derrière cette demande se cachent en réalité deux besoins très différents, qui appellent des réponses différentes.",
      },
      { type: "h2", text: "Le site vitrine : être trouvé et inspirer confiance" },
      {
        type: "p",
        text: "Un site vitrine répond à une question simple : quand quelqu'un cherche votre activité, que trouve-t-il ? Il présente votre offre, rassure sur votre sérieux, et donne les moyens de vous contacter. Son rôle s'arrête là — et c'est très bien ainsi.",
      },
      { type: "h2", text: "L'application métier : faire tourner l'activité au quotidien" },
      {
        type: "p",
        text: "Une application métier, elle, est un outil de travail interne ou destiné à vos clients : gestion des commandes, suivi des stocks, espace client, planification. Elle doit refléter précisément la manière dont votre activité fonctionne réellement.",
      },
      { type: "h2", text: "Comment trancher" },
      {
        type: "ul",
        items: [
          "Si le besoin est d'être visible et contacté : un site vitrine suffit, et coûte nettement moins cher.",
          "Si le besoin est de remplacer des tableurs, des cahiers ou des échanges désorganisés : c'est une application métier qu'il faut construire.",
          "Si les deux besoins existent, mieux vaut souvent les traiter comme deux projets distincts, avec des priorités et des budgets séparés.",
        ],
      },
      {
        type: "p",
        text: "La confusion entre les deux est la source la plus fréquente de projets qui dérapent en coût et en délai : on demande un site, on découvre en cours de route qu'on avait besoin d'une application, et le cahier des charges explose. Poser cette question dès le départ change tout.",
      },
    ],
  },
  {
    slug: "former-equipes-outils-digitaux",
    title: "Former ses équipes aux outils digitaux : par où commencer ?",
    category: "Formation & coaching digital",
    excerpt:
      "Acheter un nouvel outil ne suffit pas s'il reste sous-utilisé. Voici une méthode simple pour structurer la montée en compétence de vos équipes.",
    date: "2026-06-12",
    readTime: "5 min de lecture",
    author: "L'équipe digyo",
    icon: "layers-up",
    image: "https://images.pexels.com/photos/33714873/pexels-photo-33714873.jpeg?auto=compress&cs=tinysrgb&w=1600",
    body: [
      {
        type: "p",
        text: "C'est l'un des angles morts les plus coûteux d'un projet digital : un outil bien choisi, correctement installé, mais que personne n'utilise vraiment six mois plus tard. La formation n'est pas une option annexe — c'est ce qui détermine si l'investissement porte ses fruits.",
      },
      { type: "h2", text: "Commencer par ce qui bloque vraiment, pas par la théorie" },
      {
        type: "p",
        text: "Une formation générique sur « les outils digitaux » a peu d'effet. Une formation construite autour des trois tâches que l'équipe effectue chaque jour, elle, change immédiatement les habitudes.",
      },
      { type: "h2", text: "Former les relais avant de former tout le monde" },
      {
        type: "p",
        text: "Dans chaque équipe, une ou deux personnes adoptent naturellement les nouveaux outils plus vite que les autres. Les identifier et les former en premier crée des relais internes qui accompagnent leurs collègues au quotidien — bien plus efficacement qu'une formation unique et collective.",
      },
      { type: "h2", text: "Prévoir un suivi, pas seulement un lancement" },
      {
        type: "p",
        text: "La majorité des mauvaises habitudes réapparaissent dans les semaines qui suivent une formation, une fois l'enthousiasme retombé. Un point de suivi à 30 jours coûte peu et évite de perdre les acquis.",
      },
      {
        type: "ul",
        items: [
          "Semaine 1 : formation ciblée sur les tâches réelles de l'équipe.",
          "Semaine 2 à 4 : accompagnement rapproché des relais identifiés.",
          "Jour 30 : point de suivi pour ajuster ce qui coince encore.",
        ],
      },
      {
        type: "p",
        text: "Un outil n'a jamais transformé une organisation à lui seul. Ce sont les habitudes qui changent une équipe — et les habitudes se construisent, elles ne s'installent pas par défaut.",
      },
    ],
  },
  {
    slug: "choisir-agence-transformation-digitale",
    title: "Comment choisir la bonne agence pour votre transformation digitale",
    category: "Transformation digitale",
    excerpt:
      "Prix, références, méthode : les critères qui comptent vraiment pour éviter un prestataire qui promet plus qu'il ne livre.",
    date: "2026-05-22",
    readTime: "6 min de lecture",
    author: "L'équipe digyo",
    icon: "compass",
    image: "https://images.pexels.com/photos/33175648/pexels-photo-33175648.jpeg?auto=compress&cs=tinysrgb&w=1600",
    body: [
      {
        type: "p",
        text: "Le marché de l'accompagnement digital s'est beaucoup ouvert ces dernières années — ce qui est une bonne nouvelle, mais qui rend aussi le choix d'un prestataire plus difficile. Voici les critères qui font réellement la différence.",
      },
      { type: "h2", text: "La méthode compte plus que le discours" },
      {
        type: "p",
        text: "Toute agence sérieuse doit pouvoir expliquer simplement comment elle travaille : comment elle cadre un besoin, comment elle priorise, comment elle livre. Si la réponse reste vague ou se limite à des mots-clés à la mode, c'est un signal à prendre au sérieux.",
      },
      { type: "h2", text: "Des livrables concrets, pas seulement des recommandations" },
      {
        type: "p",
        text: "Un audit qui se termine par un rapport de 40 pages sans plan d'action a peu de valeur pratique. Le bon accompagnement se termine toujours par quelque chose d'utilisable immédiatement — un outil, un processus, une équipe formée.",
      },
      { type: "h2", text: "La taille du prestataire doit correspondre à la vôtre" },
      {
        type: "p",
        text: "Une grande structure a besoin d'un partenaire capable de suivre sa complexité et sa gouvernance. Une PME, elle, a souvent plus intérêt à travailler avec une équipe agile qui comprend ses contraintes réelles de budget et de temps, plutôt qu'avec un grand cabinet dont les process sont pensés pour de plus gros comptes.",
      },
      { type: "h2", text: "Le prix le plus bas n'est presque jamais le bon calcul" },
      {
        type: "p",
        text: "Un projet mal cadré, livré trop vite, coûte presque toujours plus cher à corriger que ce qu'il a fait économiser au départ. Le bon réflexe n'est pas de chercher le prix le plus bas, mais la proposition la plus claire sur ce qui sera réellement livré.",
      },
      {
        type: "p",
        text: "Un premier échange, sans engagement, suffit généralement à sentir si la méthode et la posture d'un prestataire correspondent à votre besoin. C'est un temps qu'il ne faut jamais sauter.",
      },
    ],
  },
  {
    slug: "erreurs-projet-digital",
    title: "Les 4 erreurs les plus fréquentes dans un projet digital",
    category: "Création web & app",
    excerpt:
      "Cahier des charges flou, périmètre qui s'étend sans fin, absence de test utilisateur... Un tour d'horizon des pièges classiques et comment les éviter.",
    date: "2026-05-05",
    readTime: "5 min de lecture",
    author: "L'équipe digyo",
    icon: "warning",
    image: "https://images.unsplash.com/photo-1758874383583-59c39da93e40?q=80&w=1600&auto=format&fit=crop",
    body: [
      {
        type: "p",
        text: "La plupart des projets digitaux qui dérapent ne le font pas à cause de la technique, mais à cause de décisions prises — ou évitées — en amont. Voici les quatre erreurs les plus courantes que nous observons.",
      },
      { type: "h2", text: "1. Démarrer sans cahier des charges partagé" },
      {
        type: "p",
        text: "Quand chaque partie prenante a une idée légèrement différente du résultat attendu, chaque livraison devient une source de désaccord. Un document simple, validé par tous avant le début, évite la majorité des tensions.",
      },
      { type: "h2", text: "2. Laisser le périmètre s'étendre en cours de route" },
      {
        type: "p",
        text: "« Tant qu'on y est, on pourrait aussi ajouter... » est la phrase qui fait le plus dérailler les budgets et les délais. Chaque ajout est légitime pris isolément — c'est leur accumulation qui pose problème.",
      },
      { type: "h2", text: "3. Ne faire tester l'outil qu'à la toute fin" },
      {
        type: "p",
        text: "Attendre la livraison finale pour montrer l'outil aux personnes qui l'utiliseront au quotidien est le meilleur moyen de découvrir, trop tard, qu'il ne correspond pas à leurs habitudes réelles de travail.",
      },
      { type: "h2", text: "4. Négliger la formation et la documentation" },
      {
        type: "p",
        text: "Un outil livré sans accompagnement au changement finit presque toujours sous-utilisé, quelle que soit sa qualité technique. La formation fait partie du projet, pas d'une étape optionnelle après coup.",
      },
      {
        type: "p",
        text: "Ces quatre pièges ont un point commun : ils se règlent presque tous en amont, par du cadrage et de la communication, bien avant la première ligne de code.",
      },
    ],
  },
  {
    slug: "pourquoi-digyo-developpe-des-saas",
    title: "Pourquoi digyo développe aussi ses propres outils SaaS",
    category: "Actualités digyo",
    excerpt:
      "Au-delà de l'accompagnement, nous construisons nos propres produits. Une démarche qui nourrit notre expertise et bénéficie directement à nos clients.",
    date: "2026-04-18",
    readTime: "3 min de lecture",
    author: "L'équipe digyo",
    icon: "spark",
    image: "https://images.pexels.com/photos/3184357/pexels-photo-3184357.jpeg?auto=compress&cs=tinysrgb&w=1600",
    body: [
      {
        type: "p",
        text: "digyo est né comme un cabinet d'accompagnement digital. Mais depuis le début, nous avons fait un choix qui distingue notre manière de travailler : construire aussi nos propres produits, en parallèle des missions que nous menons pour nos clients.",
      },
      { type: "h2", text: "Comprendre un métier de l'intérieur" },
      {
        type: "p",
        text: "Concevoir un outil de A à Z — de la première idée jusqu'à son usage quotidien par de vrais utilisateurs — nous confronte aux mêmes contraintes que nos clients : arbitrages de budget, priorisation des fonctionnalités, adoption par les équipes. Cette expérience irrigue directement la qualité de nos accompagnements.",
      },
      { type: "h2", text: "Des preuves plutôt que des promesses" },
      {
        type: "p",
        text: "Il est facile de parler d'expertise technique. Il est plus convaincant de la montrer. Nos produits SaaS sont notre manière de démontrer concrètement ce que nous savons construire, plutôt que de se contenter de l'affirmer.",
      },
      {
        type: "p",
        text: "Retrouvez nos produits sur la page SaaS — certains sont déjà utilisés en conditions réelles, d'autres sont encore en construction. Nous partageons volontiers où chacun en est.",
      },
    ],
  },
];

async function main() {
  for (const post of posts) {
    await prisma.blogPost.upsert({
      where: { slug: post.slug },
      update: {},
      create: { ...post, date: new Date(post.date) },
    });
  }
  console.log(`Seed terminé : ${posts.length} article(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
