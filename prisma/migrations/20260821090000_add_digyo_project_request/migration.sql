-- Copie synchronisée en lecture des demandes de projet client de digyo (voir lib/digyoSync.js).
-- `status` est un statut de triage propre à la console, jamais renvoyé vers digyo.
CREATE TABLE `DigyoProjectRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `digyoId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `pillar` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `budgetRange` VARCHAR(191) NULL,
    `deadline` VARCHAR(191) NULL,
    `sourceStatus` VARCHAR(191) NULL,
    `status` ENUM('nouveau', 'en_cours', 'traite', 'refuse') NOT NULL DEFAULT 'nouveau',
    `clientName` VARCHAR(191) NOT NULL,
    `clientEmail` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `syncedAt` DATETIME(3) NULL,

    UNIQUE INDEX `DigyoProjectRequest_digyoId_key`(`digyoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
