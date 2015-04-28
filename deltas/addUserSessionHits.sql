ALTER TABLE `oose`.`UserSessions`
ADD COLUMN `hits` INT(11) UNSIGNED NOT NULL DEFAULT 0 AFTER `data`,
ADD INDEX `user_session_hits_index` (`hits` DESC);
