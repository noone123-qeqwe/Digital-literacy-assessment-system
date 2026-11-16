# Test administrator handover

Live administrator testing uses an account with an email address controlled by its owner. It has a unique generated password, normal email verification and mandatory authenticator setup. Its credentials belong in an operator-private file outside the repository. They are never built into the login page.

The replacement account is marked as a test account. This does not put the website in demo mode or disable account security. Testing administrator actions can affect live records.

Keep the previous owner account available until the replacement has verified its email, enrolled its own authenticator and opened an administrator session. Then deactivate the former account through the system's normal retirement model, revoke its sessions, invalidate outstanding verification/reset/recovery tokens and clear pending MFA challenges. Preserve account IDs and audit references rather than deleting student records or assessment history.

Startup no longer invokes the legacy helper that creates sample accounts and resets their passwords. The production launcher recognizes active administrators, including the explicitly provisioned test administrator. First-administrator bootstrap remains available only through its existing empty-database checks. Normal authenticator codes are required for every administrator and teacher; legacy universal test codes and public quick-login credential buttons are removed.

## Verification

The isolated backend suite checks real MFA setup, role restrictions, account-owned data and invalid requests. A fixed authenticator vector confirms that genuine codes work while the former universal test codes are rejected, even if a caller supplies the old bypass argument. Startup tests verify that an active test administrator avoids bootstrap and sample-account resets, while the initial bootstrap path remains available when needed. All tests use fixtures, temporary databases or isolated startup mocks.

The frontend lint and build checks and existing login interaction checks cover the cleaned login page. Real account verification and personal authenticator enrollment must be completed by the owner; operators must not set up or read the owner's authenticator on their behalf.
