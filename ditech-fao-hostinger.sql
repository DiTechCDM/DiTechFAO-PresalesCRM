-- ============================================================
--  DiTech FAO — Hostinger Import
--  Import this into your Hostinger phpMyAdmin database.
--  Select the correct database first (u678616493_ditech_fao_crm)
-- ============================================================

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

-- ============================================================
--  REPS (must come before users due to FK)
-- ============================================================
DROP TABLE IF EXISTS `reps`;
CREATE TABLE `reps` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `initials` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `colour` char(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '#1D9E75',
  `calls_per_day` smallint NOT NULL DEFAULT '50',
  `meetings_month` smallint NOT NULL DEFAULT '20',
  `linkedin_per_day` smallint NOT NULL DEFAULT '10',
  `mine_per_day` smallint NOT NULL DEFAULT '25',
  `status` enum('Active','Inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reps_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `reps` VALUES
  ('rep-diksha','Diksha','DK','#1D9E75',50,20,10,25,'Active','2026-03-30 14:31:23','2026-03-30 14:31:23'),
  ('rep-sadichha','Sadichha','SC','#7F77DD',50,20,10,25,'Active','2026-03-30 14:31:23','2026-03-30 14:31:23');

-- ============================================================
--  USERS
-- ============================================================
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('admin','manager','rep') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'rep',
  `status` enum('active','inactive','suspended') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `linked_rep_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `perms` json DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_status` (`status`),
  KEY `fk_users_rep` (`linked_rep_id`),
  CONSTRAINT `fk_users_rep` FOREIGN KEY (`linked_rep_id`) REFERENCES `reps` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `users` VALUES
  ('usr-admin','Admin','admin@ditech.com','$2a$10$u7YSPA6p2gFUr6Z2qHNzT.ohTzEYi1dEW2Cp6WKVk.Eh11lO2Po7S','admin','active',NULL,NULL,NULL,'2026-03-30 14:31:23','2026-03-30 14:31:23'),
  ('usr-diksha','Diksha','diksha@ditech.com','$2a$10$lI8JB3VM/wpjYugpzvHb..eqwmraenZR0eWc1yzOL7IB5HqqMsr/C','rep','active','rep-diksha',NULL,NULL,'2026-03-30 14:31:23','2026-03-30 14:31:23'),
  ('usr-sadichha','Sadichha','sadichha@ditech.com','$2a$10$2jgcN4079eg8BF94kBIT/.1GB6zex3cL8QuwwCw6k35znqO.yNz9i','rep','active','rep-sadichha',NULL,NULL,'2026-03-30 14:31:23','2026-03-30 14:31:23');

-- ============================================================
--  FINANCIAL YEARS
-- ============================================================
DROP TABLE IF EXISTS `financial_years`;
CREATE TABLE `financial_years` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `label` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_year` smallint NOT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive',
  `locked` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fy_label` (`label`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `financial_years` VALUES
  ('fy-2026-27','FY 2026-27',2026,'active',0,'2026-03-30 14:31:23');

-- ============================================================
--  KPI TARGETS
-- ============================================================
DROP TABLE IF EXISTS `kpi_targets`;
CREATE TABLE `kpi_targets` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `rep_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fy_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `calls_per_day` smallint NOT NULL DEFAULT '50',
  `meetings_month` smallint NOT NULL DEFAULT '20',
  `linkedin_per_day` smallint NOT NULL DEFAULT '10',
  `mine_per_day` smallint NOT NULL DEFAULT '25',
  `leads_month` smallint NOT NULL DEFAULT '100',
  `qual_rate` tinyint NOT NULL DEFAULT '40',
  `engage_rate` tinyint NOT NULL DEFAULT '50',
  `close_rate` tinyint NOT NULL DEFAULT '30',
  `q1_leads` smallint NOT NULL DEFAULT '120',
  `q2_leads` smallint NOT NULL DEFAULT '240',
  `q3_leads` smallint NOT NULL DEFAULT '240',
  `q4_leads` smallint NOT NULL DEFAULT '240',
  `rev_fte` int NOT NULL DEFAULT '0',
  `rev_payg` int NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_kpi_rep_fy` (`rep_id`,`fy_id`),
  KEY `fk_kpi_fy` (`fy_id`),
  CONSTRAINT `fk_kpi_fy` FOREIGN KEY (`fy_id`) REFERENCES `financial_years` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_kpi_rep` FOREIGN KEY (`rep_id`) REFERENCES `reps` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `kpi_targets` VALUES
  ('06c71562-2c17-11f1-a589-046874ef81e0',NULL,'fy-2026-27',50,20,10,25,40,40,50,30,120,240,240,240,2700,4500,'2026-03-30 14:31:23','2026-03-30 14:31:23');

-- ============================================================
--  FIRMS
-- ============================================================
DROP TABLE IF EXISTS `firms`;
CREATE TABLE `firms` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ch_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `region` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `size` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `staff_count` smallint DEFAULT NULL,
  `website` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linkedin` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `main_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `software` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `stage` enum('Lead','Suspect','Proposal','Win','Lost') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Lead',
  `assigned_rep_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pricing_model` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `service_interest` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `win_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `last_contact` date DEFAULT NULL,
  `follow_up` date DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `added_by` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `added_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_firms_stage` (`stage`),
  KEY `idx_firms_rep` (`assigned_rep_id`),
  KEY `idx_firms_city` (`city`),
  KEY `idx_firms_software` (`software`),
  KEY `idx_firms_follow_up` (`follow_up`),
  KEY `idx_firms_last_contact` (`last_contact`),
  FULLTEXT KEY `idx_firms_search` (`name`,`city`,`notes`),
  CONSTRAINT `fk_firms_rep` FOREIGN KEY (`assigned_rep_id`) REFERENCES `reps` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `firms` VALUES
  ('xmnczztuaaepg','Wayne Industries ','Wayne family ','Gotham City ','South West','Large (50+)',50,NULL,NULL,NULL,NULL,NULL,'Win','rep-diksha',NULL,NULL,0.00,'2026-03-30',NULL,NULL,'Admin','2026-03-30 00:00:00','2026-03-30 16:22:55'),
  ('xmnd351vjcjrf','Stark Industries ','Stsark and family ','Night CITY ','Midlands','Mid (11-50)',NULL,NULL,NULL,NULL,NULL,NULL,'Lead',NULL,NULL,NULL,0.00,NULL,NULL,NULL,'Admin','2026-03-30 00:00:00','2026-03-30 16:38:59');

-- ============================================================
--  FIRM CONTACTS
-- ============================================================
DROP TABLE IF EXISTS `firm_contacts`;
CREATE TABLE `firm_contacts` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `firm_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `linkedin` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `is_primary` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fc_firm` (`firm_id`),
  KEY `idx_fc_primary` (`firm_id`,`is_primary`),
  CONSTRAINT `fk_fc_firm` FOREIGN KEY (`firm_id`) REFERENCES `firms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `firm_contacts` VALUES
  ('xmnd1r3f6dx49','xmnczztuaaepg','wayne sir ',NULL,NULL,NULL,NULL,NULL,1,'2026-03-30 16:22:55','2026-03-30 16:22:55');

-- ============================================================
--  CALLS
-- ============================================================
DROP TABLE IF EXISTS `calls`;
CREATE TABLE `calls` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `rep_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_contact_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `contact_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rep_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` enum('call','followup','linkedin','email','meeting') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'call',
  `outcome` enum('mtg','cb','in','na','gk','ni','vm') COLLATE utf8mb4_unicode_ci NOT NULL,
  `stage_at_time` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `follow_up_date` date DEFAULT NULL,
  `meeting_date` date DEFAULT NULL,
  `logged_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_calls_rep` (`rep_id`),
  KEY `idx_calls_firm` (`firm_id`),
  KEY `idx_calls_outcome` (`outcome`),
  KEY `idx_calls_type` (`type`),
  KEY `idx_calls_logged` (`logged_at`),
  KEY `idx_calls_rep_day` (`rep_id`,`logged_at`),
  KEY `fk_calls_contact` (`firm_contact_id`),
  CONSTRAINT `fk_calls_contact` FOREIGN KEY (`firm_contact_id`) REFERENCES `firm_contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_calls_firm` FOREIGN KEY (`firm_id`) REFERENCES `firms` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_calls_rep` FOREIGN KEY (`rep_id`) REFERENCES `reps` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `calls` VALUES
  ('xmnd000zf3c5d',NULL,'xmnczztuaaepg',NULL,'Wayne Industries ',NULL,'Admin','linkedin','mtg',NULL,NULL,NULL,NULL,'2026-03-30 09:41:05'),
  ('xmnd1b5j8lzmh',NULL,'xmnczztuaaepg',NULL,'Wayne Industries ','ffffffff','Admin','linkedin','mtg',NULL,NULL,NULL,NULL,'2026-03-30 10:17:44'),
  ('xmnd1sgisawfw',NULL,'xmnczztuaaepg',NULL,'Wayne Industries ','wayne sir ','Admin','call','na',NULL,NULL,NULL,NULL,'2026-03-30 10:31:11'),
  ('xmnd200o3hhos','rep-diksha','xmnczztuaaepg',NULL,'Wayne Industries ','wayne sir ','Diksha','linkedin','gk',NULL,NULL,NULL,NULL,'2026-03-30 10:37:04'),
  ('xmnd2fsr63heo',NULL,'xmnczztuaaepg',NULL,'Wayne Industries ','wayne sir ','Admin','call','vm','Proposal',NULL,NULL,NULL,'2026-03-30 10:49:20'),
  ('xmnd2gah8p64u',NULL,'xmnczztuaaepg',NULL,'Wayne Industries ','wayne sir ','Admin','call','in','Win',NULL,NULL,NULL,'2026-03-30 10:49:43'),
  ('xmnd2hgd0paa4',NULL,'xmnczztuaaepg',NULL,'Wayne Industries ','wayne sir ','Admin','call','vm','Proposal',NULL,NULL,NULL,'2026-03-30 10:50:37'),
  ('xmnd2kei6fvkg',NULL,'xmnczztuaaepg',NULL,'Wayne Industries ','wayne sir ','Admin','call','gk','Win',NULL,NULL,NULL,'2026-03-30 10:52:55');

-- ============================================================
--  REMINDERS
-- ============================================================
DROP TABLE IF EXISTS `reminders`;
CREATE TABLE `reminders` (
  `id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT (uuid()),
  `rep_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `firm_contact_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `type` enum('follow-up','meeting','task','linkedin','proposal') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'follow-up',
  `title` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `due_date` date NOT NULL,
  `due_time` time DEFAULT NULL,
  `done` tinyint(1) NOT NULL DEFAULT '0',
  `done_at` datetime DEFAULT NULL,
  `done_by_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_from` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rem_rep` (`rep_id`),
  KEY `idx_rem_firm` (`firm_id`),
  KEY `idx_rem_due` (`due_date`),
  KEY `idx_rem_done` (`done`),
  KEY `idx_rem_overdue` (`done`,`due_date`),
  KEY `fk_rem_contact` (`firm_contact_id`),
  KEY `fk_rem_done_by` (`done_by_id`),
  CONSTRAINT `fk_rem_contact` FOREIGN KEY (`firm_contact_id`) REFERENCES `firm_contacts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rem_done_by` FOREIGN KEY (`done_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rem_firm` FOREIGN KEY (`firm_id`) REFERENCES `firms` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_rem_rep` FOREIGN KEY (`rep_id`) REFERENCES `reps` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `reminders` VALUES
  ('xmnd056td08lp','rep-diksha','xmnd351vjcjrf',NULL,'follow-up','andrews calls ',NULL,'2026-03-30','15:15:00',0,NULL,NULL,'manual','2026-03-30 09:45:06','2026-03-30 16:46:07'),
  ('xmnd0612ipzg2',NULL,'xmnczztuaaepg',NULL,'linkedin','meeting with wayne ',NULL,'2026-03-29','15:02:00',0,NULL,NULL,'manual','2026-03-30 09:45:45','2026-03-30 16:16:40'),
  ('xmnd2bmjtbsds','rep-sadichha',NULL,NULL,'follow-up','call with ashsih ',NULL,'2026-03-31','09:00:00',0,NULL,NULL,'manual','2026-03-30 10:46:05','2026-03-30 16:16:20');

-- ============================================================
--  ADMIN SETTINGS
-- ============================================================
DROP TABLE IF EXISTS `admin_settings`;
CREATE TABLE `admin_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `key_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_by` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_setting` (`category`,`key_name`),
  KEY `fk_settings_user` (`updated_by`),
  CONSTRAINT `fk_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `admin_settings` VALUES
  (1,'dropdown','software','[\"Xero\",\"QuickBooks\",\"Sage 50\",\"Sage Cloud\",\"IRIS Suite\",\"CCH\",\"FreeAgent\",\"Alphatax\",\"TaxCalc\",\"Multiple\",\"Other\"]',NULL,'2026-03-30 14:31:23'),
  (2,'dropdown','source','[\"Data mining\",\"LinkedIn\",\"Event\",\"SEO / Inbound\",\"Referral\"]',NULL,'2026-03-30 14:31:23'),
  (3,'dropdown','stage','[\"Lead\",\"Suspect\",\"Proposal\",\"Win\",\"Lost\"]',NULL,'2026-03-30 14:31:23'),
  (4,'role_perm','rep','{\"export\":false,\"delete\":false,\"addFirm\":true,\"editFirm\":true,\"viewAll\":false,\"logCall\":true,\"bulkOps\":false,\"viewReports\":true}',NULL,'2026-03-30 14:31:23'),
  (5,'role_perm','manager','{\"export\":true,\"delete\":false,\"addFirm\":true,\"editFirm\":true,\"viewAll\":true,\"logCall\":true,\"bulkOps\":true,\"viewReports\":true}',NULL,'2026-03-30 14:31:23'),
  (6,'role_perm','admin','{\"export\":true,\"delete\":true,\"addFirm\":true,\"editFirm\":true,\"viewAll\":true,\"logCall\":true,\"bulkOps\":true,\"viewReports\":true}',NULL,'2026-03-30 14:31:23'),
  (7,'general','company','\"DiTech FAO\"',NULL,'2026-03-30 14:31:23'),
  (8,'general','adminEmail','\"admin@ditech.com\"',NULL,'2026-03-30 14:31:23'),
  (9,'general','market','\"UK Accounting Firms\"',NULL,'2026-03-30 14:31:23'),
  (10,'general','currency','\"GBP (\\u00a3)\"',NULL,'2026-03-30 14:31:23');

-- ============================================================
--  AUDIT LOG (empty — will be filled by the application)
-- ============================================================
DROP TABLE IF EXISTS `audit_log`;
CREATE TABLE `audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_role` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `table_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `record_id` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `record_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_table` (`table_name`,`record_id`),
  KEY `idx_audit_created` (`created_at`),
  CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  DONE — No views included (the original dump had views with
--  DEFINER=root@localhost which errors on Hostinger).
-- ============================================================

/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;
/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
