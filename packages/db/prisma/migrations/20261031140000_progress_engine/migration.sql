CREATE TABLE `ProgressPathVersion` (
  `id` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ProgressPathVersion_version_key` (`version`),
  INDEX `ProgressPathVersion_status_version_idx` (`status`, `version`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ProgressStage` (
  `id` VARCHAR(191) NOT NULL,
  `pathVersionId` VARCHAR(191) NOT NULL,
  `key` VARCHAR(80) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `weight` INTEGER NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `isVisible` BOOLEAN NOT NULL DEFAULT true,
  `completionType` VARCHAR(40) NOT NULL,
  `completionConfig` JSON NULL,
  `prerequisiteIds` JSON NULL,
  `actionType` VARCHAR(20) NULL,
  `actionTarget` VARCHAR(500) NULL,
  `archivedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `ProgressStage_pathVersionId_key_key` (`pathVersionId`, `key`),
  INDEX `ProgressStage_pathVersionId_isActive_sortOrder_idx` (`pathVersionId`, `isActive`, `sortOrder`),
  PRIMARY KEY (`id`),
  CONSTRAINT `ProgressStage_pathVersionId_fkey`
    FOREIGN KEY (`pathVersionId`) REFERENCES `ProgressPathVersion` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserProgressAssignment` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `pathVersionId` VARCHAR(191) NOT NULL,
  `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UserProgressAssignment_userId_key` (`userId`),
  INDEX `UserProgressAssignment_pathVersionId_assignedAt_idx` (`pathVersionId`, `assignedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `UserProgressAssignment_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `UserProgressAssignment_pathVersionId_fkey`
    FOREIGN KEY (`pathVersionId`) REFERENCES `ProgressPathVersion` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserProgressEvent` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `pathVersionId` VARCHAR(191) NOT NULL,
  `stageId` VARCHAR(191) NOT NULL,
  `stageKey` VARCHAR(80) NOT NULL,
  `eventType` ENUM('COMPLETED', 'REVOKED') NOT NULL,
  `source` VARCHAR(40) NOT NULL,
  `proof` JSON NULL,
  `reason` VARCHAR(500) NULL,
  `verifiedByAdminId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `UserProgressEvent_userId_pathVersionId_createdAt_idx` (`userId`, `pathVersionId`, `createdAt`),
  INDEX `UserProgressEvent_userId_pathVersionId_stageId_createdAt_idx` (`userId`, `pathVersionId`, `stageId`, `createdAt`),
  INDEX `UserProgressEvent_stageId_createdAt_idx` (`stageId`, `createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `UserProgressEvent_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
