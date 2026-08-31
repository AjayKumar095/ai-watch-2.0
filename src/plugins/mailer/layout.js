// One shared HTML shell so every templated email looks consistent without
// each template.json having to repeat table/style boilerplate. Templates
// only supply { subtitle, body } (already-rendered HTML) plus a subject.
function wrapInLayout({ title, subtitle, bodyHtml }) {
  return `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#f4f5f7; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
            <tr>
              <td style="background:#111827; padding:20px 32px;">
                <span style="color:#ffffff; font-size:18px; font-weight:bold;">AI-Watch</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${title ? `<h1 style="margin:0 0 4px; font-size:20px; color:#111827;">${title}</h1>` : ""}
                ${subtitle ? `<p style="margin:0 0 20px; font-size:14px; color:#6b7280;">${subtitle}</p>` : ""}
                <div style="font-size:15px; line-height:1.6; color:#111827;">${bodyHtml}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px; background:#f9fafb; font-size:12px; color:#9ca3af;">
                This is an automated message from AI-Watch. Please don't reply directly to this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { wrapInLayout };
