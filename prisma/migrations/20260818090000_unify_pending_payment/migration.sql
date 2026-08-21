-- Unification de la facturation dans la console : une seule table d'attente pour les deux
-- origines (inscription depuis digyo, renouvellement depuis s-school).
-- PendingSignup n'a jamais été déployée en production ; le DROP est donc sans perte, et
-- IF EXISTS couvre les bases où elle n'a jamais existé.
DROP TABLE IF EXISTS `PendingSignup`;

-- CreateTable
CREATE TABLE `PendingPayment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NOT NULL,
    `type` ENUM('signup', 'renouvellement') NOT NULL,
    `offerId` INTEGER NOT NULL,
    `quantite` INTEGER NOT NULL DEFAULT 1,
    `montant` INTEGER NOT NULL,
    `statut` ENUM('en_attente', 'paye', 'echoue') NOT NULL DEFAULT 'en_attente',
    `traite` BOOLEAN NOT NULL DEFAULT false,
    `transactionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `establishmentId` INTEGER NULL,
    `nom` VARCHAR(191) NULL,
    `ville` VARCHAR(191) NULL,
    `responsableNom` VARCHAR(191) NULL,
    `responsableRole` VARCHAR(191) NULL,
    `responsableTelephone` VARCHAR(191) NULL,
    `responsableEmail` VARCHAR(191) NULL,
    `establishmentCode` VARCHAR(191) NULL,

    UNIQUE INDEX `PendingPayment_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PendingPayment` ADD CONSTRAINT `PendingPayment_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PendingPayment` ADD CONSTRAINT `PendingPayment_establishmentId_fkey` FOREIGN KEY (`establishmentId`) REFERENCES `Establishment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
