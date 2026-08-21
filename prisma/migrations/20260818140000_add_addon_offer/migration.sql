-- Offres isolees : services supplementaires vendus a part de l'abonnement (le premier est le
-- service SMS, vendu par lots de credits prepayes).
CREATE TABLE `AddonOffer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `type` ENUM('sms') NOT NULL,
    `price` INTEGER NOT NULL,
    `quantite` INTEGER NOT NULL,
    `unite` VARCHAR(191) NOT NULL DEFAULT 'SMS',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `features` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AddonOffer_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
