import crypto from "crypto";
import { prisma } from "./prisma.js";
import { nextCode, genererTransactionId } from "./codes.js";
import { calculerPeriode } from "./abonnement.js";
import { initierPaiementElectronique, verifierPaiementElectronique } from "./paiement/index.js";
import { createRealEtablissement, crediterSmsEtablissement } from "./sschoolSync.js";
import { sendSignupCredentialsEmail, sendRenewalConfirmationEmail } from "./mailer.js";
import { PAYMENT_METHOD_TO_DB } from "./mappers.js";

// Autorité de facturation unique. La console initie tous les paiements d'abonnement, tient
// l'attente (PendingPayment), reçoit le retour du paiement électronique et provisionne — que la
// demande vienne du site digyo (nouvelle école) ou de s-school (renouvellement). Les deux
// applications ne font que relayer : elles n'appellent jamais l'agrégateur elles-mêmes et ne
// décident jamais d'un montant.
//
// L'agrégateur lui-même (Money Fusion aujourd'hui, un autre demain) est un détail
// d'infrastructure isolé dans ./paiement/ — ce fichier ne parle que le vocabulaire commun
// ('en_attente' | 'paye' | 'echoue'), jamais celui d'un prestataire particulier.

// Applique une offre à un établissement : dates de validité, modules du palier, et trace du
// versement dans le grand livre. Sert aussi bien à un renouvellement payé en ligne qu'à une
// activation directe déclenchée par un agent depuis la console (select-offer).
export async function activerOffre({
  establishment,
  offer,
  quantite,
  modePaiement,
  transactionId: transactionIdGateway,
  montantVerse,
}) {
  const { start, end, montant } = calculerPeriode(offer, quantite);

  const updated = await prisma.establishment.update({
    where: { id: establishment.id },
    data: {
      offerId: offer.id,
      status: "actif",
      validityStart: start,
      validityEnd: end,
      // Repart des modules du nouveau palier à chaque activation : une activation manuelle d'un
      // module hors-plan ne survit pas silencieusement à un changement de formule.
      activeModules: offer.modules ?? [],
    },
    include: { offer: true },
  });

  const code = await nextCode(prisma, "payment", "PAY");
  const transactionId = transactionIdGateway || genererTransactionId();
  const recuToken = crypto.randomBytes(16).toString("hex");
  await prisma.payment.create({
    data: {
      code,
      establishmentId: establishment.id,
      formule: offer.name,
      montantTotal: montant,
      montantVerse: montantVerse ?? montant,
      date: start,
      modePaiement: PAYMENT_METHOD_TO_DB[modePaiement] ?? "mobile_money",
      statut: "paye",
      transactionId,
      recuToken,
    },
  });

  return {
    establishment: updated,
    paiement: {
      reference: code,
      recuToken,
      transactionId,
      montant,
      modePaiement: modePaiement ?? "Mobile Money",
      date: start.toISOString(),
    },
  };
}

// Étape 1, commune aux deux origines : le montant est TOUJOURS recalculé depuis le catalogue,
// jamais lu dans la requête — sinon rien n'empêcherait de payer 1 FCFA un abonnement Premium.
export async function initierAbonnement({
  type,
  offer,
  addonOffer = null,
  quantite: quantiteDemandee,
  nomClient,
  numeroClient,
  email = null,
  infosPerso,
  returnUrl,
  establishmentId = null,
  signup = null,
}) {
  // Une offre isolee a un prix ferme pour un lot : pas de periode a calculer, contrairement a
  // une formule dont le montant depend du nombre de mois souscrits.
  const { quantite, montant } = addonOffer
    ? { quantite: 1, montant: addonOffer.price }
    : calculerPeriode(offer, quantiteDemandee);

  // Seul digyo (inscription) collecte un email dans son formulaire. Pour un renouvellement ou
  // une recharge, déclenchés depuis s-school, on retombe sur celui du responsable déjà connu de
  // l'établissement plutôt que d'ajouter un champ aux formulaires existants — un agrégateur qui,
  // comme KadevPay, exige un email (voir lib/paiement/kadevpay.js) en a besoin dans tous les cas.
  let emailResolu = email;
  if (!emailResolu && establishmentId) {
    const establishment = await prisma.establishment.findUnique({ where: { id: establishmentId } });
    emailResolu = establishment?.responsableEmail ?? null;
  }

  const paiement = await initierPaiementElectronique({
    montant,
    nomArticle: (addonOffer ?? offer).name,
    nomClient,
    numeroClient,
    email: emailResolu,
    infosPerso,
    returnUrl,
    webhookUrl: process.env.PAIEMENT_WEBHOOK_URL,
  });

  await prisma.pendingPayment.create({
    data: {
      token: paiement.token,
      type,
      offerId: addonOffer ? null : offer.id,
      addonOfferId: addonOffer?.id ?? null,
      quantite,
      montant,
      establishmentId,
      ...(signup ?? {}),
    },
  });

  // `mode`/`widget` sont absents pour un agrégateur qui, comme Money Fusion, renvoie une URL de
  // redirection directement (`paiement.mode` est alors `undefined`) — les appelants (routes,
  // puis frontend) traitent l'absence de `mode` comme "redirect" par défaut. `returnUrl` n'est
  // utile qu'en mode "widget" (voir lib/paiement/kadevpay.js) ; en mode "redirect" il est déjà
  // inclus dans `url` par le prestataire lui-même.
  return {
    url: paiement.url,
    token: paiement.token,
    mode: paiement.mode,
    widget: paiement.widget,
    returnUrl: paiement.returnUrl,
  };
}

