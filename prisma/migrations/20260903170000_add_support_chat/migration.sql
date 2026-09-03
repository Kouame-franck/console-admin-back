-- Chat d'assistance du site digyo (widget SupportWidget.jsx) -- remplace le localStorage
-- fantôme de useSupportChat.js par de vraies conversations gérées depuis la console.
CREATE TABLE `SupportConversation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `visitorToken` VARCHAR(191) NOT NULL,
    `visitorName` VARCHAR(191) NULL,
    `visitorEmail` VARCHAR(191) NULL,
    `status` ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
    `unreadForStaff` BOOLEAN NOT NULL DEFAULT true,
    `unreadForVisitor` BOOLEAN NOT NULL DEFAULT false,
    `lastMessageAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SupportConversation_visitorToken_key`(`visitorToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportMessage` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `conversationId` INTEGER NOT NULL,
    `from` ENUM('visitor', 'staff', 'auto') NOT NULL,
    `text` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SupportMessage_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SupportMessage` ADD CONSTRAINT `SupportMessage_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `SupportConversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
