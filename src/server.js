import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import routes from "./routes/index.js";

const app = express();
const PORT = process.env.PORT || 4000;

// L'app tourne toujours derrière Apache (reverse proxy) — nécessaire pour que
// express-rate-limit identifie correctement l'IP réelle du client via X-Forwarded-For.
app.set("trust proxy", 1);

const localhostOrigin = /^http:\/\/localhost:\d+$/;
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || localhostOrigin.test(origin) || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Origine non autorisée par CORS."));
    },
  })
);
// `verify` conserve les octets bruts du corps AVANT parsing JSON, sur `req.rawBody` — le
// webhook KadevPay signe ce corps en HMAC-SHA512 (voir lib/paiement/kadevpay.js), et une
// vérification sur `JSON.stringify(req.body)` reconstitué échouerait au moindre écart
// d'espacement ou d'ordre des clés avec ce que KadevPay a réellement signé.
app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ error: "Route introuvable." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erreur serveur." });
});

const HOST = process.env.HOST || "127.0.0.1";
app.listen(PORT, HOST, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});