// Renseigne, une fois le widget KadevPay terminé côté navigateur, la référence externe que
// l'agrégateur nous a attribuée — le seul moyen de relier notre `token` à SON identifiant à lui
// (voir l'avertissement en tête de lib/paiement/kadevpay.js : rien de cela n'existe avant que le
// widget n'ait abouti). Sans effet pour un agrégateur en mode "redirect" (jamais appelée).
export async function enregistrerReferenceExterne(token, reference) {
  const pending = await prisma.pendingPayment.findUnique({ where: { token } });
  if (!pending) return { introuvable: true };
  if (pending.traite) return { pending, statut: pending.statut, dejaTraite: true };

  try {
    await prisma.pendingPayment.update({ where: { token }, data: { referenceExterne: reference } });
  } catch (err) {
    // Contrainte unique violée : cette référence a déjà été attribuée à un autre paiement — un
    // rejeu du navigateur (double clic, retour arrière) ne doit pas planter, juste être ignoré,
    // verifierEtTraiter() ci-dessous fera foi de l'état réel.
    console.error(`enregistrerReferenceExterne(${token}) :`, err.message);
  }

  return verifierEtTraiter(token);
}

async function provisionnerNouvelleEcole(pending, offer, montantPaye, transactionIdGateway) {
  let sschoolResult;
  try {
    sschoolResult = await createRealEtablissement({
      nom: pending.nom,
      address: pending.ville,
      email: pending.responsableEmail,
      tel: pending.responsableTelephone,
      responsable: {
        nom: pending.responsableNom,
        prenoms: "",
        email: pending.responsableEmail,
        contact: pending.responsableTelephone,
      },
    });
  } catch (err) {
    // Le paiement est déjà encaissé et ne peut pas être annulé automatiquement d'ici : on
    // repasse la demande en "echoue" pour qu'un agent la reprenne à la main (création Sschool
    // puis remboursement ou nouvelle tentative), plutôt que de la laisser en "paye" sans
    // établissement derrière.
    await prisma.pendingPayment.update({ where: { id: pending.id }, data: { statut: "echoue" } });
    console.error(`Paiement ${pending.token} : encaissé mais création Sschool échouée :`, err.message);
    throw err;
  }

  const code = await nextCode(prisma, "establishment", "SSC");
  const { start, end } = calculerPeriode(offer, pending.quantite);

  const created = await prisma.establishment.create({
    data: {
      code,
      name: pending.nom,
      ville: pending.ville,
      status: "actif",
      createdAt: new Date(),
      responsableNom: pending.responsableNom,
      responsableRole: pending.responsableRole,
      responsableTelephone: pending.responsableTelephone,
      responsableEmail: pending.responsableEmail,
      offerId: offer.id,
      validityStart: start,
      validityEnd: end,
      activeModules: offer.modules ?? [],
      sschoolId: sschoolResult.id_etablissement,
      syncedAt: new Date(),
    },
    include: { offer: true },
  });

  const paymentCode = await nextCode(prisma, "payment", "PAY");
  const recuToken = crypto.randomBytes(16).toString("hex");
  await prisma.payment.create({
    data: {
      code: paymentCode,
      establishmentId: created.id,
      formule: offer.name,
      montantTotal: pending.montant,
      montantVerse: montantPaye,
      date: start,
      modePaiement: "mobile_money",
      statut: "paye",
      transactionId: transactionIdGateway,
      recuToken,
    },
  });

  // Persisté ici (pas seulement renvoyé dans le retour de fonction) : webhook et polling
  // navigateur sont en course pour traiter ce paiement, un seul "gagne" et voit ce retour --
  // sans le stocker, l'autre canal (typiquement le navigateur, qui arrive après le webhook
  // serveur-à-serveur) ne rejouerait jamais ces identifiants ni ce lien de reçu (voir
  // reponseStatut > dejaTraite ci-dessous). Constaté en prod le 2026-09-04 : l'écran de
  // confirmation digyo n'affichait jamais les identifiants.
  await prisma.pendingPayment.update({
    where: { id: pending.id },
    data: {
      establishmentCode: code,
      adminLogin: sschoolResult.admin.login,
      adminPassword: sschoolResult.admin.password,
      paymentCode,
      recuToken,
    },
  });

  sendSignupCredentialsEmail({
    to: pending.responsableEmail,
    etablissementNom: pending.nom,
    login: sschoolResult.admin.login,
    password: sschoolResult.admin.password,
    loginUrl: process.env.SSCHOOL_LOGIN_URL,
    recuUrl: process.env.DIGYO_RECU_URL_BASE ? `${process.env.DIGYO_RECU_URL_BASE}${recuToken}` : null,
  }).catch((err) =>
    console.error(`Paiement ${pending.token} : envoi email identifiants échoué :`, err.message)
  );

  return {
    type: "signup",
    establishment: created,
    admin: sschoolResult.admin,
    paiement: {
      reference: paymentCode,
      recuToken,
      transactionId: transactionIdGateway,
      montant: montantPaye,
      date: start.toISOString(),
    },
  };
}

