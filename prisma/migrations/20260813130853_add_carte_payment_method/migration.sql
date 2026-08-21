-- AlterTable
ALTER TABLE `Payment` MODIFY `modePaiement` ENUM('mobile_money', 'virement', 'cheque', 'especes', 'carte') NOT NULL;
