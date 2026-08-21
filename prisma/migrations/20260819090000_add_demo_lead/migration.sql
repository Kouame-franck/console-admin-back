-- Demandes d'accès au compte test s-school (site digyo). Le compte lui-même est unique et
-- partagé (voir DEMO_SSCHOOL_* dans .env) ; cette table trace uniquement qui l'a demandé.
CREATE TABLE `DemoLead` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nom` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `telephone` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
