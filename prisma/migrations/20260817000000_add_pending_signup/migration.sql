-- CreateTable
CREATE TABLE `PendingSignup` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `token` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `ville` VARCHAR(191) NOT NULL,
    `responsableNom` VARCHAR(191) NOT NULL,
    `responsableRole` VARCHAR(191) NOT NULL,
    `responsableTelephone` VARCHAR(191) NOT NULL,
    `responsableEmail` VARCHAR(191) NOT NULL,
    `offerId` INTEGER NOT NULL,
    `quantite` INTEGER NOT NULL DEFAULT 1,
    `montant` INTEGER NOT NULL,
    `statut` ENUM('en_attente', 'paye', 'echoue') NOT NULL DEFAULT 'en_attente',
    `traite` BOOLEAN NOT NULL DEFAULT false,
    `establishmentCode` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PendingSignup_token_key`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PendingSignup` ADD CONSTRAINT `PendingSignup_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
