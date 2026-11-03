-- CreateTable
CREATE TABLE `TelegramTeamAdmin` (
    `id` VARCHAR(191) NOT NULL,
    `telegramId` VARCHAR(32) NOT NULL,
    `displayName` VARCHAR(100) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'USER_MANAGER', 'SUPPORT', 'CONTENT_MANAGER', 'ACADEMY_MANAGER', 'CHALLENGE_MANAGER', 'ANALYST', 'MARKETING_MANAGER') NOT NULL DEFAULT 'USER_MANAGER',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TelegramTeamAdmin_telegramId_key`(`telegramId`),
    INDEX `TelegramTeamAdmin_isActive_role_idx`(`isActive`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EplanetUserWorkflow` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(100) NULL,
    `accountCreated` BOOLEAN NOT NULL DEFAULT false,
    `depositCompleted` BOOLEAN NOT NULL DEFAULT false,
    `copyConnected` BOOLEAN NOT NULL DEFAULT false,
    `challengeParticipant` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(500) NULL,
    `version` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `EplanetUserWorkflow_userId_key`(`userId`),
    INDEX `EplanetUserWorkflow_challengeParticipant_updatedAt_idx`(`challengeParticipant`, `updatedAt`),
    INDEX `EplanetUserWorkflow_copyConnected_updatedAt_idx`(`copyConnected`, `updatedAt`),
    INDEX `EplanetUserWorkflow_depositCompleted_updatedAt_idx`(`depositCompleted`, `updatedAt`),
    INDEX `EplanetUserWorkflow_accountCreated_updatedAt_idx`(`accountCreated`, `updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EplanetUserWorkflow` ADD CONSTRAINT `EplanetUserWorkflow_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

