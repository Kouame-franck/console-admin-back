-- Persiste les identifiants du compte admin Sschool créé par un paiement d'inscription, pour
-- que la page de confirmation puisse les réafficher de façon fiable même quand ce n'est pas cet
-- appel qui a traité le paiement (webhook et polling navigateur en compétition).
ALTER TABLE `PendingPayment` ADD COLUMN `adminLogin` VARCHAR(191) NULL, ADD COLUMN `adminPassword` VARCHAR(191) NULL, ADD COLUMN `paymentCode` VARCHAR(191) NULL, ADD COLUMN `recuToken` VARCHAR(191) NULL;

-- Jeton aléatoire pour le lien de reçu, distinct de `code` (séquentiel, donc énumérable -- ne
-- peut jamais servir de clé publique).
ALTER TABLE `Payment` ADD COLUMN `recuToken` VARCHAR(191) NULL;
CREATE UNIQUE INDEX `Payment_recuToken_key` ON `Payment`(`recuToken`);
