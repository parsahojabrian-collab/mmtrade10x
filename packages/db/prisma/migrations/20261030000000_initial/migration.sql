-- Initial 10X database schema. Generated from the checked-in Prisma schema.
CREATE TABLE `User` (
  `id` VARCHAR(191) NOT NULL, `telegramId` VARCHAR(191) NULL, `username` VARCHAR(191) NULL,
  `firstName` VARCHAR(191) NULL, `lastName` VARCHAR(191) NULL, `phone` VARCHAR(191) NULL,
  `registrationStatus` ENUM('STARTED','PHONE_PENDING','REGISTERED','COMPLETE') NOT NULL DEFAULT 'STARTED',
  `registrationStage` ENUM('STARTED','CHANNELS_PENDING','CONSENT_PENDING','PHONE_PENDING','REGISTERED','MINI_APP_PENDING','COMPLETE') NOT NULL DEFAULT 'STARTED',
  `registrationSource` VARCHAR(191) NOT NULL DEFAULT 'telegram', `registeredAt` DATETIME(3) NULL,
  `lastActivityAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL, PRIMARY KEY (`id`), UNIQUE INDEX `User_telegramId_key` (`telegramId`),
  INDEX `User_registrationStatus_lastActivityAt_idx` (`registrationStatus`,`lastActivityAt`),
  INDEX `User_registrationStage_lastActivityAt_idx` (`registrationStage`,`lastActivityAt`), INDEX `User_phone_idx` (`phone`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TelegramAccount` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `telegramId` VARCHAR(191) NOT NULL,
  `chatId` VARCHAR(191) NOT NULL, `languageCode` VARCHAR(191) NULL, `isBot` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `TelegramAccount_userId_key` (`userId`), UNIQUE INDEX `TelegramAccount_telegramId_key` (`telegramId`),
  CONSTRAINT `TelegramAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserConsent` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
  `type` ENUM('PRIVACY_PROCESSING','SMS_MARKETING') NOT NULL, `channel` ENUM('TELEGRAM','WEBSITE','MINI_APP') NOT NULL,
  `granted` BOOLEAN NOT NULL, `wordingVersion` VARCHAR(191) NOT NULL, `ipAddress` VARCHAR(191) NULL,
  `userAgent` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  INDEX `UserConsent_userId_type_createdAt_idx` (`userId`,`type`,`createdAt`),
  CONSTRAINT `UserConsent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RegistrationStageEvent` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL,
  `stage` ENUM('STARTED','CHANNELS_PENDING','CONSENT_PENDING','PHONE_PENDING','REGISTERED','MINI_APP_PENDING','COMPLETE') NOT NULL,
  `detail` JSON NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  INDEX `RegistrationStageEvent_userId_createdAt_idx` (`userId`,`createdAt`),
  CONSTRAINT `RegistrationStageEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ChannelMembershipCheck` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `channelId` VARCHAR(191) NOT NULL,
  `isMember` BOOLEAN NOT NULL, `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `errorCode` VARCHAR(191) NULL,
  PRIMARY KEY (`id`), INDEX `ChannelMembershipCheck_userId_checkedAt_idx` (`userId`,`checkedAt`),
  CONSTRAINT `ChannelMembershipCheck_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AdminUser` (
  `id` VARCHAR(191) NOT NULL, `email` VARCHAR(191) NOT NULL, `passwordHash` VARCHAR(191) NOT NULL,
  `role` ENUM('SUPER_ADMIN','USER_MANAGER','SUPPORT','CONTENT_MANAGER','ACADEMY_MANAGER','CHALLENGE_MANAGER','ANALYST','MARKETING_MANAGER') NOT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `AdminUser_email_key` (`email`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AuditLog` (
  `id` VARCHAR(191) NOT NULL, `adminUserId` VARCHAR(191) NULL, `userId` VARCHAR(191) NULL, `action` VARCHAR(191) NOT NULL,
  `entityType` VARCHAR(191) NOT NULL, `entityId` VARCHAR(191) NULL, `metadata` JSON NULL, `ipAddress` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `AuditLog_createdAt_idx` (`createdAt`),
  INDEX `AuditLog_entityType_entityId_idx` (`entityType`,`entityId`),
  CONSTRAINT `AuditLog_adminUserId_fkey` FOREIGN KEY (`adminUserId`) REFERENCES `AdminUser` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `LessonProgress` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `lessonId` VARCHAR(191) NOT NULL,
  `completedAt` DATETIME(3) NULL, `progressPct` INTEGER NOT NULL DEFAULT 0, `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), UNIQUE INDEX `LessonProgress_userId_lessonId_key` (`userId`,`lessonId`),
  CONSTRAINT `LessonProgress_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportTicket` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `subject` VARCHAR(191) NOT NULL,
  `status` ENUM('OPEN','IN_PROGRESS','WAITING_USER','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), INDEX `SupportTicket_status_updatedAt_idx` (`status`,`updatedAt`),
  CONSTRAINT `SupportTicket_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SupportMessage` (
  `id` VARCHAR(191) NOT NULL, `ticketId` VARCHAR(191) NOT NULL, `senderType` VARCHAR(191) NOT NULL,
  `body` TEXT NOT NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`),
  INDEX `SupportMessage_ticketId_createdAt_idx` (`ticketId`,`createdAt`),
  CONSTRAINT `SupportMessage_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `SupportTicket` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Notification` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `channel` VARCHAR(191) NOT NULL,
  `title` VARCHAR(191) NOT NULL, `body` TEXT NOT NULL, `sentAt` DATETIME(3) NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING', `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`), INDEX `Notification_userId_status_createdAt_idx` (`userId`,`status`,`createdAt`),
  CONSTRAINT `Notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FollowUpJob` (
  `id` VARCHAR(191) NOT NULL, `userId` VARCHAR(191) NOT NULL, `dueAt` DATETIME(3) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING', `attempts` INTEGER NOT NULL DEFAULT 0,
  `lastError` VARCHAR(191) NULL, `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`), INDEX `FollowUpJob_status_dueAt_idx` (`status`,`dueAt`),
  CONSTRAINT `FollowUpJob_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SystemSetting` (
  `key` VARCHAR(191) NOT NULL, `value` JSON NOT NULL, `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
