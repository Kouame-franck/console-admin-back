import nodemailer from "nodemailer";

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

const smtpConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  : null;

// Envoyée après une inscription en libre-service payée (voir provisionnerEtablissement dans
// publicPortal.js) — les identifiants sont aussi affichés à l'écran côté digyo (choix explicite
// du client : les deux canaux, pas l'un ou l'autre), l'email sert de trace/rattrapage si l'onglet
// se ferme avant lecture. Best-effort : ne bloque jamais la réponse HTTP si SMTP n'est pas
// configuré ou échoue.
export async function sendSignupCredentialsEmail({ to, etablissementNom, login, password, loginUrl }) {
  if (!transporter) return { sent: false };

  await transporter.sendMail({
    from: SMTP_USER,
    to,
    subject: `Votre espace Sschool pour ${etablissementNom} est prêt`,
    text: [
      `Bonjour,`,
      ``,
      `Votre établissement "${etablissementNom}" a été créé sur Sschool suite à votre paiement.`,
      ``,
      `Identifiants de connexion (compte Super_admin) :`,
      `Identifiant : ${login}`,
      `Mot de passe : ${password}`,
      ``,
      `Connexion : ${loginUrl}`,
      ``,
      `Pour votre sécurité, pensez à changer ce mot de passe après votre première connexion.`,
    ].join("\n"),
  });

  return { sent: true };
}
