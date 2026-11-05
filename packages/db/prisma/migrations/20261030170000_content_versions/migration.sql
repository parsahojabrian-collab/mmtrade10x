CREATE TABLE `ContentPageVersion` (
  `id` VARCHAR(191) NOT NULL,
  `pageSlug` VARCHAR(60) NOT NULL,
  `version` INTEGER NOT NULL,
  `title` VARCHAR(200) NULL,
  `blocks` JSON NOT NULL,
  `status` ENUM('DRAFT','PUBLISHED') NOT NULL,
  `createdByAdminId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ContentPageVersion_pageSlug_version_key` (`pageSlug`, `version`),
  INDEX `ContentPageVersion_pageSlug_createdAt_idx` (`pageSlug`, `createdAt`),
  INDEX `ContentPageVersion_createdByAdminId_idx` (`createdByAdminId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ContentPageVersion_createdByAdminId_fkey` FOREIGN KEY (`createdByAdminId`) REFERENCES `AdminUser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
