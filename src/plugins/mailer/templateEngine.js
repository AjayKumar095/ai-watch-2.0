// Dynamically picks a JSON-defined template (templates/<name>.json), fills
// in {{tokens}} with the given data, and wraps the result in the shared
// layout. Drop a new template.json in ./templates to add another kind of
// email — no code changes needed to use it.
const fs = require("fs");
const path = require("path");
const escapeHtml = require("../../utils/escapeHtml");
const { wrapInLayout } = require("./layout");

const TEMPLATES_DIR = path.join(__dirname, "templates");

function loadTemplate(templateName) {
  const safeName = path.basename(templateName, ".json"); // no path traversal
  const filePath = path.join(TEMPLATES_DIR, `${safeName}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Mail template "${safeName}" not found in ${TEMPLATES_DIR}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// Replaces every {{key}} in `text` with data[key] (HTML-escaped by default,
// since subject/subtitle/body come from JSON + trusted copy, but the
// inserted values — names, codes, links — may come from user data).
function interpolate(text, data, { escape = true } = {}) {
  if (typeof text !== "string") return text;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => {
    const value = key.split(".").reduce((obj, k) => (obj == null ? undefined : obj[k]), data);
    if (value === undefined || value === null) return "";
    return escape ? escapeHtml(value) : String(value);
  });
}

/**
 * Renders a named JSON template with data into { subject, html }.
 * @param {string} templateName - filename (without .json) under templates/
 * @param {object} data - values to substitute into {{tokens}}
 */
function renderTemplate(templateName, data = {}) {
  const template = loadTemplate(templateName);
  const subject = interpolate(template.subject, data, { escape: false });
  const subtitle = interpolate(template.subtitle, data);
  // `body` may itself contain simple HTML (e.g. <p> tags) written into the
  // template.json by hand — only the {{token}} values get escaped, not the
  // surrounding markup the template author wrote.
  const body = interpolate(template.body, data);

  return { subject, html: wrapInLayout({ title: template.title, subtitle, bodyHtml: body }) };
}

module.exports = { renderTemplate, loadTemplate };
