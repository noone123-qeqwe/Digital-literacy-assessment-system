const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEmailService, mailConfigurationReady, mailHttpsConfigurationReady } = require('./utils/email');

const message = { to: 'student@example.test', subject: 'Verify account', text: 'Verify your account.', actionUrl: 'https://example.test/verify-email?token=test-only-token' };
const configured = {
  NODE_ENV: 'production', BREVO_API_KEY: 'test-brevo-secret', RESEND_API_KEY: 'test-resend-secret',
  EMAIL_FROM_ADDRESS: 'school@example.test', EMAIL_FROM_NAME: 'Masbate Colleges DLAS',
  MAIL_USER: 'school@gmail.com', MAIL_PASS: 'test-app-password',
};
const accepted = (provider) => new Response(JSON.stringify(provider === 'brevo' ? { messageId: 'brevo-test' } : { id: 'resend-test' }), { status: 201 });
const unexpectedSmtp = () => { throw new Error('SMTP must not be attempted.'); };

test('Brevo is first and a confirmed acceptance stops all fallbacks', async () => {
  const calls = [];
  const service = createEmailService({ env: configured, fetchFn: async (url) => { calls.push(url); return accepted('brevo'); }, createTransport: unexpectedSmtp });
  assert.deepEqual(await service.sendSecurityEmail(message), { delivered: true, provider: 'brevo' });
  assert.deepEqual(calls, ['https://api.brevo.com/v3/smtp/email']);
  assert.deepEqual(service.getStatus().configuredProviders, ['brevo', 'resend', 'gmail']);
  assert.deepEqual(service.getStatus().lastAttemptedProviders, ['brevo']);
});

test('Resend is selected directly when Brevo credentials are absent', async () => {
  const calls = [];
  const service = createEmailService({ env: { ...configured, BREVO_API_KEY: '' }, fetchFn: async (url, options) => { calls.push({ url, options }); return accepted('resend'); }, createTransport: unexpectedSmtp });
  assert.equal((await service.sendSecurityEmail(message)).provider, 'resend');
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-resend-secret');
  assert.deepEqual(JSON.parse(calls[0].options.body).to, [message.to]);
});

test('HTTP refusal falls back to Resend with the same verification link and content', async () => {
  const sent = [];
  const service = createEmailService({ env: configured, fetchFn: async (url, options) => {
    sent.push(JSON.parse(options.body));
    return url.includes('brevo') ? new Response('private error', { status: 429 }) : accepted('resend');
  }, createTransport: unexpectedSmtp });
  assert.equal((await service.sendSecurityEmail(message)).provider, 'resend');
  assert.equal(sent[0].textContent, sent[1].text);
  assert.equal(sent[0].htmlContent, sent[1].html);
  assert.match(sent[1].text, /token=test-only-token/);
  assert.deepEqual(service.getStatus().lastAttemptedProviders, ['brevo', 'resend']);
});

test('network failure falls back without exposing the failed request or credentials', async () => {
  const service = createEmailService({ env: configured, fetchFn: async (url) => { if (url.includes('brevo')) throw new Error('test-brevo-secret private request'); return accepted('resend'); }, createTransport: unexpectedSmtp });
  assert.equal((await service.sendSecurityEmail(message)).provider, 'resend');
  assert.equal(service.getStatus().lastFailure, null);
  assert.doesNotMatch(JSON.stringify(service.getStatus()), /test-brevo-secret|test-resend-secret|student@example|test-only-token/);
});

test('both API failures fall back to Gmail over required STARTTLS on port 587', async () => {
  let options, delivered;
  const service = createEmailService({ env: configured, fetchFn: async () => new Response('{}', { status: 503 }), createTransport: (config) => {
    options = config;
    return { sendMail: async (mail) => { delivered = mail; return { accepted: [message.to] }; } };
  } });
  assert.equal((await service.sendSecurityEmail(message)).provider, 'gmail');
  assert.equal(options.host, 'smtp.gmail.com'); assert.equal(options.port, 587);
  assert.equal(options.secure, false); assert.equal(options.requireTLS, true);
  assert.equal(options.tls.minVersion, 'TLSv1.2');
  assert.equal(options.auth.user, configured.MAIL_USER); assert.equal(options.auth.pass, configured.MAIL_PASS);
  assert.equal(delivered.from.address, configured.MAIL_USER);
  assert.match(delivered.text, /token=test-only-token/);
  assert.deepEqual(service.getStatus().lastAttemptedProviders, ['brevo', 'resend', 'gmail']);
});

test('Gmail-only settings work and MAIL_USERNAME/MAIL_PASSWORD aliases are supported', async () => {
  const env = { NODE_ENV: 'production', MAIL_USERNAME: 'school@gmail.com', MAIL_PASSWORD: 'test-app-password', MAIL_FROM: 'School Portal <school@gmail.com>' };
  assert.equal(mailConfigurationReady(env), true); assert.equal(mailHttpsConfigurationReady(env), false);
  let sender;
  const service = createEmailService({ env, fetchFn: async () => { throw new Error('No API call expected.'); }, createTransport: () => ({ sendMail: async (mail) => { sender = mail.from; return { accepted: [message.to] }; } }) });
  assert.equal((await service.sendSecurityEmail(message)).provider, 'gmail');
  assert.equal(sender.name, 'School Portal');
});

