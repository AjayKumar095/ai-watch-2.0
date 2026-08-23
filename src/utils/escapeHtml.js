/**
 * Escapes special HTML characters in a string so it can be safely inserted
 * into HTML markup (used for <code> blocks, image alt/caption text, etc.
 * inside renderBlocks.js).
 */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = escapeHtml;