const nodemailer = require('nodemailer');

let transporter;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_HOST and SMTP_FROM must be configured in production.');
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
  });
  return transporter;
}

async function sendSecurityEmail({ to, subject, text, actionUrl }) {
  const mailTransport = getTransporter();
  if (!mailTransport) {
    console.info(`[DLAS development email] To: ${to}\n${subject}\n${actionUrl}`);
    return { delivered: false, developmentLink: actionUrl };
  }
  await mailTransport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text: `${text}\n\n${actionUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><p>${escapeHtml(text)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#006b3c;color:#fff;border-radius:8px;text-decoration:none">Continue</a></p><p>If you did not request this, you can ignore this email.</p></div>`,
  });
  return { delivered: true };
}

function clientUrl(pathname) {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${pathname}`;
}

function mailConfigurationReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM
    && process.env.SMTP_USER && process.env.SMTP_PASS);
}

module.exports = { sendSecurityEmail, clientUrl, mailConfigurationReady };
