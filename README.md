# Digital Literacy Assessment System

DLAS is a role-based assessment app for administering the thesis's 30-item scored digital literacy questionnaire and a separate DigCompSAT self-reflection instrument, collecting respondent profiles, scoring completed attempts, and reviewing cohort results.

## Stack

- Node.js 24 or newer (the server uses the built-in `node:sqlite` module), Express, SQLite, JWT, and bcryptjs
- React 19, Vite, React Router, Tailwind CSS, Chart.js, and Axios
- PDFKit and ExcelJS for result and cohort downloads

## Run locally

Install dependencies in both `server` and `client`:

```powershell
cd server
npm install
npm run seed   # Optional: initializes a local demo database; refuses to run in production
npm start
```

In a second terminal:

```powershell
cd client
npm install
npm run dev
```

Open the Vite URL printed by the client (normally `http://localhost:5173`). The server listens on port 3000 by default.

## Render deployment

The repository's `render.yaml` deploys a **free, read-only demo preview**. It builds the React client, serves it and the API from one Node service, seeds synthetic sample records on startup, and uses HTTPS with secure same-origin cookies. The demo supports signing in to view the student dashboard and existing sample results. Registration, profile changes, and assessment submissions are blocked.

Use the demonstration student account `maria.santos@example.com` with password `User@123`. Do not use the public demo for real participants, personal information, or research results. Its visible demo banner and server-side read-only guard are intentional.

Render free web services cannot attach persistent disks. Their local SQLite database is lost on redeploy, restart, or idle spin-down; the service can also take about a minute to wake after inactivity. The seed command recreates only the synthetic preview dataset. Free services cannot send email over the common SMTP ports, so account registration and email workflows are disabled in the demo. See Render's current [free service limits](https://render.com/docs/free).

This free Blueprint is not a production or research deployment. A real study requires persistent storage, automatic encrypted and off-host backups, working email delivery, and College-approved consent and governance settings. Never enable the free-demo flag on a research service. Do not seed a live database.

Database migrations preserve existing records while adding the new research profile fields and consent records. Existing assessments are migrated with consent required; new assessments let administrators enable or disable the consent gate. If an older local database contains an active assessment with an expired schedule, update its availability in **Assessments Management** before respondents can start it; fresh seed data has no schedule restriction.

## Configuration

Copy `server/.env.example` to `server/.env` and set a unique random `JWT_SECRET` of at least 32 characters. In production, set `NODE_ENV=production`, configure `CORS_ORIGINS` to the exact frontend origins, use HTTPS, and provide a persistent location for `DLAS_DB_PATH`. Keep `.env` and database files private. Production startup refuses demo databases, missing institutional research approvals, missing email/security configuration, or missing encrypted-backup configuration.

`PORT` defaults to `3000`. `JWT_EXPIRES_IN` defaults to `12h`. `DLAS_DB_PATH` defaults to `server/db/dlas.db`; it can point to a separate SQLite file for isolated development or deployment.

## Account security

- New respondent accounts and administrator-created accounts must verify their email before sign-in. Verification links expire and are stored only as hashes. Password reset links expire after 30 minutes and revoke existing sessions.
- Administrator and teacher/assessor accounts must enroll in an authenticator app (TOTP) and enter a one-time code at sign-in. MFA recovery uses a separate, one-time email token and requires re-enrollment.
- Access tokens are held in `HttpOnly`, `SameSite=Strict` cookies and are not written to browser storage. Mutating requests require a CSRF token. The **Security** page lists active sessions/devices and lets users revoke sessions and change their password.
- For local development without SMTP, verification and recovery links are printed in the server terminal. Do not use those development links as a production mail setup.

## Production database setup

Do not use the demo seed for research. It creates synthetic users, completed attempts, and an active demonstration assessment, then marks the database as demo data. Production will refuse to start with that marker.

For the first production deployment, configure SMTP and the environment values in `server/.env.example`, then provision the initial administrator from an empty production database. In PowerShell, set these values for the command without adding the password to source control:

```powershell
$env:NODE_ENV = 'production'
$env:BOOTSTRAP_ADMIN_EMAIL = 'research-admin@example.edu.ph'
$env:BOOTSTRAP_ADMIN_FIRST_NAME = 'Research'
$env:BOOTSTRAP_ADMIN_LAST_NAME = 'Administrator'
$env:BOOTSTRAP_ADMIN_PASSWORD = 'use-a-unique-password-of-at-least-12-characters'
cd server
npm run bootstrap-admin
Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD
```

