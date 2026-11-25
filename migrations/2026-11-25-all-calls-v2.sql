-- ════════════════════════════════════════════════════════════════
--  DiTech FAO — migration for the new All Calls page (/all-calls)
--  Date: 2026-11-25
--
--  All changes are ADDITIVE. No rows are changed or deleted, and
--  no existing column loses a value it could hold before.
--  Run once on the live database (phpMyAdmin → SQL tab → paste → Go).
--  Take a backup first (Export → Quick → SQL) as normal practice.
-- ════════════════════════════════════════════════════════════════

-- NOTE: calls.outcome is NOT touched. On the live database it is
-- VARCHAR(20) (the repo's .sql files show an older ENUM), so it
-- already accepts every outcome the app uses. Do not convert it.

-- 1) History log for each reminder (snoozed / reassigned / missed / done).
--    JSON array stored as text, e.g.
--    [{"at":"2026-11-25 17:05:00","by":"Admin","text":"Moved Sadichha → Diksha"}]
--    NULL for every existing reminder; existing screens never read it.
ALTER TABLE reminders
  ADD COLUMN history MEDIUMTEXT NULL AFTER notes;

-- 2) "Good lead" flag on firms (the ★ button in the new firm drawer).
--    Defaults to 0 for every existing firm; existing screens never read it.
ALTER TABLE firms
  ADD COLUMN good_lead TINYINT(1) NOT NULL DEFAULT 0 AFTER stage;
