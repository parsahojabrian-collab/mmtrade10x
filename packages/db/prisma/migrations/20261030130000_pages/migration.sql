-- CreateTable
CREATE TABLE `ContentPage` (
    `slug` VARCHAR(60) NOT NULL,
    `title` VARCHAR(200) NULL,
    `blocks` JSON NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Popup` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `body` TEXT NOT NULL,
    `imageUrl` VARCHAR(500) NULL,
    `buttonText` VARCHAR(80) NULL,
    `buttonUrl` VARCHAR(500) NULL,
    `pageSlug` VARCHAR(60) NOT NULL,
    `frequency` ENUM('ONCE', 'EVERY_VISIT') NOT NULL DEFAULT 'ONCE',
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Popup_pageSlug_status_idx`(`pageSlug`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PopupView` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `popupId` VARCHAR(191) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PopupView_userId_popupId_key`(`userId`, `popupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Seed: home page with the two progress bars (published) and a challenge intro popup (draft, edit it in the panel)
INSERT INTO `ContentPage` (`slug`, `title`, `blocks`, `status`, `updatedAt`) VALUES
('index', NULL, '[{"type":"progress","kind":"registration","title":"پیشرفت ثبت‌نام"},{"type":"progress","kind":"academy","title":"پیشرفت آکادمی"}]', 'PUBLISHED', CURRENT_TIMESTAMP(3));
INSERT INTO `Popup` (`id`, `title`, `body`, `buttonText`, `buttonUrl`, `pageSlug`, `frequency`, `status`, `updatedAt`) VALUES
('popup_challenge_intro', 'معرفی چالش 10X', 'متن معرفی چالش را از پنل مدیریت (صفحه‌ها و پاپ‌آپ) ویرایش کن و بعد منتشرش کن.', 'مشاهده‌ی چالش', '/miniapp/challenge.html', 'index', 'ONCE', 'DRAFT', CURRENT_TIMESTAMP(3));
