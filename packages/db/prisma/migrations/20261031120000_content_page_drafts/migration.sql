CREATE TABLE `ContentPageDraft` (
  `slug` VARCHAR(60) NOT NULL,
  `title` VARCHAR(200) NULL,
  `blocks` JSON NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
