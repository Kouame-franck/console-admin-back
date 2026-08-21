-- Articles de blog digyo : la console devient la seule source de vérité (voir routes/blog.js,
-- routes/publicPortal.js). Peuplée initialement par scripts/seedBlogPosts.js, qui reprend les
-- articles jusqu'ici codés en dur côté digyo-site (front/src/data/blog.js) pour ne rien perdre.
CREATE TABLE `BlogPost` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `excerpt` TEXT NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `readTime` VARCHAR(191) NOT NULL,
    `author` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NOT NULL,
    `image` TEXT NOT NULL,
    `body` JSON NOT NULL,
    `published` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BlogPost_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
