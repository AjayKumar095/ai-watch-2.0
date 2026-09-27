/**
 * The 8 AI-proficiency tiers, in ascending order — matches the legacy
 * Python mapping (subject name substring -> SemesterCertificate.AI_LEVEL_*):
 *   fundamentals -> I, essentials -> II, applied -> III, intermediate -> IV,
 *   advanced -> V, expert -> VI, specialized -> VII, mastery -> VIII.
 *
 * Program/Course models only carry (name, code, category, status) — there
 * was never a dedicated "level" column, so historically the level word was
 * read out of the display name via substring match. A SubjectPool can now
 * also carry its own `level` field directly (see models/SubjectPool.js),
 * which should always be preferred when present — extractLevel() below is
 * the fallback for subjects that haven't had their level field set yet.
 */
const LEVEL_TIERS = [
  { label: "Fundamentals", tier: "I", re: /\bfundamentals?\b/i },
  { label: "Essentials", tier: "II", re: /\bessentials?\b/i },
  { label: "Applied", tier: "III", re: /\bapplied\b/i },
  { label: "Intermediate", tier: "IV", re: /\bintermediate\b/i },
  { label: "Advanced", tier: "V", re: /\badvanced?\b/i },
  { label: "Expert", tier: "VI", re: /\bexpert\b/i },
  { label: "Specialized", tier: "VII", re: /\bspeciali[sz]ed\b/i },
  { label: "Mastery", tier: "VIII", re: /\bmastery\b/i },
];

// Kept for backward compatibility with existing callers (the SubjectPool
// model's ENUM, the subject-pool admin dropdown) — same shape as before,
// just the corrected 8-word set instead of the earlier partial 4-word one.
const LEVEL_PATTERNS = LEVEL_TIERS.map(({ label, re }) => ({ label, re }));

/**
 * @param {string} text e.g. a program or subject name like
 *   "AI for Agriculture(PG) Essentials (AIA-ES)"
 * @returns {string|null} the matched level label, or null if none found
 */
function extractLevel(text) {
  if (!text) return null;
  for (const { label, re } of LEVEL_TIERS) {
    if (re.test(text)) return label;
  }
  return null;
}

/**
 * @param {string} label e.g. "Fundamentals"
 * @returns {string|null} the Roman-numeral tier for that label ("I".."VIII"),
 *   or null if the label isn't one of the 8 recognized ones.
 */
function tierForLevel(label) {
  if (!label) return null;
  const found = LEVEL_TIERS.find((t) => t.label.toLowerCase() === String(label).toLowerCase());
  return found ? found.tier : null;
}

/**
 * "AI Level I (Fundamentals)" — the canonical display string used
 * wherever a level is shown to a person: the certificate PDF itself, the
 * admin certificates list, and the student progress/certificates views.
 * Returns null (nothing to show) for an unrecognized or missing label,
 * rather than producing a broken "AI Level (null)" string.
 */
function formatAiLevel(label) {
  const tier = tierForLevel(label);
  if (!tier) return null;
  return `AI Level ${tier} (${label})`;
}

module.exports = { extractLevel, LEVEL_PATTERNS, LEVEL_TIERS, tierForLevel, formatAiLevel };
