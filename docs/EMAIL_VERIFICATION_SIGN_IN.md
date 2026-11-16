# Email verification and dashboard entry

An active student opening a valid verification link receives the application's
normal session and CSRF cookies. The verification page refreshes authenticated
account state and opens the student's dashboard. The waiting registration tab
also checks the new session when notified through BroadcastChannel or when it
regains focus. Tabs can share this handoff only within the same browser session.

The verification effect depends on the stable session-refresh function, avoiding
repeated refreshes when the provider's user state changes. A newer session refresh
takes precedence over an older initial signed-out response. Strict Mode's effect
replay does not redeem the one-time token twice. If authenticated session retrieval
fails after successful verification, the page confirms the email and offers
sign-in instead of assuming access to a protected dashboard.

Expired, used, wrong-purpose, and inactive-account links cannot issue a session.
Student sessions cannot access administrator routes. Staff accounts with required
MFA complete their existing sign-in verification before entering their dashboard.

Validation uses temporary backend fixtures, the real frontend auth provider,
and browser-intercepted API responses. Coverage includes provider rerenders,
a delayed initial 401, desktop and mobile redirect behavior, separate registration
and verification tabs, expired links, and staff verification requirements.
No real verification emails or production accounts are used for these checks.
