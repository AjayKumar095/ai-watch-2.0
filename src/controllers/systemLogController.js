// Reads the winston-managed log files directly off disk for the admin
// viewer. Deliberately simple (no log aggregation service): this is a
// single-server app, so "tail the file" is genuinely the right amount of
// engineering here.
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

const LOG_DIR = logger.LOG_DIR;
const MAX_DISPLAY_LINES = 500;

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// winston (tailable: true) names the active file `app.log` and rotated-out
// ones `app1.log`, `app2.log`, ... with higher numbers being older.
function listLogFiles() {
  if (!fs.existsSync(LOG_DIR)) return [];
  return fs
    .readdirSync(LOG_DIR)
    .filter((f) => /^app\d*\.log$/.test(f))
    .map((f) => {
      const stat = fs.statSync(path.join(LOG_DIR, f));
      const match = f.match(/^app(\d*)\.log$/);
      const order = match[1] === "" ? 0 : parseInt(match[1], 10);
      return {
        name: f,
        label: order === 0 ? `${f} (current)` : f,
        sizeBytes: stat.size,
        size: formatBytes(stat.size),
        mtime: stat.mtime,
        order,
      };
    })
    .sort((a, b) => a.order - b.order);
}

function readLogLines(filePath, { level, limit = MAX_DISPLAY_LINES } = {}) {
  if (!fs.existsSync(filePath)) return { lines: [], truncated: false, totalMatched: 0, totalInFile: 0 };

  const raw = fs.readFileSync(filePath, "utf8");
  const rawLines = raw.split("\n").filter(Boolean);

  const parsed = rawLines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      // Shouldn't normally happen (winston writes one JSON object per
      // line) but don't let one bad line break the whole viewer.
      return { level: "info", message: line, timestamp: null, _unparsed: true };
    }
  });

  parsed.reverse(); // newest first
  const filtered = level && level !== "all" ? parsed.filter((p) => p.level === level) : parsed;

  return {
    lines: filtered.slice(0, limit),
    truncated: filtered.length > limit,
    totalMatched: filtered.length,
    totalInFile: parsed.length,
  };
}

exports.list = async (req, res) => {
  const files = listLogFiles();
  const requestedFile = req.query.file;
  const selectedFile = files.some((f) => f.name === requestedFile) ? requestedFile : files[0] ? files[0].name : null;
  const level = ["info", "warn", "error"].includes(req.query.level) ? req.query.level : "all";

  let result = { lines: [], truncated: false, totalMatched: 0, totalInFile: 0 };
  if (selectedFile) {
    result = readLogLines(path.join(LOG_DIR, selectedFile), { level });
  }

  res.render("admin/system-logs/index", {
    title: "System Logs",
    files,
    selectedFile,
    level,
    ...result,
    breadcrumbs: [{ label: "Dashboard", url: "/admin/dashboard" }, { label: "System Logs" }],
  });
};