The bootstrap command creates the five competence areas and the existing 30-item instrument without demo users or results. It creates one unverified administrator account and sends an email-verification link; first sign-in then requires authenticator enrollment. It only runs for an empty, non-demo production database. After provisioning, configure the approved consent and research governance values, then start the server. Production APIs remain unavailable until an encrypted backup succeeds; a failed scheduled backup closes API access and triggers a retry after 15 minutes. `/api/health` reports whether backup protection is ready.

Generate a separate random key for each setting and store both in the deployment secret manager. In PowerShell, run the command twice and use a different output for each key:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Losing either key means MFA secrets cannot be decrypted or encrypted backups cannot be restored. Use an external protected backup location, not the same disk as the SQLite database.

## Research readiness and data protection

Production requires the College-approved `RESEARCH_CONSENT_TEXT`, `RESEARCH_ASSENT_TEXT`, `GUARDIAN_CONSENT_TEXT`, `RESEARCH_CONSENT_VERSION`, `RESEARCH_APPROVAL_ID`, `RESEARCHER_NAME`, `RESEARCHER_EMAIL`, `DATA_RETENTION_POLICY`, `RESEARCH_CONSENT_APPROVED=true`, and `GUARDIAN_PROCESS_APPROVED=true`. The consent page displays these approved values. For participants under 18, the participant provides assent and a parent/guardian confirmation link is sent to the supplied guardian email. Email confirmation verifies access to that mailbox; it does not independently prove the person’s legal identity. The College must approve the identity-verification process before collection begins.

Research cohort exports require at least five completed participants, use export-specific respondent codes, generalize profile attributes, and suppress rare categories and rare cross-profile groups. Open-ended responses are omitted from cohort exports until an administrator reviews and redacts them. Review any exported dataset for contextual re-identification risk before sharing it; pseudonymous row-level data is not anonymous data.

Assessment creation snapshots the item wording, domains, instrument version, scoring version, and proficiency cutoffs. Existing results keep using their stored snapshot after the question bank changes. Administrators can set one to ten attempts per assessment; the default remains one. Cohort imports match verified existing accounts by email and/or optional student ID, and manual reminders go only to unfinished participants. Analytics include Cronbach’s alpha for complete item responses and inferential effect sizes, confidence intervals, and Benjamini–Hochberg adjusted p-values alongside assumption checks.

## Encrypted backups and restore

When `BACKUP_ENCRYPTION_KEY` is configured, the server creates an encrypted SQLite snapshot at startup and then every `BACKUP_INTERVAL_HOURS` (default 6). Files are AES-256-GCM encrypted and old backups are pruned after `BACKUP_RETENTION_DAYS` (default 30). Set `BACKUP_DIRECTORY` to a protected persistent backup volume and copy backups off-host according to the College recovery plan.

Stop the server before restoring. With the same `BACKUP_ENCRYPTION_KEY` and `DLAS_DB_PATH` configured, run from `server`:

```powershell
node db/restore.js C:\\protected-backups\\dlas-2026-11-08.sqlite.enc
```

Before a restore, verify the encrypted backup without touching the configured live database:

```powershell
npm run verify-backup -- C:\\protected-backups\\dlas-2026-11-08.sqlite.enc
```

The verifier decrypts to a temporary folder, checks SQLite integrity and application tables, then removes the temporary copy. The restore command decrypts and checks SQLite integrity, preserves the current database as a `.pre-restore-*` file, and then restores the selected snapshot. Rehearse a restore on a separate environment before collecting study data; record who performed it, how long it took, and whether the application worked afterward.

## Roles and workflows

- **Administrator:** manage users, question items, assessments and assignments; review all-assessment or single-assessment analytics; export cohort spreadsheets.
- **Teacher / Assessor:** the system’s faculty-facing role. It can create and assign assessments, then review analytics and results only for assessments it created or cohorts assigned to it; administrators manage accounts and the question bank.
- **Respondent:** update a profile, complete or resume an assigned assessment, use the help page and learning path, and review/download a dated history of completed results. Assessment answers are written to a same-device IndexedDB recovery copy before upload, and queued until the server confirms them. A recovery snapshot includes the in-progress instrument and the optional open-ended response so it can be restored after a browser restart or power interruption; pending records are replayed idempotently when the student signs in again on the same device and browser. The client requests persistent browser storage where supported, but browser settings or device failure can still erase local-only data. Submission requires connectivity and successful synchronization. Local assessment recovery also changes participant data handling, so the updated consent disclosure and institutional approval should be completed before collecting real study data.

