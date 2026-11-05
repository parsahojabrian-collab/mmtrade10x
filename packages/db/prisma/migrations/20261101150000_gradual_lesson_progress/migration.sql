ALTER TABLE `LessonProgress`
  ADD COLUMN `videoProgressPct` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `contentProgressPct` INTEGER NOT NULL DEFAULT 0;

-- Preserve every lesson that was already marked completed before this migration.
UPDATE `LessonProgress`
SET
  `videoProgressPct` = 100,
  `contentProgressPct` = 100,
  `progressPct` = 100
WHERE `completedAt` IS NOT NULL;