async function activerRenouvellement(pending, offer, montantPaye, transactionIdGateway) {
  const establishment = await prisma.establishment.findUnique({
    where: { id: pending.establishmentId },
  });
  if (!establishment) {
    await prisma.pendingPayment.update({ where: { id: pending.id }, data: { statut: "echoue" } });
    throw new Error(
      `Établissement ${pending.establishmentId} introuvable pour le paiement ${pending.token}`
    );
  }

  const { establishment: updated, paiement } = await activerOffre({
    establishment,
    offer,
    quantite: pending.quantite,
    modePaiement: "Mobile Money",
    transactionId: transactionIdGateway,
    montantVerse: montantPaye,
  });

  // Même besoin que provisionnerNouvelleEcole ci-dessus : persisté pour que reponseStatut
  // (dejaTraite) puisse renvoyer un lien de reçu fiable quel que soit le canal qui a traité en
  // premier. Contrairement au signup, pas d'identifiants à sauvegarder ici (le compte existe
  // déjà) -- seulement le renouvellement lui-même n'envoyait jusqu'ici aucune confirmation,
  // ni reçu ni email (constaté en prod le 2026-09-04 : juste un toast "Paiement confirmé",
  // rien de plus, contrairement à l'inscription qui envoie au moins un email).
  await prisma.pendingPayment.update({
    where: { id: pending.id },
    data: { paymentCode: paiement.reference, recuToken: paiement.recuToken },
  });

  sendRenewalConfirmationEmail({
    to: establishment.responsableEmail,
    etablissementNom: establishment.name,
    formule: offer.name,
    montant: paiement.montant,
    validiteFin: updated.validityEnd,
    recuUrl: process.env.SSCHOOL_RECU_URL_BASE ? `${process.env.SSCHOOL_RECU_URL_BASE}${paiement.recuToken}` : null,
  }).catch((err) =>
    console.error(`Paiement ${pending.token} : envoi email confirmation renouvellement échoué :`, err.message)
  );

  return { type: "renouvellement", establishment: updated, paiement };
}

