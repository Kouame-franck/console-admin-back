# Console projets — Back

API Express + Prisma (MySQL) pour la console d'administration Digyo & Sschool.

Pour l'instant, cette API gère les données propres à la console (établissements Sschool en cache, abonnements/finances, offres & tarifs, config de performance) — pas d'accès direct à la base de production de Sschool. Voir la conversation pour le détail de cette décision.

## Développement

```bash
npm install
cp .env.example .env   # renseigner DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run prisma:migrate # crée les tables
npm run prisma:seed    # crée l'admin + données de démo
npm run dev
```

Le serveur démarre sur `http://localhost:4000` (configurable via `PORT` dans `.env`).

## Démarrage en production

```bash
npm start
```

## Structure

```
prisma/
  schema.prisma   modèles (AdminUser, Establishment, Payment, Offer, PricingSettings, PerformanceConfig)
  seed.js         admin + données de démo
src/
  server.js               point d'entrée
  lib/prisma.js            client Prisma (adapter MySQL)
  lib/mappers.js            conversions enum DB <-> libellés affichés au front
  lib/serializers.js        mise en forme des réponses API
  middleware/requireAuth.js middleware JWT
  routes/                   routeurs Express, montés sous /api
```

## Routes

- `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/etablissements`, `GET/PATCH/DELETE /api/etablissements/:code`, `PATCH /api/etablissements/:code/modules`
- `GET/POST /api/abonnements`, `PATCH/DELETE /api/abonnements/:code`
- `GET/POST /api/offres`, `PATCH/DELETE /api/offres/:slug`
- `GET/PATCH /api/pricing-settings`
- `GET/PATCH /api/performance-config`

Toutes les routes sauf `/api/auth/login` et `/api/health` nécessitent un header `Authorization: Bearer <token>`.

## Base de données locale

Ce projet utilise MySQL. En dev, XAMPP (`C:\xampp\mysql_start.bat`) fonctionne avec les identifiants par défaut (`root`, sans mot de passe). Une base `projects_admin` doit exister — `npm run prisma:migrate` la peuple mais ne la crée pas si elle n'existe pas encore :

```sql
CREATE DATABASE projects_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
