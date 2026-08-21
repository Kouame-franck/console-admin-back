-- Deux choses en une :
-- 1. schema.prisma avait divergé de la migration 20260818160000_addon_purchase (offerId non
--    marqué facultatif, 'addon' absent de l'enum côté source) alors que la base réelle avait
--    déjà ce bon état. Ce fichier ne change donc RIEN sur offerId/type — déjà corrects en base —
--    et sert uniquement à documenter/rejouer la correction si besoin sur un autre environnement.
-- 2. Ajoute la référence externe nécessaire à un agrégateur qui, comme KadevPay, ne renvoie son
--    identifiant de transaction qu'après coup (paiement initié côté client, pas par la console).
ALTER TABLE `PendingPayment`
  MODIFY `offerId` INTEGER NULL,
  MODIFY `type` ENUM('signup', 'renouvellement', 'addon') NOT NULL,
  ADD COLUMN `referenceExterne` VARCHAR(191) NULL;

ALTER TABLE `PendingPayment`
  ADD UNIQUE INDEX `PendingPayment_referenceExterne_key` (`referenceExterne`);
