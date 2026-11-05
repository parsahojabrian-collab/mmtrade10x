-- CreateTable
CREATE TABLE `AcademyQuestion` (
    `id` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NULL,
    `courseId` VARCHAR(191) NULL,
    `prompt` TEXT NOT NULL,
    `options` JSON NOT NULL,
    `correctIndex` INTEGER NOT NULL,
    `explanation` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `AcademyQuestion_lessonId_isActive_idx`(`lessonId`, `isActive`),
    INDEX `AcademyQuestion_courseId_isActive_idx`(`courseId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AcademyQuizAttempt` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `lessonId` VARCHAR(191) NULL,
    `courseId` VARCHAR(191) NULL,
    `questions` JSON NOT NULL,
    `answers` JSON NULL,
    `score` INTEGER NULL,
    `passed` BOOLEAN NOT NULL DEFAULT false,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submittedAt` DATETIME(3) NULL,

    INDEX `AcademyQuizAttempt_userId_lessonId_passed_idx`(`userId`, `lessonId`, `passed`),
    INDEX `AcademyQuizAttempt_userId_courseId_passed_idx`(`userId`, `courseId`, `passed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AcademyQuestion` ADD CONSTRAINT `AcademyQuestion_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcademyQuestion` ADD CONSTRAINT `AcademyQuestion_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcademyQuizAttempt` ADD CONSTRAINT `AcademyQuizAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcademyQuizAttempt` ADD CONSTRAINT `AcademyQuizAttempt_lessonId_fkey` FOREIGN KEY (`lessonId`) REFERENCES `Lesson`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AcademyQuizAttempt` ADD CONSTRAINT `AcademyQuizAttempt_courseId_fkey` FOREIGN KEY (`courseId`) REFERENCES `Course`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