test('legacy custom SMTP settings remain available after API providers', async () => {
  let options;
  const env = { NODE_ENV: 'production', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '465', SMTP_USER: 'school@example.test', SMTP_PASS: 'test-password', SMTP_FROM: 'DLAS <school@example.test>' };
  const service = createEmailService({ env, createTransport: (config) => { options = config; return { sendMail: async () => ({ accepted: [message.to] }) }; } });
  assert.equal((await service.sendSecurityEmail(message)).provider, 'smtp');
  assert.equal(options.secure, true); assert.equal(options.port, 465);
});

test('API responses without acknowledgment fall back and cannot falsely report success', async () => {
  let calls = 0;
  const service = createEmailService({ env: { ...configured, MAIL_PASS: '' }, fetchFn: async () => { calls++; return new Response('{}', { status: 201 }); } });
  await assert.rejects(service.sendSecurityEmail(message), /missing acknowledgment/);
  assert.equal(calls, 2); assert.equal(service.getStatus().lastAcceptedProvider, null);
});

test('SMTP rejection and all-provider failure return a sanitized failure', async () => {
  const service = createEmailService({ env: configured, fetchFn: async () => new Response('test-brevo-secret private provider body', { status: 500 }), createTransport: () => ({ sendMail: async () => ({ rejected: [message.to], accepted: [] }) }) });
  await assert.rejects(service.sendSecurityEmail(message), (error) => {
    assert.match(error.message, /brevo: HTTP 500; resend: HTTP 500; gmail: recipient not accepted/);
    assert.doesNotMatch(error.message, /test-brevo-secret|student@example|test-only-token|test-app-password/);
    return true;
  });
  assert.equal(service.getStatus().lastAcceptedAt, null);
});

test('provider-specific verified senders and HTTPS readiness support either API', async () => {
  const env = { ...configured, EMAIL_FROM_ADDRESS: '', BREVO_FROM_EMAIL: 'brevo@example.test', RESEND_FROM_EMAIL: 'resend@example.test', BREVO_FROM_NAME: 'School, Admissions' };
  const sent = [];
  const service = createEmailService({ env, fetchFn: async (url, options) => { sent.push(JSON.parse(options.body)); return url.includes('brevo') ? new Response('{}', { status: 403 }) : accepted('resend'); }, createTransport: unexpectedSmtp });
  await service.sendSecurityEmail(message);
  assert.equal(sent[0].sender.email, env.BREVO_FROM_EMAIL);
  assert.match(sent[1].from, /resend@example.test/);
  assert.equal(mailHttpsConfigurationReady({ RESEND_API_KEY: 'test', RESEND_FROM_EMAIL: 'school@example.test' }), true);
  assert.equal(mailConfigurationReady({ BREVO_API_KEY: 'test', EMAIL_FROM_ADDRESS: 'bad address' }), false);
});

test('Resend requests have bounded timeouts and intentional repeat sends are not deduplicated', async () => {
  const headers = [];
  const service = createEmailService({ env: { ...configured, BREVO_API_KEY: '' }, fetchFn: async (_url, options) => {
    assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
    headers.push(options.headers['Idempotency-Key']); return accepted('resend');
  }, createTransport: unexpectedSmtp });
  await service.sendSecurityEmail(message); await service.sendSecurityEmail(message);
  await service.sendSecurityEmail({ ...message, actionUrl: 'https://example.test/verify-email?token=different' });
  assert.notEqual(headers[0], headers[1]); assert.notEqual(headers[0], headers[2]);
  assert.match(headers[0], /^[a-f0-9-]{36}$/);
});

test('production missing settings and SMTP errors never fall back to development links', async () => {
  const logs = [];
  const service = createEmailService({ env: { NODE_ENV: 'production' }, developmentLog: (value) => logs.push(value) });
  await assert.rejects(service.sendSecurityEmail(message), /not configured/);
  assert.equal(logs.length, 0);
  const failed = createEmailService({ env: { NODE_ENV: 'production', MAIL_USER: 'school@gmail.com', MAIL_PASS: 'test' }, createTransport: () => ({ sendMail: async () => { throw new Error('private SMTP error'); } }), developmentLog: (value) => logs.push(value) });
  await assert.rejects(failed.sendSecurityEmail(message), /connection or delivery error/);
  assert.equal(logs.length, 0);
});

test('unconfigured local development still exposes a development link only', async () => {
  const logs = [];
  const service = createEmailService({ env: { NODE_ENV: 'test' }, developmentLog: (value) => logs.push(value) });
  assert.deepEqual(await service.sendSecurityEmail(message), { delivered: false, developmentLink: message.actionUrl });
  assert.equal(logs.length, 1); assert.equal(service.getStatus().lastAcceptedProvider, null);
});
