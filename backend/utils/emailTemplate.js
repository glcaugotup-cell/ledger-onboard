/** Shared email layout. Inline styles and presentation tables work without the app's CSS. */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function webUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Email links must use http(s) URLs without credentials');
  }
  return url.href;
}

function buildEmail({ appUrl, category, title, greeting, paragraphs = [], highlight, details = [], action, note }) {
  const homeUrl = webUrl(appUrl);
  const actionUrl = action ? webUrl(action.url) : null;
  const text = [
    greeting,
    ...paragraphs,
    highlight && `${highlight.label}: ${highlight.value}`,
    details.length && details.map(([label, value]) => `${label}: ${value}`).join('\n'),
    action && `${action.label}:\n${actionUrl}`,
    note,
    `Regards,\nLedger OnBoard\n${homeUrl}`,
  ].filter(Boolean).join('\n\n');

  const paragraphHtml = paragraphs.map((paragraph) =>
    `<p style="margin:0 0 18px;color:#475569;font-size:16px;line-height:1.7;word-wrap:break-word;">${escapeHtml(paragraph)}</p>`
  ).join('');
  const highlightHtml = highlight ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border:1px solid #dcebe1;border-radius:12px;background-color:#f2f7f4;">
      <tr><td style="padding:20px;text-align:center;">
        <p style="margin:0 0 10px;color:#24513c;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(highlight.label)}</p>
        <p style="margin:0;color:#1b362b;font-family:Consolas,'Courier New',monospace;font-size:26px;font-weight:bold;letter-spacing:2px;word-break:break-all;">${escapeHtml(highlight.value)}</p>
      </td></tr>
    </table>` : '';
  const detailsHtml = details.length ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-top:1px solid #e2e8f0;">
      ${details.map(([label, value]) => `<tr>
        <td width="40%" valign="top" style="padding:12px 8px 12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;line-height:1.5;">${escapeHtml(label)}</td>
        <td valign="top" style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#1b362b;font-size:14px;font-weight:bold;line-height:1.5;word-break:break-word;">${escapeHtml(value)}</td>
      </tr>`).join('')}
    </table>` : '';
  const actionHtml = action ? `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 24px;">
      <tr><td align="center" bgcolor="#fbbf24" style="border-radius:10px;background-color:#fbbf24;">
        <a href="${escapeHtml(actionUrl)}" style="display:block;padding:17px 18px;border:1px solid #fbbf24;border-radius:10px;color:#1b362b;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-align:center;text-decoration:none;">${escapeHtml(action.label)} &rarr;</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;color:#64748b;font-size:12px;line-height:1.6;">If the button does not work, copy this link into your browser:</p>
    <p style="margin:0 0 24px;font-size:12px;line-height:1.6;word-break:break-all;"><a href="${escapeHtml(actionUrl)}" style="color:#2c654a;text-decoration:underline;word-break:break-all;">${escapeHtml(actionUrl)}</a></p>` : '';

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:#f3f5f4;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f3f5f4;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(title)} &mdash; Ledger OnBoard</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3f5f4" style="background-color:#f3f5f4;">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;border:1px solid #dcebe1;border-radius:16px;background-color:#ffffff;">
        <tr><td bgcolor="#1b362b" style="padding:28px 24px;background-color:#1b362b;border-radius:15px 15px 0 0;border-bottom:4px solid #fbbf24;">
          <a href="${escapeHtml(homeUrl)}" style="color:#ffffff;font-size:24px;font-weight:bold;text-decoration:none;">Ledger <span style="color:#fbbf24;">OnBoard</span></a>
          <p style="margin:8px 0 0;color:#dcebe1;font-size:13px;line-height:1.5;">Rental homes. Made easier.</p>
        </td></tr>
        <tr><td style="padding:30px 24px;background-color:#ffffff;">
          <p style="margin:0 0 12px;color:#2c654a;font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;">${escapeHtml(category)}</p>
          <h1 style="margin:0 0 24px;color:#1b362b;font-size:28px;line-height:1.25;font-weight:bold;">${escapeHtml(title)}</h1>
          <p style="margin:0 0 18px;color:#1e293b;font-size:16px;line-height:1.7;">${escapeHtml(greeting)}</p>
          ${paragraphHtml}${highlightHtml}${detailsHtml}${actionHtml}
          ${note ? `<p style="margin:0;padding:16px;background-color:#f8faf9;border-left:3px solid #b9d7c4;border-radius:4px;color:#64748b;font-size:13px;line-height:1.7;">${escapeHtml(note)}</p>` : ''}
          <p style="margin:24px 0 0;color:#475569;font-size:14px;line-height:1.7;">Regards,<br><strong style="color:#1b362b;">The Ledger OnBoard team</strong></p>
        </td></tr>
        <tr><td style="padding:20px 24px;border-top:1px solid #e2e8f0;border-radius:0 0 15px 15px;background-color:#f8faf9;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.7;">An account notification from Ledger OnBoard.</p>
          <a href="${escapeHtml(homeUrl)}" style="color:#2c654a;font-size:12px;line-height:1.7;text-decoration:underline;">${escapeHtml(new URL(homeUrl).hostname)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  return { text, html };
}

module.exports = { buildEmail };
