# Real accounts on free hosting

The real-account configuration uses the existing Render free web service, a **Turso libSQL** cloud database, and **Brevo/Resend HTTPS email APIs**. Accounts, saved answers, sessions, and results live in Turso rather than Render's temporary filesystem. New students verify their email; staff also enroll an authenticator. No demonstration users or results are created.

Before activating a service, configure the provider accounts, verified sender, credentials, and first administrator. Do not change only `DLAS_FREE_DEMO`: an older preview deployment may still run `seed` and store SQLite under `/tmp`. The root `render.yaml` now uses the real-account launcher; the sample-only configuration is kept separately in `deploy/render-preview.yaml`.

## 1. Create the free provider accounts

1. Sign in at [Turso](https://app.turso.tech/), choose its **Free** plan, and create a **libSQL-compatible** database named `masbate-colleges-dlas` in a region near the Render service. Use a new, empty database, not an imported demonstration database. The newer beta Turso database engine is a different product; this application uses the stable libSQL API.
2. Save its database URL and a read/write database token privately. Those become `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in Render. Keep administrative Turso account tokens out of the application.
3. Sign in at [Brevo](https://app.brevo.com/) or [Resend](https://resend.com/), select a free plan, and complete the provider's sender/domain verification and transactional-email activation requirements. Use the College's approved sender address and domain if available. The sender must be verified; an arbitrary `no-reply` address will not work. Resend's testing sender cannot send verification messages to arbitrary students.
4. Create an API key for this app. Put it only in Render as `BREVO_API_KEY` or `RESEND_API_KEY`. These are **API keys**, not SMTP passwords. Configure both providers if you want API fallback; one working API is enough to start.

If you forgot which accounts you have, check **Render → your existing service → Environment** for variable names before creating replacements. Do not reveal their values. Saved keys may exist on Render even when your local computer has none. Sign in to the corresponding provider or use its account-recovery flow; never overwrite existing keys or recreate a live database just because you forgot the login.

Do not send tokens, passwords, or API keys in chat, commit them to GitHub, or put them in React/Vite environment variables. The database URL without the token may be shared if needed; all credentials stay server-side.

Current free allowances: [Turso](https://turso.tech/pricing) lists 5 GB storage and one day of point-in-time recovery; [Brevo](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans) includes 300 email sends per day. Confirm the selected plans in your accounts and stay within their quotas. Render's free service can still sleep; this change prevents account data from disappearing when it does.

## 2. Prepare private application keys

From the project directory, run:

```powershell
npm --prefix server run generate:production-keys
```

This writes three different random 64-character hexadecimal keys to `server/.env.production.keys`. The file is excluded from Git and is never overwritten by the command. Import those values into Render's private environment settings. Keep a protected copy: losing the MFA key can prevent staff from using their stored authenticators, and losing the backup key prevents decrypting downloaded backups. Do not rotate these keys on every deployment.

## 3. Update the existing Render service

Use the **existing** service to retain its `masbate-colleges-digital-literacy.onrender.com` address and avoid using a second service's share of free hours. Keep the current build command. Prepare the following environment changes and apply them together with the start-command change:

| Setting | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DLAS_FREE_DEMO` | `false` |
| `DLAS_RESEARCH_ENABLED` | `false` |
| `DLAS_DATABASE_DRIVER` | `libsql` |
| `TURSO_DATABASE_URL` | Your secure `libsql://...turso.io` database URL |
| `TURSO_AUTH_TOKEN` | Your private read/write database token |
| `BREVO_API_KEY` | Your private Brevo API key, if using Brevo |
| `RESEND_API_KEY` | Your private Resend API key, if using Resend; optional fallback when both are configured |
| `EMAIL_FROM_ADDRESS` | The sender address verified in each configured API provider |
| `EMAIL_FROM_NAME` | `Masbate Colleges DLAS` |
| `BACKUP_STRATEGY` | `turso-pitr` |
| `JWT_SECRET` | Key from the generated private file, or retain your existing secure key |
| `MFA_ENCRYPTION_KEY` | Key from the generated private file |
| `BACKUP_ENCRYPTION_KEY` | Key from the generated private file |
| `TRUST_PROXY` | `1` |
| `BOOTSTRAP_ADMIN_EMAIL` | Your actual administrator email |
| `BOOTSTRAP_ADMIN_FIRST_NAME` | Your administrator's first name |
| `BOOTSTRAP_ADMIN_LAST_NAME` | Your administrator's last name |
| `BOOTSTRAP_ADMIN_PASSWORD` | A unique password of 12–128 characters |

Email selection is automatic: **Brevo → Resend → Gmail/SMTP**. The old `EMAIL_PROVIDER` setting no longer pins one provider. Unconfigured providers are skipped; failures advance to the next configured provider, and a confirmed acceptance stops fallback. Use `BREVO_FROM_EMAIL` and `RESEND_FROM_EMAIL` if their verified sender addresses differ. A provider's HTTP acceptance is not proof of delivery to the inbox.

On a host that allows SMTP, configure Gmail fallback with `MAIL_HOST=smtp.gmail.com`, `MAIL_PORT=587`, `MAIL_USER` (the full Gmail address), `MAIL_PASS` (a Google app password), and optionally `MAIL_FROM`/`MAIL_FROM_NAME`. `MAIL_USERNAME` and `MAIL_PASSWORD` aliases and legacy `SMTP_*` settings are accepted. Gmail always requires STARTTLS on port 587. **Render's free tier blocks port 587**, so Gmail is not a working fallback there; at least one HTTPS API must be configured. This app keeps the same verification/reset link across fallback attempts; a timed-out provider can still deliver a duplicate, but the link remains one-time.

Remove `DLAS_DB_PATH=/tmp/dlas-free-demo.sqlite`. The cloud configuration never falls back to a local file if its URL or token is missing or invalid. Render's default hostname automatically supplies the HTTPS client URL and allowed origin; for a custom domain, set `CLIENT_URL` and `CORS_ORIGINS` to that exact HTTPS origin.

Change **Start Command** to:

```text
npm --prefix server run start:production
```

Deploy the tested GitHub commit. The first launch initializes the schema and approved question banks, creates only the first administrator, and emails their verification link. Later launches preserve that account and all student data; they do not run the demonstration seed. After the administrator exists, remove `BOOTSTRAP_ADMIN_PASSWORD` from Render. The remaining bootstrap settings can also be removed. If an email is rejected during bootstrap, the unverified account is retained; after correcting email settings, use **resend verification** on the login page rather than recreating the account.

The root `render.yaml` and `deploy/render-real-accounts.yaml` describe the real-account configuration. They prompt for a Brevo key by default; for a Resend-only setup, rename that entry to `RESEND_API_KEY` before applying it. Add any optional fallback credentials privately in Render. Do not create a second service just to update the existing one. If the current service is managed by an older preview blueprint, update that blueprint connection/configuration at the same time so a later sync cannot restore demo flags or the seed command.

An optional safe configuration check is available locally with the real production values loaded in private environment settings:

```powershell
npm --prefix server run check:production
```

It prints only readiness indicators and does not contact providers or send email. It checks bootstrap settings for a first launch; missing bootstrap settings are expected after the administrator has already been provisioned.

## 4. Verify the live switch

1. Confirm `/api/system/status` reports `demoMode: false` and `freeDemoReadOnly: false`. `/api/health` checks the database and returns HTTP 503 if it cannot query it. When healthy, it should report `dataProtectionReady: true`; `encryptedBackupReady: false` is accurate when using provider-managed recovery alone.
2. Follow the administrator verification email, sign in, and enroll an authenticator. Use **Settings → readiness → test email** to confirm mailbox delivery. The checklist shows configured provider order and the last provider that accepted a message since startup; the test result identifies its actual accepting provider. Provider acceptance alone does not prove inbox delivery. No keys, recipient addresses, or security links appear in provider status data.
3. Create one student account using an address you control, verify the email, sign in, and check password recovery.
4. Create and assign a scored quiz, complete it using that student, and verify its saved score and certificate rules. Research assessments remain unavailable.
5. Restart the Render service and verify the administrator, student account, saved quiz, and result remain. Stop real onboarding if this verification fails.
6. Check provider quota dashboards and remove only your explicit test accounts/results through authorized app controls. Do not mix test responses with research records.

## Recovery and research collection

[Turso automatically maintains recovery history at commit](https://docs.turso.tech/features/point-in-time-recovery). On the Free plan, recovery covers the preceding 24 hours **while the database still exists**. It does not recover a deleted database, a compromised provider account, or data outside that window. The application reports this as provider-managed recovery, never as a completed independent encrypted backup.

To recover an accidental data edit, create a **new** database from the original at a safe timestamp using the Turso dashboard/CLI, verify the restored records, then update Render's database URL and token to the restored database. Keep the original database until the restore has been checked. Follow the provider's current restore instructions; do not delete a live database to start recovery.

For an independent encrypted copy, use a trusted computer with the private database connection, backup key, and an absolute protected `BACKUP_DIRECTORY` configured:

```powershell
npm --prefix server run backup
npm --prefix server run verify-backup -- "C:/protected/backups/dlas-TIMESTAMP.sqlite.enc"
```

Cloud snapshots use a consistent database read transaction, copy schema and binary data to standard SQLite, validate integrity, and encrypt the snapshot with AES-256-GCM. Store the encrypted result off-host under the approved retention policy. Running this command on Render's temporary disk alone does **not** create a durable independent backup. The existing restore utility restores to a local SQLite file; restoring to Turso requires creating/importing a separate cloud database, checking it, and switching the connection.

Real accounts and scored quizzes are enabled by this configuration. **Research collection remains blocked** until College-approved consent wording, guardian identity/consent procedures, researcher contacts, retention policy, and automatic independent encrypted off-host backups are in place. The software does not invent or approve those institutional decisions.

## Validation and limits

`npm --prefix server test` runs the SQLite integration checks plus isolated cloud-configuration, email, bootstrap, and backup tests. Remote connection tests cover closed sessions, rollback, binary snapshots, and lost write/commit responses without retrying ambiguous writes. `npm --prefix server run test:libsql` repeats the account/research and scored-quiz integration suites with the production libSQL library against temporary local data. Email responses are mocked in these tests. A real Turso connection, provider email delivery, service restart, and multi-student load still require live verification after the private credentials are configured. The synchronous libSQL adapter opens a fresh remote session per operation and retains one session throughout each transaction, avoiding reuse of expired server streams. It preserves the existing transaction/scoring code; measure real cohort traffic before large simultaneous examinations.
