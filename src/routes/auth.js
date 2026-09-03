import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { loginLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Hash factice, sans compte réel derrière -- comparé quand l'email n'existe pas, pour que
// bcrypt.compare() s'exécute dans les deux cas (utilisateur trouvé ou non) et que le temps de
// réponse ne trahisse pas quels emails ont un compte (audit sécurité, 2026-09-03).
const DUMMY_HASH = "$2a$12$CwTycUXWue0Thq9StjUM0uJ8Q6c0lJlZQvHwZgxbQ5Xh0K8lqZ1Nu";

router.post("/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  const user = await prisma.adminUser.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, user?.passwordHash || DUMMY_HASH);
  if (!user || !valid) {
    return res.status(401).json({ error: "Identifiants invalides." });
  }

  const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.adminUser.findUnique({ where: { id: req.user.sub } });
  if (!user) {
    return res.status(404).json({ error: "Utilisateur introuvable." });
  }
  res.json({ id: user.id, email: user.email, name: user.name });
});

export default router;
