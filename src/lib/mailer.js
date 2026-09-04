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

function formatFCFA(montant) {
  return montant != null ? `${Number(montant).toLocaleString("fr-FR")} FCFA` : "—";
}

// Habillage HTML minimal partagé par les deux emails de confirmation ci-dessous -- volontairement
// simple (pas d'images externes, souvent bloquées par défaut) : un bandeau de couleur, un titre,
// un bloc de contenu, un bouton d'action optionnel.
function emailHtml({ titre, intro, blocs, ctaLabel, ctaUrl, footerNote }) {
  const lignesBloc = (bloc) =>
    bloc
      .map(
        ([label, valeur]) =>
          `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">${label}</td><td style="padding:6px 0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${valeur}</td></tr>`
      )
      .join("");

  const blocsHtml = blocs
    .map(
      (bloc) =>
        `<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:12px;margin-top:12px;">${lignesBloc(bloc)}</table>`
    )
    .join("");

  const cta = ctaUrl
    ? `<div style="margin-top:24px;"><a href="${ctaUrl}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:999px;">${ctaLabel}</a></div>`
    : "";

  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
  <div style="font-size:13px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#0d9488;">digyo</div>
  <h1 style="font-size:19px;color:#0f172a;margin:12px 0 4px;">${titre}</h1>
  <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 8px;">${intro}</p>
  ${blocsHtml}
  ${cta}
  ${footerNote ? `<p style="margin-top:16px;font-size:12px;color:#94a3b8;">${footerNote}</p>` : ""}
  <p style="margin-top:32px;font-size:12px;color:#94a3b8;">digyo — transformation digitale, Abidjan, Côte d'Ivoire.</p>
</div>`.trim();
}

// Envoyée après une inscription en libre-service payée (voir provisionnerNouvelleEcole dans
// billing.js) — les identifiants sont aussi affichés à l'écran côté digyo quand la page gagne la
// course avec le webhook (choix explicite du produit : les deux canaux, pas l'un ou l'autre),
// l'email sert de trace/rattrapage fiable dans tous les cas, y compris si l'onglet se ferme avant
// lecture. Best-effort : ne bloque jamais la réponse HTTP si SMTP n'est pas configuré ou échoue.
export async function sendSignupCredentialsEmail({ to, etablissementNom, login, password, loginUrl, recuUrl }) {
  if (!transporter) return { sent: false };

  await transporter.sendMail({
    from: `digyo <${SMTP_USER}>`,
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
      ...(recuUrl ? [``, `Reçu de paiement : ${recuUrl}`] : []),
    ].join("\n"),
    html: emailHtml({
      titre: "Votre espace Sschool est prêt",
      intro: `Votre établissement <strong>${etablissementNom}</strong> a été créé suite à votre paiement. Voici les identifiants du compte administrateur.`,
      blocs: [
        [
          ["Identifiant", login],
          ["Mot de passe", password],
        ],
      ],
      ctaLabel: "Se connecter à Sschool",
      ctaUrl: loginUrl,
      footerNote: `Pour votre sécurité, changez ce mot de passe dès votre première connexion.${
        recuUrl ? ` <a href="${recuUrl}" style="color:#0d9488;">Voir le reçu de paiement</a>.` : ""
      }`,
    }),
  });

  return { sent: true };
}

// Envoyée après un renouvellement ou changement de formule payé en ligne depuis Sschool (voir
// activerRenouvellement dans billing.js) -- ce flux n'envoyait jusqu'ici aucune confirmation, ni
// reçu ni email : seul un toast "Paiement confirmé" côté Sschool, sans trace exploitable ensuite
// (constaté en prod le 2026-09-04).
export async function sendRenewalConfirmationEmail({ to, etablissementNom, formule, montant, validiteFin, recuUrl }) {
  if (!transporter || !to) return { sent: false };

  const dateFin = validiteFin
    ? new Date(validiteFin).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  await transporter.sendMail({
    from: `digyo <${SMTP_USER}>`,
    to,
    subject: `Paiement confirmé — ${etablissementNom}`,
    text: [
      `Bonjour,`,
      ``,
      `Votre paiement pour "${etablissementNom}" a été confirmé.`,
      ``,
      `Formule : ${formule}`,
      `Montant réglé : ${formatFCFA(montant)}`,
      `Abonnement valide jusqu'au : ${dateFin}`,
      ...(recuUrl ? [``, `Reçu de paiement : ${recuUrl}`] : []),
    ].join("\n"),
    html: emailHtml({
      titre: "Paiement confirmé",
      intro: `Votre paiement pour <strong>${etablissementNom}</strong> a bien été reçu et votre abonnement est à jour.`,
      blocs: [
        [
          ["Formule", formule],
          ["Montant réglé", formatFCFA(montant)],
          ["Valide jusqu'au", dateFin],
        ],
      ],
      ctaLabel: "Voir le reçu de paiement",
      ctaUrl: recuUrl,
    }),
  });

  return { sent: true };
}
