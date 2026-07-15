ALTER TABLE `pulls` ADD COLUMN `assignees` text COLLATE utf8mb4_general_ci DEFAULT NULL AFTER `owner`;
