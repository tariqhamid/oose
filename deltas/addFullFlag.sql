ALTER TABLE `oose`.`Stores`
ADD COLUMN `full` TINYINT(1) NOT NULL DEFAULT '1' AFTER `port`;