Public registration creates respondent accounts only. Student ID is optional and is used only to match an existing account during a staff roster import. Assessment availability and time limits are enforced by the API. Responses are saved as they are changed; every question assigned to an attempt must be answered before a score is calculated. An expired timer preserves saved responses, and an assessment owner can restart that timer from the participant list when the assessment is open. Assessment time limits cannot be changed while attempts are in progress, and question wording, numbering, and domain are protected after an attempt starts so historical results remain interpretable. A question area omitted from a custom assessment is reported as not available.

The administrator dashboard includes a readiness checklist for consent approval, demo-data separation, mail delivery, secure origins, and encrypted backups. College approval of research wording, guardian procedures, retention terms, and researcher details remains a required institutional decision; the software cannot approve these on the College’s behalf. Administrators can publish approved learning links for each competence area. Students can track completion and compare results only when question wording and scoring versions match.

Research consent can be enabled for an assessment during creation; it is enabled by default in the study workflow. Respondents under 18 must provide assent and a parent/guardian must also confirm consent. Respondents can withdraw at any point; withdrawal deletes that respondent's saved answers, assessment score, and consent record for the selected assessment. The 30-item instrument is scored independently of the optional open-ended Part III response about skills the respondent wants to develop.

The supplied thesis methods specify a Part III open-ended question, but the supplied questionnaire appendix ends after the 30 Part II statements. The system follows the thesis methods and includes the unscored question; reconcile the appendix before final print or ethics submission. The study profile captures exact monthly family income as in the questionnaire and derives the thesis's three reporting bands. It also captures junior and senior high school type, as specified in the thesis methods.

The overall proficiency score and domain scores retain the existing 1–4 arithmetic-mean calculation and DigComp 2.1 proficiency cutoffs. For research comparisons, use the standard 30-item instrument with its full domain coverage; custom subsets should be interpreted only within their own assessment.

### Optional DigCompSAT self-reflection instrument

Assessment creation also offers the complete 82-item English DigCompSAT item bank. It includes separate knowledge, skills, and attitude response scales scored 0–3 across the five DigComp competence areas. The full bank is required for each DigCompSAT assessment; its published items are read-only, while the thesis questionnaire remains unchanged. Reports and exports retain the item version and framework competence IDs. DigCompSAT is a self-reflection tool, not a right-or-wrong quiz or an official proficiency classification. Keep its scores and analyses separate from the thesis instrument, and treat local findings as exploratory until the College approves and completes local validation. The system imports the source wording in English and maps its competence statements to the system’s five local competence-area codes; the European Commission is not responsible for or endorsing this local implementation.

Source: Clifford et al. (2020), *DigCompSAT: A Self-reflection Tool for the European Digital Competence Framework for Citizens*, JRC123226, doi:10.2760/77437. European Union, 2020, CC BY 4.0. The Joint Research Centre states that the existing DigCompSAT item bank may be used and adapted; indicate changes and do not imply Commission endorsement.

### Assessment completion awards

After submitting an assessment, a signed-in respondent can download a personalized PDF completion award from the results page. Each award is named after its specific assessment, uses a color theme for its instrument, and has its own attempt reference. The award recognizes completion only; it does not certify a score, proficiency level, or academic credit. Awards are disabled for the public free demo so synthetic records cannot be presented as real participant credentials.

Rate-limit counters are stored in the configured SQLite database and use keyed hashes of client addresses, so limits survive server restarts and are shared by app processes using the same database. When running behind a reverse proxy, set `TRUST_PROXY` to the trusted hop count or trusted proxy address list so Express reads the client address correctly. Do not trust arbitrary proxy headers from untrusted networks. SQLite is suited to a single-host deployment; use a managed shared database and shared rate-limit store before scaling across independent hosts.

## Tests and build

```powershell
cd server
npm test
```

The integration suite creates and deletes a temporary SQLite database and does not write to the default demo database. Build and lint the frontend with:

```powershell
cd client
npm run build
npm run lint
```

Analytics show descriptive summaries based on completed attempts and compare scores across the thesis profile groups. The report checks normality with Jarque–Bera and variance with median-centered Levene. It uses independent-samples t-tests or one-way ANOVA with Tukey HSD when assumptions pass, and Mann–Whitney U or Kruskal–Wallis when they do not. Small-sample rank tests use deterministic permutation p-values. The Excel study dataset contains completed records only and uses respondent codes instead of names, emails, account IDs, school names, or barangays; it includes separate profile, item-rating, and Part III worksheets.

The production guard is a technical setup check; it does not replace ethics review, institutional approval, a signed guardian identity process, a privacy impact assessment, or a formal data-retention decision. Do not collect real study data until those approvals and operational recovery procedures are in place.
