# Independent encrypted backup operations

Configured 16 November 2026 on the project owner's Windows computer. These backups are independent of Render's temporary filesystem and Turso's account. Database secrets and the encryption key are stored under Windows protection for the current user; no credentials are in this repository or task arguments.

## Installed configuration

| Item | Location or behavior |
| --- | --- |
| Encrypted backups | `C:\Users\mcg45\DLAS-Operations\Backups` |
| Private runner and protected settings | `C:\Users\mcg45\DLAS-Operations\Operations` |
| Windows scheduled task | `Masbate Colleges DLAS encrypted backup` |
| Daily trigger | 09:00 Asia/Manila |
| Missed trigger | Runs when available after this Windows user signs in |
| Retry policy | Up to three retries, fifteen minutes apart |
| Provisional operational retention | Thirty days; College approval is still required for research retention |
| Status file | `Operations\backup-status.json` |
| Last scheduled-run log | `Operations\backup.log` |

The computer must be powered on, connected to the internet, and signed in as the configuring Windows user. This is a computer-dependent backup schedule, not a continuously available cloud backup service. Keep the project at its current path: the runner uses its database and encryption libraries. If the project moves or connection credentials change, update the private configuration and repeat a restore check.

Each run copies a consistent cloud transaction to a temporary SQLite snapshot, validates and encrypts it with AES-256-GCM, removes the temporary plaintext snapshot, then decrypts a temporary verification copy and checks SQLite integrity. The status file records the completion time, encrypted filename, hash, and integrity result. Encryption keys, email tokens, participant names, and response text are not written to that status file.

## Run and verify

Use the task's **Run** action in Windows Task Scheduler, or execute:

```powershell
node "C:\Users\mcg45\DLAS-Operations\Operations\run-backup.cjs"
```

Inspect `backup-status.json`: require `success: true`, `integrity: "ok"`, and a recent completion time. A previous successful file does not prove that a later scheduled run succeeded. Investigate a stale status file, nonzero task result, disk-space error, or connection failure.

For a restore rehearsal without touching the live service:

```powershell
node "C:\Users\mcg45\DLAS-Operations\Operations\run-backup.cjs" --restore-check
```

The rehearsal restores into a new temporary directory, checks foreign-key and SQLite integrity, and removes that temporary copy. It never overwrites the live cloud database. A rehearsal is not a completed cloud failover or recovery-time guarantee.

## Actual recovery

1. Preserve the original database and encrypted backup. Stop data changes through an authorized maintenance procedure.
2. Verify the backup and restore it into a separate protected location. Confirm the required accounts, questions, and results with the responsible operator.
3. Create a separate compatible cloud database and import the verified snapshot using the provider's current supported process. Do not overwrite or delete the original database to conduct a rehearsal.
4. Validate the imported data and application behavior before updating Render's private database connection. Retain the original until recovery is accepted.
5. Record the incident, recovery timestamp, potential data loss since the snapshot, and acceptance by the authorized operator. Resume collection only after verification.

Store a separate protected recovery copy of the encryption key under the College's approved custody policy. Windows-protected settings depend on this Windows profile; they are not a replacement for an institutional key-recovery plan. The application continues to report provider-managed recovery separately and does not automatically treat this local task as College approval or research readiness.
