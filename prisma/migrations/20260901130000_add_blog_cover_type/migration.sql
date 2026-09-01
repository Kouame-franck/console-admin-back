-- Couverture d'article vidéo ou image (voir routes/blog.js > /upload-cover) : `image` reste
-- l'URL R2 quel que soit le type, `coverType` distingue comment la rendre côté digyo-site.
ALTER TABLE `BlogPost` ADD COLUMN `coverType` VARCHAR(191) NOT NULL DEFAULT 'image';
