# Live workflow validation — 16 November 2026

Service: https://masbate-colleges-digital-literacy.onrender.com

Application fixes deployed from `df70795e4606add180cac1cf1df2d698c63ec119`. GitHub's application workflow passed backend checks, production-driver checks, frontend lint, and the production build. Documentation may be newer than that application deployment.

## Observed live results

Thirty-six checks passed against the real hosted service and independent test mailboxes. These checks used explicitly temporary QA identities and a temporary three-question scored quiz, rather than research respondents.

| Workflow | Observed result |
| --- | --- |
| Student registration | Creates an unverified account; sign-in is blocked until verification |
| Verification email | Delivered to an independent inbox; link activates the account and reuse is rejected |
| Password recovery | Email delivered; the one-time link successfully changes the test student's password |
| Administrator security | Temporary administrator enrolls MFA through the live API and receives a session after confirmation |
| Authorization | Student cannot read the answer bank, user management, another account's results, or staff reports |
| Cookie and request security | Browser session uses Secure, HttpOnly, SameSite cookies; missing CSRF header is rejected |
| Assessment management | Temporary administrator creates, publishes, and assigns a snapshotted scored quiz |
| Offline answers | All three question types can be answered while the browser is offline; local IndexedDB commits are observed |
| Browser restart | Pending answers survive closing and reopening the isolated browser profile, then synchronize after reconnecting |
| Lost acknowledgement | Server accepts an answer, its response is deliberately interrupted, and reloading reconciles the retained answer without duplicate response rows |
| Review and submission | Visible review and submission produce the expected 4/4 points, 100%, Advanced result |
| Certificate and reports | Visible certificate download works; certificate, PDF report, and Excel report return valid files |
| Completed attempt protection | Repeated submission returns the saved result; completed answers cannot be changed |
| Responsive layout | Typed-answer field and assessment layout checked at 320, 390, 768, and 1365 pixels; dashboards checked at phone, tablet, and desktop sizes |
| Browser stability | No uncaught exceptions in the observed student workflow |
| Service restart | Completed result, certificate eligibility, and valid session survive a real Render service restart |
| Backup recovery | Encrypted independent snapshot restores the completed test attempt and passes SQLite and foreign-key checks |
| Scheduled backup | Windows Task Scheduler independently runs the installed runner, updates a fresh verified backup status, and returns success |
| Final clean restore | Snapshot after cleanup restores one administrator and zero research or scored attempts |

Temporary inboxes were supplied by [Mail.tm](https://mail.tm/) for synthetic test identities only. They were deleted after testing. Private session data, MFA seeds, passwords, and provider keys are not included in this report or committed to GitHub.

## Defects corrected

1. Email requests and consumption of verification/reset links shared the same small hourly quota. Repeated legitimate account setup could block a valid link. Link consumption now has its own enforced limit; email-request throttling remains in place. Regression checks cover both limits.
2. Choice styles also applied to identification inputs, reducing the typed-answer box to approximately 26 pixels. Radio styling is now limited to radio controls, text inputs fill their available width, and assessment containers handle narrow screens and long headings.

The backend suite now passes **157 checks**. The production libSQL library repeats **131 account/research and scored-quiz checks** in isolated local databases. These automated suites use simulated mail responses; actual delivery was separately observed in the live workflow above.

## Final production data and configuration

After cleanup, the live database contains one Test Administrator, the original 112 research question-bank items, no research attempts, no scored attempts, and no temporary quizzes. The temporary accounts, questions, assignments, responses, results, sessions, tokens, and mailboxes were removed. Foreign-key validation returned no errors.

`/api/health` returns HTTP 200. `/api/system/status` reports `demoMode: false`, `freeDemoReadOnly: false`, and `studyCollectionReady: false`. The owner administrator's email is verified; personal authenticator enrollment remains pending.

## Backup installation and limits

Independent AES-256-GCM backups and private operations files are under `C:\Users\mcg45\DLAS-Operations`. The Windows task **Masbate Colleges DLAS encrypted backup** runs daily at **09:00 Asia/Manila**, runs a missed trigger when available, and retries failures. The computer must be powered on, connected, and signed in as its configuring Windows user. This does not guarantee continuous backups while that computer is unavailable.

The fresh clean restore proof is saved as `Operations\last-restore-check.json`; `Operations\backup-status.json` describes the latest run. `Backups\RESTORE_INDEX.json` identifies the verified clean snapshot and excludes test-era snapshots. See [backup operations](OFFHOST_BACKUP_OPERATIONS.md) for verification and recovery instructions. The application continues to distinguish provider-managed recovery from this separate local backup job.

Automatic approval review rejected deletion of retired encrypted QA snapshots and the old AppData configuration, stating only **“blocked by policy.”** Those files remain protected and marked retired/excluded. They do not appear in the live database or cohort reports. No rejected deletion was retried through another mechanism.

## Required human decisions and untested areas

- The owner must choose their own password and enroll their own authenticator. Temporary administrator MFA was tested; it does not configure the owner's personal device.
- College authorities must approve online administration, researcher contacts, consent/assent, guardian identity evidence, retention, and the operational backup arrangement. The [approval pack](RESEARCH_APPROVAL_DRAFT.md) is explicitly a draft; it was not loaded as approved consent or used to enable research.
- The final live knowledge question bank has no published scored quizzes. Temporary testing questions were removed; authorized staff still need to author or approve the actual educational quiz content.
- A browser restart and network interruption were simulated. Physical power failure, loss of the sole offline device, several simultaneously active students, every assistive technology, and cloud-provider disaster failover were not tested.
- The backup schedule depends on this computer and Windows profile. Institutional key custody, an approved retention schedule, and a continuously available backup arrangement require an operational decision before real research collection.

Research collection remains disabled. No approvals, signatures, guardian identities, or study findings were fabricated.
