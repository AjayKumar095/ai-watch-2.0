-- ============================================================
-- Backfill subject_pool.level from keywords in the subject name.
-- Same priority order as utils/courseLevel.js's extractLevel()
-- (first match wins): Fundamentals > Essentials > Applied >
-- Intermediate > Advanced > Expert > Specialized > Mastery.
--
-- Only touches rows where level IS NULL, so it never overwrites a
-- level an admin has already set manually via the new dropdown.
-- Run the PREVIEW first on a copy of the DB (SQLite) before running
-- the UPDATE anywhere, especially production.
-- ============================================================

-- 1) PREVIEW — see exactly what would change, nothing is written yet.
SELECT
  id,
  name,
  level AS current_level,
  CASE
    WHEN LOWER(name) LIKE '%Fundamental%' THEN 'Fundamentals'
    WHEN LOWER(name) LIKE '%Essential%'   THEN 'Essentials'
    WHEN LOWER(name) LIKE '%Applied%'     THEN 'Applied'
    WHEN LOWER(name) LIKE '%Intermediate%' THEN 'Intermediate'
    WHEN LOWER(name) LIKE '%Advance%'     THEN 'Advanced'
    WHEN LOWER(name) LIKE '%Expert%'      THEN 'Expert'
    WHEN LOWER(name) LIKE '%Specialis%' OR LOWER(name) LIKE '%specializ%' THEN 'Specialized'
    WHEN LOWER(name) LIKE '%Mastery%'     THEN 'Mastery'
    ELSE NULL
  END AS would_set_level
FROM subject_pool
WHERE level IS NULL;

-- 2) UPDATE — run only after the preview above looks right.
--    Wrapped in a transaction so a mistake is a ROLLBACK away, not a
--    manual fix. On SQLite, BEGIN/COMMIT work the same way; on
--    Postgres, same syntax.
BEGIN;

UPDATE subject_pool
SET level = CASE
  WHEN LOWER(name) LIKE '%Fundamental%' THEN 'Fundamentals'
  WHEN LOWER(name) LIKE '%Essential%'   THEN 'Essentials'
  WHEN LOWER(name) LIKE '%Applied%'     THEN 'Applied'
  WHEN LOWER(name) LIKE '%Intermediate%' THEN 'Intermediate'
  WHEN LOWER(name) LIKE '%Advance%'     THEN 'Advanced'
  WHEN LOWER(name) LIKE '%Expert%'      THEN 'Expert'
  WHEN LOWER(name) LIKE '%Specialis%' OR LOWER(name) LIKE '%specializ%' THEN 'Specialized'
  WHEN LOWER(name) LIKE '%Mastery%'     THEN 'Mastery'
  ELSE NULL
END
WHERE level IS NULL;

-- 3) VERIFY the result before committing.
SELECT level, COUNT(*) AS subject_count
FROM subject_pool
GROUP BY level
ORDER BY level;

-- If the counts above look right:
COMMIT;
-- If something looks wrong, run ROLLBACK; instead of COMMIT, and
-- nothing above will have taken effect.