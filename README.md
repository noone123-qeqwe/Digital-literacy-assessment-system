# Digital Literacy Assessment System

DLAS is a role-based digital literacy platform with scored knowledge quizzes, the thesis's 30-item questionnaire, and a separate DigCompSAT self-reflection instrument. It supports student learning, profiles, recovery, results, progress comparisons, achievement certificates, and staff reports while preserving each assessment's scoring methodology.

## Stack

- Node.js 24, Express, SQLite (local) or Turso libSQL (cloud), JWT, and bcryptjs
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

For **real accounts on free hosting**, use the prepared [cloud database and email setup](docs/REAL_ACCOUNTS_SETUP.md) and `deploy/render-real-accounts.yaml`. It uses durable Turso storage, Brevo/Resend email, and a clean first-administrator workflow. Private provider settings must be connected before switching the existing public service out of demo mode. Accounts and scored quizzes can operate while research collection stays disabled pending its separate approvals and independent encrypted backups.

The repository's `render.yaml` configures **real accounts on free hosting** with an external Turso database and HTTPS email delivery. It starts the production launcher, preserves accounts and results across restarts, and never runs the demonstration seed. Private connection settings and a first administrator are required before activation; follow the setup guide above.

An optional read-only sample preview is available separately in `deploy/render-preview.yaml`. Only that preview uses the demonstration student `maria.santos@example.com` with password `User@123`. Do not use the preview for real participants, personal information, or research results.

Render free web services cannot attach persistent disks. Their local SQLite database is lost on redeploy, restart, or idle spin-down; the service can also take about a minute to wake after inactivity. The seed command recreates only the synthetic preview dataset. Free services cannot send email over the common SMTP ports, so account registration and email workflows are disabled in the demo. See Render's current [free service limits](https://render.com/docs/free).

Real accounts and scored quizzes can run with the external database and verified email connection. A real study additionally requires automatic independent encrypted off-host backups and College-approved consent and governance settings. Research collection stays disabled until those requirements are met. Never enable the free-demo flag on a research service. Do not seed a live database.

Database migrations preserve existing records while adding the new research profile fields and consent records. Existing assessments are migrated with consent required; new assessments let administrators enable or disable the consent gate. If an older local database contains an active assessment with an expired schedule, update its availability in **Assessments Management** before respondents can start it; fresh seed data has no schedule restriction.

## Configuration

Copy `server/.env.example` to `server/.env` and set a unique random `JWT_SECRET` of at least 32 characters. In production, set `NODE_ENV=production`, configure `CORS_ORIGINS` to the exact frontend origins, use HTTPS, and configure either a persistent SQLite location or the remote Turso connection. Keep `.env`, tokens, and database files private. Production startup refuses demo databases or missing email/security/recovery configuration. Research collection additionally requires institutional approvals and independent encrypted backups; `DLAS_RESEARCH_ENABLED=false` keeps research collection disabled while real accounts and scored quizzes operate.

`PORT` defaults to `3000`. `JWT_EXPIRES_IN` defaults to `12h`. `DLAS_DB_PATH` defaults to `server/db/dlas.db`; it can point to a separate SQLite file for isolated development or deployment.

## Account security

- New respondent accounts and administrator-created accounts must verify their email before sign-in. Verification links expire and are stored only as hashes. Password reset links expire after 30 minutes and revoke existing sessions.
- Administrator and teacher/assessor accounts must enroll in an authenticator app (TOTP) and enter a one-time code at sign-in. MFA recovery uses a separate, one-time email token and requires re-enrollment.
- Access tokens are held in `HttpOnly`, `SameSite=Strict` cookies and are not written to browser storage. Mutating requests require a CSRF token. The **Security** page lists active sessions/devices and lets users revoke sessions and change their password.
- Email tries configured providers in this order: **Brevo → Resend → Gmail/SMTP**. A rejection, connection failure, or missing acknowledgment advances to the next provider. Gmail uses `smtp.gmail.com:587` with required STARTTLS and a Google app password; legacy custom SMTP settings also work. Free Render requires at least one HTTPS API because it blocks SMTP port 587. API senders must be verified separately in each provider.
- Administrators can see configured provider names and the last provider that accepted a message in the readiness checklist. This is reset on restart and does not prove inbox delivery. The email test reports the provider that accepted that test; keys, addresses, and tokens are excluded from status data.
- For local development without configured email providers, verification and recovery links are printed in the server terminal. Production never falls back to development links. The same one-time link is reused across providers; a timed-out provider may still deliver a duplicate message.

## Website ping and wake-up checks

The hosted server includes its own **one-minute health ping** in `server/utils/websitePing.js`. Set `DLAS_SELF_PING_ENABLED=true` to enable it (the Render blueprint enables this). It starts after the server begins listening, checks the public `/api/health` endpoint immediately and every 60 seconds, and reports its state in the health response's `selfPing` field. It uses `DLAS_SITE_URL` when configured, otherwise the Render hostname, `CLIENT_URL`, or this project's default website URL. Each check makes one unauthenticated, uncached GET with a 15-second timeout; overlapping requests are skipped and shutdown cancels the request and timer. Failed checks are logged and tried again the next minute. No browser or Codex session is needed while the server is running. Set the flag to `false` to stop the internal monitor on the next restart.

