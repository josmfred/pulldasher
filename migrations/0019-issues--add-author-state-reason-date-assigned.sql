ALTER TABLE `issues`
ADD COLUMN `author` varchar(255) NOT NULL DEFAULT 'ghost' AFTER `assignee`,
ADD COLUMN `state_reason` varchar(30) DEFAULT NULL AFTER `status`,
ADD COLUMN `date_assigned` int DEFAULT NULL AFTER `date_created`;
