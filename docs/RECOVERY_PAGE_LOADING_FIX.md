# Recovery page loading fix

A fresh visit to the live forgot-password page rendered normally. Blocking its lazily loaded page file reproduced the reported empty screen exactly. A request for a retired deployment asset also returned the application HTML with HTTP 200 instead of a JavaScript-file 404. This is consistent with an older open tab requesting a page file replaced during deployment; the user's own browser console was not inspected.

Account recovery, password reset, email verification and authenticator recovery now load with the application shell. They no longer request a separate AccountActionPage file when a user navigates from sign-in.

The entry HTML is served with Cache-Control: no-store, including direct index.html requests. Existing versioned files retain their cache policy. Missing files under /assets return an uncached plain-text 404 instead of the SPA document. Existing API routes and API error responses retain their previous behavior.

A React error boundary displays a readable recovery screen if another page fails to load or render. Reload explicitly retries the current URL, preserving its query string; Return to sign in performs a fresh navigation. There is no automatic refresh loop or background navigation that could interrupt an assessment or discard an open form. Raw exception messages and recovery tokens are not displayed in the fallback.

## Validation

The full backend suite passes, including eight new HTTP delivery checks and the existing MFA-policy and startup checks. Frontend lint and production build pass. Thirteen browser check groups cover direct recovery/reset visits at 320×568, 390×844, 844×390 and 1365×650; navigation from login; verification/recovery forms and fixture one-time links; readable fallback controls; deliberate module failures; explicit keyboard retry; query preservation; and return to sign-in. Eleven visibility checks and thirteen clipboard checks also pass.

Browser account actions used fixture responses. No real recovery emails, password changes, clipboard reads or clipboard writes were performed by these regression checks. Phone layouts were browser simulations, with desktop and narrow fallback screenshots visually inspected.
