const nodemailer = require('nodemailer');
const crypto = require('node:crypto');

const validEmail = (value) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value);
const nonempty = (value) => String(value || '').trim();

function parseSender(value) {
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(nonempty(value));
  return match ? { name: match[1].replace(/^"|"$/g, ''), email: match[2].trim() } : { name: '', email: nonempty(value) };
}

function senderFor(provider, env) {
  const legacy = parseSender(env.MAIL_FROM || env.SMTP_FROM);
  return {
    email: nonempty(env[`${provider.toUpperCase()}_FROM_EMAIL`] || env.EMAIL_FROM_ADDRESS || env.MAIL_FROM_ADDRESS || legacy.email),
    name: String(env[`${provider.toUpperCase()}_FROM_NAME`] || env.EMAIL_FROM_NAME || env.MAIL_FROM_NAME || legacy.name || 'Masbate Colleges DLAS').replace(/[\r\n]/g, ' '),
  };
}

function smtpConfiguration(env) {
  const user = nonempty(env.MAIL_USER || env.MAIL_USERNAME || env.SMTP_USER);
  const pass = env.MAIL_PASS || env.MAIL_PASSWORD || env.SMTP_PASS;
  const host = nonempty(env.MAIL_HOST || env.SMTP_HOST || (user && pass ? 'smtp.gmail.com' : '')).toLowerCase();
  const gmail = host === 'smtp.gmail.com';
  const parsed = parseSender(env.MAIL_FROM || env.MAIL_FROM_ADDRESS || env.SMTP_FROM || user);
  const port = gmail ? 587 : Number(env.MAIL_PORT || env.SMTP_PORT || 587);
  if (!host || !user || !pass || !validEmail(parsed.email) || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const secure = !gmail && (env.MAIL_SECURE === 'true' || env.SMTP_SECURE === 'true' || port === 465);
  return {
    provider: gmail ? 'gmail' : 'smtp',
    from: { email: parsed.email, name: String(env.MAIL_FROM_NAME || env.EMAIL_FROM_NAME || parsed.name || 'Masbate Colleges DLAS').replace(/[\r\n]/g, ' ') },
    options: {
      host, port, secure, requireTLS: !secure, auth: { user, pass },
      connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 15_000,
      tls: { minVersion: 'TLSv1.2' }, disableFileAccess: true, disableUrlAccess: true,
    },
  };
}

function configuredProviders(env = process.env) {
  const providers = [];
  if (nonempty(env.BREVO_API_KEY) && validEmail(senderFor('brevo', env).email)) providers.push('brevo');
  if (nonempty(env.RESEND_API_KEY) && validEmail(senderFor('resend', env).email)) providers.push('resend');
  const smtp = smtpConfiguration(env);
  if (smtp) providers.push(smtp.provider);
  return providers;
}

function mailConfigurationReady(env = process.env) { return configuredProviders(env).length > 0; }
function mailHttpsConfigurationReady(env = process.env) { return configuredProviders(env).some((provider) => ['brevo', 'resend'].includes(provider)); }

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// Injected dependencies let tests exercise every fallback without sending mail.
function createEmailService({ env = process.env, fetchFn = (...args) => fetch(...args), createTransport = (...args) => nodemailer.createTransport(...args), developmentLog = (message) => console.info(message) } = {}) {
  const status = { lastAcceptedProvider: null, lastAcceptedAt: null, lastAttemptAt: null, lastAttemptedProviders: [], lastFailure: null };
  const getStatus = () => ({ ...status, lastAttemptedProviders: [...status.lastAttemptedProviders], configuredProviders: configuredProviders(env) });

  async function sendSecurityEmail({ to, subject, text, actionUrl, otpCode }) {
    const providers = configuredProviders(env);
    if (!providers.length) {
      const hasConfiguration = ['BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_HOST', 'MAIL_USER', 'MAIL_USERNAME', 'MAIL_PASS', 'MAIL_PASSWORD', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].some((key) => nonempty(env[key]));
      if (env.NODE_ENV === 'production' || hasConfiguration) throw new Error('Email delivery is not configured. Add an API key with its verified sender, or complete Gmail/SMTP settings.');
      const devDetails = otpCode ? `Verification Code: ${otpCode}` : actionUrl;
      developmentLog(`[DLAS development email] To: ${to}\n${subject}\n${devDetails}`);
      return {
        delivered: false,
        ...(actionUrl ? { developmentLink: actionUrl } : {}),
        ...(otpCode ? { developmentOtp: otpCode } : {}),
      };
    }
    const textContent = otpCode
      ? `${text}\n\nVerification code: ${otpCode}\n\nThis code expires in 10 minutes. If you did not request this, you can ignore this email.`
      : `${text}\n\n${actionUrl}\n\nIf you did not request this, you can ignore this email.`;
    const htmlContent = otpCode
      ? `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><p>${escapeHtml(text)}</p><div style="margin:16px 0;padding:14px 20px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;font-size:26px;font-weight:700;letter-spacing:6px;color:#1e3a8a;display:inline-block">${escapeHtml(otpCode)}</div><p style="font-size:13px;color:#475569">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`
      : `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a"><p>${escapeHtml(text)}</p><p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;background:#006b3c;color:#fff;border-radius:8px;text-decoration:none">Continue</a></p><p>If you did not request this, you can ignore this email.</p></div>`;
    // Each intentional send gets its own identity, so repeating an administrator
    // delivery test is not silently deduplicated by the provider for 24 hours.
    const idempotencyKey = crypto.randomUUID();
    const startedAt = new Date().toISOString();
    const attempted = [];
    const failures = [];

    for (const provider of providers) {
      attempted.push(provider);
      try {
        if (provider === 'brevo' || provider === 'resend') {
          const sender = senderFor(provider, env);
          const brevo = provider === 'brevo';
          const response = await fetchFn(brevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Accept: 'application/json', 'Content-Type': 'application/json',
              ...(brevo ? { 'api-key': nonempty(env.BREVO_API_KEY) } : { Authorization: `Bearer ${nonempty(env.RESEND_API_KEY)}`, 'Idempotency-Key': idempotencyKey }),
            },
            body: JSON.stringify(brevo
              ? { sender, to: [{ email: to }], subject, textContent, htmlContent }
              : { from: `${JSON.stringify(sender.name)} <${sender.email}>`, to: [to], subject, text: textContent, html: htmlContent }),
            signal: AbortSignal.timeout(10_000), redirect: 'error',
          });
          // Provider bodies can contain recipients or security links; never log them.
          if (!response.ok) {
            await response.body?.cancel().catch(() => {});
            failures.push(`${provider}: HTTP ${response.status}`);
            continue;
          }
          const result = await response.json().catch(() => null);
          const acknowledgment = brevo ? result?.messageId : result?.id;
          if (typeof acknowledgment !== 'string' || !acknowledgment.trim()) { failures.push(`${provider}: missing acknowledgment`); continue; }
        } else {
          const config = smtpConfiguration(env);
          const transport = createTransport(config.options);
          const result = await transport.sendMail({ from: { name: config.from.name, address: config.from.email }, to, subject, text: textContent, html: htmlContent });
          if (!result?.accepted?.some((address) => String(address).toLowerCase() === String(to).toLowerCase())) { failures.push(`${provider}: recipient not accepted`); continue; }
        }
        status.lastAcceptedProvider = provider;
        status.lastAcceptedAt = new Date().toISOString();
        status.lastAttemptAt = startedAt;
        status.lastAttemptedProviders = [...attempted];
        status.lastFailure = null;
        return { delivered: true, provider };
      } catch {
        // Fallback reuses the same one-time link. A timed-out provider may still
        // deliver it; cross-provider exactly-once delivery cannot be guaranteed.
        failures.push(`${provider}: connection or delivery error`);
      }
    }
    status.lastFailure = failures.join('; ');
    status.lastAttemptAt = startedAt;
    status.lastAttemptedProviders = [...attempted];
    throw new Error(`Email delivery failed (${status.lastFailure}). Please try again shortly.`);
  }

  return { sendSecurityEmail, getStatus };
}

const service = createEmailService();
function clientUrl(pathname) { return `${(process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '')}${pathname}`; }

module.exports = { sendSecurityEmail: service.sendSecurityEmail, getMailDeliveryStatus: service.getStatus, clientUrl, mailConfigurationReady, mailHttpsConfigurationReady, createEmailService };
