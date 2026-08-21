-- Achat d'une offre isolee (recharge de credits SMS) dans le registre de paiements unifie.
-- `offerId` devient facultatif : un tel paiement porte une AddonOffer, pas une formule.
ALTER TABLE `PendingPayment`
  MODIFY `type` ENUM('signup', 'renouvellement', 'addon') NOT NULL,
  MODIFY `offerId` INTEGER NULL,
  ADD COLUMN `addonOfferId` INTEGER NULL;

ALTER TABLE `PendingPayment`
  ADD CONSTRAINT `PendingPayment_addonOfferId_fkey`
  FOREIGN KEY (`addonOfferId`) REFERENCES `AddonOffer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
