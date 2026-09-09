import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
});

export const publicMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes. Réessayez dans quelques minutes." },
});

// L'appelant est toujours le back digyo-site relayant pour le compte de TOUS ses visiteurs (voir
// digyo-site/back/src/routes/analytics.js) -- ce plafond est donc partagé par le trafic du site
// entier, pas par visiteur (le vrai frein par IP visiteur vit côté digyo-site, seul à voir la
// bonne IP). Un pageview par navigation, largement plus fréquent qu'un message de chat.
export const analyticsIngestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de requêtes." },
});