async function crediterRecharge(pending, montantPaye, transactionIdGateway) {
  const addon = await prisma.addonOffer.findUnique({ where: { id: pending.addonOfferId } });
  const establishment = await prisma.establishment.findUnique({
    where: { id: pending.establishmentId },
  });

  if (!addon || !establishment?.sschoolId) {
    await prisma.pendingPayment.update({ where: { id: pending.id }, data: { statut: "echoue" } });
    throw new Error(`Recharge ${pending.token} : offre ou établissement Sschool introuvable`);
  }

  try {
    // `pending.token` sert de reference d'idempotence cote s-school : une confirmation rejouee
    // (webhook + polling) ne credite pas deux fois.
    await crediterSmsEtablissement({
      sschoolId: establishment.sschoolId,
      quantite: addon.quantite,
      reference: pending.token,
    });
  } catch (err) {
    // Encaisse mais non credite : on repasse en "echoue" pour reprise manuelle plutot que de
    // laisser une ecole payee sans ses credits.
    await prisma.pendingPayment.update({ where: { id: pending.id }, data: { statut: "echoue" } });
    console.error(`Recharge ${pending.token} : paiement confirmé mais crédit Sschool échoué :`, err.message);
    throw err;
  }

  const code = await nextCode(prisma, "payment", "PAY");
  await prisma.payment.create({
    data: {
      code,
      establishmentId: establishment.id,
      formule: addon.name,
      montantTotal: pending.montant,
      montantVerse: montantPaye,
      date: new Date(),
      modePaiement: "mobile_money",
      statut: "paye",
      transactionId: transactionIdGateway,
    },
  });

  return {
    type: "addon",
    establishment,
    recharge: { service: addon.name, quantite: addon.quantite, unite: addon.unite, reference: code },
  };
}

// Confirme un paiement et provisionne, une seule fois. Le retour navigateur (polling) et le
// webhook du prestataire peuvent arriver dans n'importe quel ordre, ou tous les deux : la garde
// `traite: false` dans le WHERE fait qu'un seul des deux gagne la course, l'autre trouve zéro
// ligne affectée et ne provisionne rien de plus.
export async function confirmerEtProvisionner(pending, montantPaye, transactionIdGateway) {
  if (montantPaye < pending.montant) {
    await prisma.pendingPayment.updateMany({
      where: { id: pending.id, traite: false },
      data: { statut: "echoue", traite: true },
    });
    console.error(
      `MONEYFUSION : montant payé (${montantPaye}) < attendu (${pending.montant}) pour ${pending.token} — abonnement non activé.`
    );
    return null;
  }

  const claimed = await prisma.pendingPayment.updateMany({
    where: { id: pending.id, traite: false },
    data: { statut: "paye", traite: true, transactionId: transactionIdGateway },
  });
  if (claimed.count === 0) return null;

  if (pending.type === "addon") {
    return crediterRecharge(pending, montantPaye, transactionIdGateway);
  }

  const offer = await prisma.offer.findUnique({ where: { id: pending.offerId } });

  return pending.type === "signup"
    ? provisionnerNouvelleEcole(pending, offer, montantPaye, transactionIdGateway)
    : activerRenouvellement(pending, offer, montantPaye, transactionIdGateway);
}

// Étapes 2 et 3, communes : interroge l'agrégateur actif et agit. Appelée par le polling du
// navigateur comme par le webhook — le corps du webhook n'est jamais cru sur parole, on
// revérifie toujours auprès du prestataire avant d'activer quoi que ce soit.
export async function verifierEtTraiter(token) {
  const pending = await prisma.pendingPayment.findUnique({ where: { token } });
  if (!pending) return { introuvable: true };

  if (pending.traite) {
    return { pending, statut: pending.statut, dejaTraite: true };
  }

  // `verification.statut` est déjà normalisé par le pilote actif ('en_attente'|'paye'|'echoue') —
  // ce fichier n'a plus jamais à connaître le vocabulaire propre à Money Fusion ou à un autre
  // prestataire (voir lib/paiement/).
  const verification = await verifierPaiementElectronique(token);

  if (verification.statut === "paye") {
    const resultat = await confirmerEtProvisionner(
      pending,
      verification.montant,
      verification.transactionId
    );
    return { pending, statut: resultat ? "paye" : "en_attente", resultat };
  }

  if (verification.statut === "echoue") {
    await prisma.pendingPayment.updateMany({
      where: { id: pending.id, traite: false },
      data: { statut: "echoue", traite: true },
    });
    return { pending, statut: "echoue" };
  }

  return { pending, statut: "en_attente" };
}
