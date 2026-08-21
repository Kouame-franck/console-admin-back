-- AlterTable
ALTER TABLE `Offer` ADD COLUMN `cursusLimit` INTEGER NULL,
    ADD COLUMN `modules` JSON NULL,
    ADD COLUMN `roleLimit` INTEGER NULL,
    ADD COLUMN `staffLimit` INTEGER NULL,
    ADD COLUMN `teacherLimit` INTEGER NULL;
