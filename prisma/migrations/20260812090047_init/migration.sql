-- CreateTable
CREATE TABLE `AdminUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `price` INTEGER NOT NULL,
    `cycle` ENUM('mensuel', 'annuel') NOT NULL DEFAULT 'annuel',
    `studentLimit` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `features` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Offer_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Establishment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `ville` VARCHAR(191) NOT NULL,
    `status` ENUM('actif', 'en_attente', 'suspendu') NOT NULL DEFAULT 'actif',
    `createdAt` DATETIME(3) NOT NULL,
    `responsableNom` VARCHAR(191) NOT NULL,
    `responsableRole` VARCHAR(191) NOT NULL,
    `responsableTelephone` VARCHAR(191) NOT NULL,
    `responsableEmail` VARCHAR(191) NOT NULL,
    `offerId` INTEGER NULL,
    `validityStart` DATETIME(3) NOT NULL,
    `validityEnd` DATETIME(3) NOT NULL,
    `studentCount` INTEGER NOT NULL DEFAULT 0,
    `teacherCount` INTEGER NOT NULL DEFAULT 0,
    `cursusCount` INTEGER NOT NULL DEFAULT 0,
    `activeModules` JSON NOT NULL,
    `sschoolId` INTEGER NULL,
    `syncedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Establishment_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `establishmentId` INTEGER NOT NULL,
    `formule` VARCHAR(191) NOT NULL,
    `montantTotal` INTEGER NOT NULL,
    `montantVerse` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `modePaiement` ENUM('mobile_money', 'virement', 'cheque', 'especes') NOT NULL,
    `statut` ENUM('paye', 'partiel', 'en_retard') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Payment_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PricingSettings` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `devise` VARCHAR(191) NOT NULL DEFAULT 'FCFA',
    `cycleParDefaut` ENUM('mensuel', 'annuel') NOT NULL DEFAULT 'annuel',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PerformanceConfig` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `cpuThreshold` INTEGER NOT NULL DEFAULT 80,
    `latencyThreshold` INTEGER NOT NULL DEFAULT 400,
    `storageThreshold` INTEGER NOT NULL DEFAULT 90,
    `cacheTTL` INTEGER NOT NULL DEFAULT 15,
    `maxUploadSize` INTEGER NOT NULL DEFAULT 25,
    `backupFrequency` VARCHAR(191) NOT NULL DEFAULT 'quotidien',
    `backupRetention` INTEGER NOT NULL DEFAULT 30,
    `lazyLoading` BOOLEAN NOT NULL DEFAULT true,
    `compressImages` BOOLEAN NOT NULL DEFAULT true,
    `cdn` BOOLEAN NOT NULL DEFAULT true,
    `queryCache` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Establishment` ADD CONSTRAINT `Establishment_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_establishmentId_fkey` FOREIGN KEY (`establishmentId`) REFERENCES `Establishment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