The repository's **Ping website** GitHub Actions workflow requests `https://masbate-colleges-digital-literacy.onrender.com/api/health` every ten minutes from outside Render. It also supports **Actions → Ping website → Run workflow** for a manual wake-up/check. No server sign-in or additional monitoring account is needed. The script retries up to four times with a 20-second timeout per request, checks for the application's healthy JSON response, and fails if it receives only an error page or Render's starting screen. It never logs in, submits an assessment, or changes stored data.

For a manual check from this project, run `npm --prefix server run ping-site`. If the website address changes, set the GitHub Actions repository variable `DLAS_SITE_URL` to its HTTPS origin; for a local command, set the environment variable of the same name. Review workflow results in the repository's Actions tab; GitHub workflow notifications follow the account's notification settings. You can pause checks using **Actions → Ping website → Disable workflow**.

This reduces idle cold starts but cannot guarantee that the Render loading page will never appear. Render free services sleep after 15 minutes without traffic, may restart, and share a 750-hour monthly free allowance across the workspace. GitHub schedules can run late or be skipped, and public-repository schedules are disabled after 60 days without repository activity. A timer inside this app cannot wake its own stopped server. References: [Render free service limits](https://render.com/docs/free) and [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

## Production database setup

Do not use the demo seed for research. It creates synthetic users, completed attempts, and an active demonstration assessment, then marks the database as demo data. Production will refuse to start with that marker.

For the first production deployment, configure email delivery and the environment values in `server/.env.example`, then provision the initial administrator from an empty production database. In PowerShell, set these values for the command without adding the password to source control:

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

### Scored knowledge assessments

Six original topic assessments extend the baseline/follow-up course: digital essentials, cybersecurity and privacy, fact-checking and media, communication and collaboration, productivity and data, and responsible AI and citizenship. Each has 12 questions, a timer, one attempt and an 80% achievement-certificate threshold. See [topic assessment sources, publication and verification](docs/TOPIC_ASSESSMENTS.md). The live answer bank is kept outside the public repository.

The blue workspace includes a separate knowledge-assessment module alongside the thesis and DigCompSAT self-reflection instruments. Administrator navigation includes Categories, Question Bank, Assessment Management, Results, Analytics, Materials, Progress, Certificates, and Settings. Research management, questionnaire editing, research analytics, and the existing learning path remain accessible through clearly labelled links. Students have dedicated assessment, result, learning, progress, certificate, and profile pages; teachers can manage and report only their own knowledge cohorts.

The knowledge module starts with eight categories: Computer Literacy, Internet Literacy, Information Literacy, Digital Communication, Digital Safety and Security, Digital Citizenship, Productivity Tools, and Media Literacy. Administrators can maintain categories, scored questions, and plain-text learning guides. Questions support multiple choice, true/false, and identification with accepted alternatives; identification matching ignores case and repeated whitespace. Questions have 1–100 points. Quiz creation captures an immutable copy of the question text, accepted answers, category labels, points, instructions, and certificate threshold. Bank edits do not change existing assessments. To revise an assessment, create a new version from the bank. Assessments with attempts must be archived rather than deleted.

Staff can assign individual verified students, or all active verified students at creation; later registrants require a separate assignment. Quizzes support publication controls, opening dates, deadlines, optional timers, one to ten attempts, and randomized question/choice order. Students confirm independent work, answer one question at a time, review their responses, and submit for server-side scoring. In-progress responses never include answer keys. The percentage is earned points divided by possible points, rounded to two decimal places: 90+ Advanced, 80+ Proficient, 70+ Developing, 60+ Beginner, and below 60 Needs Improvement. These levels apply only to scored quizzes. Research scores keep their original methodology and are not converted to percentages.

Same-device IndexedDB recovery keeps pending quiz answers until server acknowledgement. Reopening after an interrupted upload restores the copy. Revision checks prevent stale uploads from silently overwriting answers saved in another tab or device; the participant must choose which copy to keep. Submission requires connectivity. A timer/deadline runs on the server; answers arriving after it expires cannot be credited, and finalization scores only previously received responses. Any remaining unsynced copy is retained for export or explicit discard. Browser/device storage loss can still erase local-only work. Returning after a browser restart may require signing in again before recovery can be opened.

Results include correct/incorrect answers, category scores, explanations, and authorized PDF/Excel downloads. Dashboards use the latest completed result per student and quiz, while history retains each attempt. Category charts aggregate earned/possible points, and progress compares first and latest attempts of the same quiz snapshot. Starter guides cover all eight categories, can be marked complete, and are recommended for categories below 70%. A content edit resets prior completion records for that guide. Staff cohort reports are role scoped and contain student names; research exports keep their separate research privacy rules.

An achievement certificate becomes downloadable automatically when the stored score meets the quiz's configured threshold. It includes the participant name, assessment, percentage, achievement level, completion date, and unique attempt reference. It is distinct from the existing research completion award. Certificate downloads are disabled in the public read-only demonstration. Demo databases receive 24 original example questions and three assigned example quizzes, with no fabricated completed knowledge results; clean production databases receive categories and starter guides but no example quiz records. Review authored questions and materials for the intended curriculum before using them in formal evaluation.

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
