-- ============================================================
--  DiTech FAO Presales CRM — MySQL Database Schema
--  Version 1.0
--  Run this entire file once to set up your database.
--  Compatible with MySQL 8.0+ and MariaDB 10.6+
-- ============================================================

CREATE DATABASE IF NOT EXISTS ditech_fao
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ditech_fao;

-- ============================================================
--  1. USERS
--  Stores all login accounts (admin, reps, managers)
-- ============================================================
CREATE TABLE users (
  id            CHAR(36)        NOT NULL DEFAULT (UUID()),
  name          VARCHAR(100)    NOT NULL,
  email         VARCHAR(200)    NOT NULL UNIQUE,
  password_hash VARCHAR(255)    NOT NULL,           -- bcrypt hash, never plain text
  role          ENUM('admin','manager','rep')        NOT NULL DEFAULT 'rep',
  status        ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  linked_rep_id CHAR(36)        NULL,               -- FK to reps.id (set after reps created)
  perms         JSON            NULL,               -- per-user permission overrides (JSON object)
  last_login_at DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_users_email  (email),
  INDEX idx_users_role   (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB;


-- ============================================================
--  2. REPS
--  Sales rep profiles — targets, colours, display settings
-- ============================================================
CREATE TABLE reps (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  name             VARCHAR(100) NOT NULL,
  initials         CHAR(3)      NOT NULL,
  colour           CHAR(7)      NOT NULL DEFAULT '#1D9E75',  -- hex colour e.g. #1D9E75
  calls_per_day    SMALLINT     NOT NULL DEFAULT 50,
  meetings_month   SMALLINT     NOT NULL DEFAULT 20,
  linkedin_per_day SMALLINT     NOT NULL DEFAULT 10,
  mine_per_day     SMALLINT     NOT NULL DEFAULT 25,  -- data-mining calls target
  status           ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_reps_status (status)
) ENGINE=InnoDB;

-- Add FK from users to reps now that reps table exists
ALTER TABLE users
  ADD CONSTRAINT fk_users_rep
  FOREIGN KEY (linked_rep_id) REFERENCES reps(id)
  ON DELETE SET NULL;


-- ============================================================
--  3. FINANCIAL YEARS
--  e.g. FY 2026-27 = Apr 2026 to Mar 2027
-- ============================================================
CREATE TABLE financial_years (
  id         CHAR(36)                   NOT NULL DEFAULT (UUID()),
  label      VARCHAR(20)                NOT NULL,   -- e.g. "FY 2026-27"
  start_year SMALLINT                   NOT NULL,   -- e.g. 2026
  status     ENUM('active','inactive')  NOT NULL DEFAULT 'inactive',
  locked     TINYINT(1)                 NOT NULL DEFAULT 0,
  created_at DATETIME                   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fy_label (label)
) ENGINE=InnoDB;


-- ============================================================
--  4. KPI TARGETS
--  Per-rep, per-financial-year performance targets
-- ============================================================
CREATE TABLE kpi_targets (
  id               CHAR(36)   NOT NULL DEFAULT (UUID()),
  rep_id           CHAR(36)   NULL,      -- NULL = global/default target
  fy_id            CHAR(36)   NOT NULL,
  calls_per_day    SMALLINT   NOT NULL DEFAULT 50,
  meetings_month   SMALLINT   NOT NULL DEFAULT 20,
  linkedin_per_day SMALLINT   NOT NULL DEFAULT 10,
  mine_per_day     SMALLINT   NOT NULL DEFAULT 25,   -- data-mining calls target
  leads_month      SMALLINT   NOT NULL DEFAULT 100,
  qual_rate        TINYINT    NOT NULL DEFAULT 40,   -- % Lead → Suspect target
  engage_rate      TINYINT    NOT NULL DEFAULT 50,   -- % Suspect → Proposal target
  close_rate       TINYINT    NOT NULL DEFAULT 30,   -- % Proposal → Win target
  q1_leads         SMALLINT   NOT NULL DEFAULT 120,
  q2_leads         SMALLINT   NOT NULL DEFAULT 240,
  q3_leads         SMALLINT   NOT NULL DEFAULT 240,
  q4_leads         SMALLINT   NOT NULL DEFAULT 240,
  rev_fte          INT        NOT NULL DEFAULT 0,    -- £ FTE revenue target
  rev_payg         INT        NOT NULL DEFAULT 0,    -- £ PAYG revenue target
  created_at       DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kpi_rep_fy (rep_id, fy_id),
  CONSTRAINT fk_kpi_rep FOREIGN KEY (rep_id) REFERENCES reps(id) ON DELETE CASCADE,
  CONSTRAINT fk_kpi_fy  FOREIGN KEY (fy_id)  REFERENCES financial_years(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- ============================================================
--  5. FIRMS
--  UK accounting firms — the core prospecting database
-- ============================================================
CREATE TABLE firms (
  id               CHAR(36)      NOT NULL DEFAULT (UUID()),
  name             VARCHAR(200)  NOT NULL,
  ch_number        VARCHAR(20)   NULL,               -- Companies House number
  city             VARCHAR(100)  NULL,
  region           VARCHAR(100)  NULL,
  size             VARCHAR(30)   NULL,                -- 'SME (1–10)', 'Mid (11–50)', 'Large (50+)'
  staff_count      SMALLINT      NULL,
  website          VARCHAR(300)  NULL,
  linkedin         VARCHAR(300)  NULL,                -- company LinkedIn
  main_phone       VARCHAR(30)   NULL,                -- switchboard
  software         VARCHAR(100)  NULL,                -- accounting software used
  source           VARCHAR(100)  NULL,                -- lead source
  stage            ENUM('Lead','Suspect','Proposal','Win','Lost') NOT NULL DEFAULT 'Lead',
  assigned_rep_id  CHAR(36)      NULL,
  pricing_model    VARCHAR(50)   NULL,                -- FTE, PAYG, Both
  service_interest VARCHAR(100)  NULL,
  win_amount       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  last_contact     DATE          NULL,
  follow_up        DATE          NULL,
  notes            TEXT          NULL,
  added_by         VARCHAR(100)  NULL,
  added_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_firms_stage       (stage),
  INDEX idx_firms_rep         (assigned_rep_id),
  INDEX idx_firms_city        (city),
  INDEX idx_firms_software    (software),
  INDEX idx_firms_follow_up   (follow_up),
  INDEX idx_firms_last_contact(last_contact),
  FULLTEXT idx_firms_search   (name, city, notes),   -- enables fast text search
  CONSTRAINT fk_firms_rep FOREIGN KEY (assigned_rep_id) REFERENCES reps(id) ON DELETE SET NULL
) ENGINE=InnoDB;


-- ============================================================
--  6. FIRM CONTACTS
--  Multiple contacts per firm (partners, FDs, practice managers)
-- ============================================================
CREATE TABLE firm_contacts (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  firm_id    CHAR(36)     NOT NULL,
  name       VARCHAR(150) NOT NULL,
  title      VARCHAR(150) NULL,                     -- job title
  phone      VARCHAR(30)  NULL,                     -- direct line
  email      VARCHAR(200) NULL,
  linkedin   VARCHAR(300) NULL,
  notes      TEXT         NULL,                     -- e.g. "key DM, friendly, mention referral"
  is_primary TINYINT(1)   NOT NULL DEFAULT 0,       -- 1 = shown in firms table
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_fc_firm     (firm_id),
  INDEX idx_fc_primary  (firm_id, is_primary),
  CONSTRAINT fk_fc_firm FOREIGN KEY (firm_id) REFERENCES firms(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- ============================================================
--  7. CALLS
--  Every call, LinkedIn message, email, meeting logged
-- ============================================================
CREATE TABLE calls (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  rep_id          CHAR(36)     NULL,
  firm_id         CHAR(36)     NULL,
  firm_contact_id CHAR(36)     NULL,                -- which contact was spoken to
  firm_name       VARCHAR(200) NULL,                -- denormalised for fast display
  contact_name    VARCHAR(150) NULL,                -- denormalised
  rep_name        VARCHAR(100) NULL,                -- denormalised
  type            ENUM('call','followup','linkedin','email','meeting') NOT NULL DEFAULT 'call',
  outcome         ENUM('mtg','cb','in','na','gk','ni','vm') NOT NULL,
  stage_at_time   VARCHAR(30)  NULL,                -- stage of firm when call was logged
  notes           TEXT         NULL,
  follow_up_date  DATE         NULL,
  meeting_date    DATE         NULL,
  logged_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_calls_rep     (rep_id),
  INDEX idx_calls_firm    (firm_id),
  INDEX idx_calls_outcome (outcome),
  INDEX idx_calls_type    (type),
  INDEX idx_calls_logged  (logged_at),
  INDEX idx_calls_rep_day (rep_id, logged_at),      -- fast daily KPI queries
  CONSTRAINT fk_calls_rep     FOREIGN KEY (rep_id)          REFERENCES reps(id)         ON DELETE SET NULL,
  CONSTRAINT fk_calls_firm    FOREIGN KEY (firm_id)         REFERENCES firms(id)        ON DELETE SET NULL,
  CONSTRAINT fk_calls_contact FOREIGN KEY (firm_contact_id) REFERENCES firm_contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB;


-- ============================================================
--  8. REMINDERS & TASKS
--  Follow-up calls, meetings, tasks, LinkedIn outreach
-- ============================================================
CREATE TABLE reminders (
  id              CHAR(36)     NOT NULL DEFAULT (UUID()),
  rep_id          CHAR(36)     NULL,
  firm_id         CHAR(36)     NULL,
  firm_contact_id CHAR(36)     NULL,
  type            ENUM('follow-up','meeting','task','linkedin','proposal') NOT NULL DEFAULT 'follow-up',
  title           VARCHAR(300) NOT NULL,
  notes           TEXT         NULL,
  due_date        DATE         NOT NULL,
  due_time        TIME         NULL,
  done            TINYINT(1)   NOT NULL DEFAULT 0,
  done_at         DATETIME     NULL,
  done_by_id      CHAR(36)     NULL,
  created_from    VARCHAR(50)  NULL,                -- 'call-tracker', 'firms-db', 'manual'
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_rem_rep      (rep_id),
  INDEX idx_rem_firm     (firm_id),
  INDEX idx_rem_due      (due_date),
  INDEX idx_rem_done     (done),
  INDEX idx_rem_overdue  (done, due_date),          -- fast overdue count query
  CONSTRAINT fk_rem_rep     FOREIGN KEY (rep_id)          REFERENCES reps(id)          ON DELETE SET NULL,
  CONSTRAINT fk_rem_firm    FOREIGN KEY (firm_id)         REFERENCES firms(id)         ON DELETE SET NULL,
  CONSTRAINT fk_rem_contact FOREIGN KEY (firm_contact_id) REFERENCES firm_contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_rem_done_by FOREIGN KEY (done_by_id)      REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB;


-- ============================================================
--  9. ADMIN SETTINGS
--  Dropdown options, role permissions — flexible key-value
-- ============================================================
CREATE TABLE admin_settings (
  id         INT          NOT NULL AUTO_INCREMENT,
  category   VARCHAR(50)  NOT NULL,   -- e.g. 'dropdown', 'role_perm', 'general'
  key_name   VARCHAR(100) NOT NULL,   -- e.g. 'software', 'source', 'rep.export'
  value      TEXT         NOT NULL,   -- JSON string for complex values
  updated_by CHAR(36)     NULL,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_setting (category, key_name),
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;


-- ============================================================
--  10. AUDIT LOG
--  Every action by every user — immutable record
-- ============================================================
CREATE TABLE audit_log (
  id          BIGINT       NOT NULL AUTO_INCREMENT,  -- BIGINT — will grow large
  user_id     CHAR(36)     NULL,
  user_name   VARCHAR(100) NULL,                     -- denormalised — survives user deletion
  user_role   VARCHAR(20)  NULL,
  action      VARCHAR(100) NOT NULL,                 -- e.g. 'firm.created', 'call.logged', 'user.login'
  table_name  VARCHAR(50)  NULL,                     -- e.g. 'firms', 'calls'
  record_id   CHAR(36)     NULL,                     -- ID of the affected record
  record_name VARCHAR(200) NULL,                     -- e.g. firm name — for readable log display
  old_value   JSON         NULL,                     -- previous state (for edits)
  new_value   JSON         NULL,                     -- new state
  ip_address  VARCHAR(45)  NULL,                     -- IPv4 or IPv6
  user_agent  VARCHAR(300) NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_user    (user_id),
  INDEX idx_audit_action  (action),
  INDEX idx_audit_table   (table_name, record_id),
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;


-- ============================================================
--  SEED DATA — Default admin user, reps, FY, dropdowns
--  Change the password_hash before going live!
--  This hash = 'admin123' — replace with a real bcrypt hash
-- ============================================================

-- Default financial year
INSERT INTO financial_years (id, label, start_year, status) VALUES
  ('fy-2026-27', 'FY 2026-27', 2026, 'active');

-- Default reps
INSERT INTO reps (id, name, initials, colour, calls_per_day, meetings_month, linkedin_per_day, mine_per_day) VALUES
  ('rep-diksha',   'Diksha',   'DK', '#1D9E75', 50, 20, 10, 25),
  ('rep-sadichha', 'Sadichha', 'SC', '#7F77DD', 50, 20, 10, 25);

-- Default admin user (password = 'admin123' — CHANGE THIS)
INSERT INTO users (id, name, email, password_hash, role, status) VALUES
  ('usr-admin', 'Admin', 'admin@ditech.com',
   '$2b$10$PLACEHOLDER_REPLACE_WITH_REAL_BCRYPT_HASH', 'admin', 'active');

-- Rep users
INSERT INTO users (id, name, email, password_hash, role, status, linked_rep_id) VALUES
  ('usr-diksha',   'Diksha',   'diksha@ditech.com',   '$2b$10$PLACEHOLDER_REPLACE_WITH_REAL_BCRYPT_HASH', 'rep', 'active', 'rep-diksha'),
  ('usr-sadichha', 'Sadichha', 'sadichha@ditech.com', '$2b$10$PLACEHOLDER_REPLACE_WITH_REAL_BCRYPT_HASH', 'rep', 'active', 'rep-sadichha');

-- Default KPI targets (global, not rep-specific)
INSERT INTO kpi_targets (rep_id, fy_id, calls_per_day, meetings_month, linkedin_per_day, mine_per_day,
                         leads_month, qual_rate, engage_rate, close_rate,
                         q1_leads, q2_leads, q3_leads, q4_leads, rev_fte, rev_payg) VALUES
  (NULL, 'fy-2026-27', 50, 20, 10, 25, 40, 40, 50, 30, 120, 240, 240, 240, 2700, 4500);

-- Default dropdown options
INSERT INTO admin_settings (category, key_name, value) VALUES
  ('dropdown', 'software', '["Xero","QuickBooks","Sage 50","Sage Cloud","IRIS Suite","CCH","FreeAgent","Alphatax","TaxCalc","Multiple","Other"]'),
  ('dropdown', 'source',   '["Data mining","LinkedIn","Event","SEO / Inbound","Referral"]'),
  ('dropdown', 'stage',    '["Lead","Suspect","Proposal","Win","Lost"]'),
  ('role_perm', 'rep',     '{"export":false,"delete":false,"addFirm":true,"editFirm":true,"viewAll":false,"logCall":true,"bulkOps":false,"viewReports":true}'),
  ('role_perm', 'manager', '{"export":true,"delete":false,"addFirm":true,"editFirm":true,"viewAll":true,"logCall":true,"bulkOps":true,"viewReports":true}'),
  ('role_perm', 'admin',   '{"export":true,"delete":true,"addFirm":true,"editFirm":true,"viewAll":true,"logCall":true,"bulkOps":true,"viewReports":true}'),
  ('general',   'company',    '"DiTech FAO"'),
  ('general',   'adminEmail', '"admin@ditech.com"'),
  ('general',   'market',     '"UK Accounting Firms"'),
  ('general',   'currency',   '"GBP (£)"');


-- ============================================================
--  USEFUL VIEWS — pre-built queries for your backend API
-- ============================================================

-- Active pipeline with primary contact
CREATE VIEW vw_pipeline AS
SELECT
  f.id, f.name, f.city, f.region, f.stage, f.win_amount,
  f.last_contact, f.follow_up, f.software, f.source,
  r.name  AS assigned_rep,
  fc.name AS primary_contact_name,
  fc.title AS primary_contact_title,
  fc.phone AS primary_contact_phone,
  fc.email AS primary_contact_email
FROM firms f
LEFT JOIN reps r         ON r.id = f.assigned_rep_id
LEFT JOIN firm_contacts fc ON fc.firm_id = f.id AND fc.is_primary = 1
WHERE f.stage NOT IN ('Lost');

-- Today's call summary per rep
CREATE VIEW vw_daily_kpis AS
SELECT
  r.name          AS rep,
  r.colour,
  r.calls_per_day AS target_calls,
  r.meetings_month AS target_meetings,
  COUNT(c.id)                                                          AS total_activities,
  SUM(c.type IN ('call','followup'))                                   AS calls_made,
  SUM(c.type = 'linkedin')                                             AS linkedin_msgs,
  SUM(c.outcome = 'mtg')                                               AS meetings_set,
  SUM(c.outcome = 'na')                                                AS no_answer,
  SUM(c.outcome = 'ni')                                                AS not_interested,
  ROUND(SUM(c.type IN ('call','followup')) / r.calls_per_day * 100, 1) AS calls_pct
FROM reps r
LEFT JOIN calls c ON c.rep_id = r.id AND DATE(c.logged_at) = CURDATE()
WHERE r.status = 'Active'
GROUP BY r.id;

-- Overdue reminders
CREATE VIEW vw_overdue_reminders AS
SELECT
  rem.id, rem.title, rem.type, rem.due_date, rem.due_time,
  r.name  AS rep_name,
  f.name  AS firm_name,
  fc.name AS contact_name,
  DATEDIFF(CURDATE(), rem.due_date) AS days_overdue
FROM reminders rem
LEFT JOIN reps r          ON r.id  = rem.rep_id
LEFT JOIN firms f         ON f.id  = rem.firm_id
LEFT JOIN firm_contacts fc ON fc.id = rem.firm_contact_id
WHERE rem.done = 0 AND rem.due_date < CURDATE()
ORDER BY rem.due_date ASC;


-- ============================================================
--  END OF SCHEMA
-- ============================================================
