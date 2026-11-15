const nodemailer = require('nodemailer');

let transporter;

function emailProvider(env = process.env) {
  return env.EMAIL_PROVIDER || 'smtp';
}

function brevoSender(env = process.env) {
  return { email: String(env.EMAIL_FROM_ADDRESS || '').trim(), name: env.EMAIL_FROM_NAME || 'Masbate Colleges DLAS' };
}

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
  const textContent = `${text}\n\n${actionUrl}\n\nIf you did not request this, you can ignore this email.`;
  const htmlContent = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><p>${escapeHtml(text)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#006b3c;color:#fff;border-radius:8px;text-decoration:none">Continue</a></p><p>If you did not request this, you can ignore this email.</p></div>`;
  if (emailProvider() === 'brevo') {
    if (!mailConfigurationReady()) throw new Error('Configure BREVO_API_KEY and a verified EMAIL_FROM_ADDRESS.');
    let response;
    try {
      response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': process.env.BREVO_API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: brevoSender(), to: [{ email: to }], subject, textContent, htmlContent }),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch {
      throw new Error('Email delivery could not be reached. Please try again shortly.');
    }
    // Never log provider response bodies: they can contain recipients and security links.
    if (!response.ok) throw new Error(`Email delivery was rejected (HTTP ${response.status}). Check the verified sender, API key, and daily allowance.`);
    const result = await response.json().catch(() => null);
    if (!result?.messageId) throw new Error('The email provider did not acknowledge the message.');
    return { delivered: true };
  }
  if (emailProvider() !== 'smtp') throw new Error('EMAIL_PROVIDER must be smtp or brevo.');
  const mailTransport = getTransporter();
  if (!mailTransport) {
    console.info(`[DLAS development email] To: ${to}\n${subject}\n${actionUrl}`);
    return { delivered: false, developmentLink: actionUrl };
  }
  await mailTransport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text: textContent,
    html: htmlContent,
  });
  return { delivered: true };
}

function clientUrl(pathname) {
  const base = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}${pathname}`;
}

function mailConfigurationReady(env = process.env) {
  if (emailProvider(env) === 'brevo') return Boolean(env.BREVO_API_KEY?.trim()) && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(brevoSender(env).email);
  if (emailProvider(env) !== 'smtp') return false;
  return Boolean(env.SMTP_HOST && env.SMTP_FROM && env.SMTP_USER && env.SMTP_PASS);
}

module.exports = { sendSecurityEmail, clientUrl, mailConfigurationReady };
