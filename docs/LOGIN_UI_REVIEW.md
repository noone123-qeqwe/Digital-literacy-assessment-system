# Login form update — 16 November 2026

The login heading, school seal and sign-in controls now share one white card with a restrained green accent, consistent spacing, readable fields and a clear primary button. The campus photograph, overlay, introductory animation and school branding retain their existing settings. Registration has its own layout; the new card styles are scoped to the login page.

Forgot password remains right-aligned directly below Sign in. Create account remains a separate secondary action. The removed “New to DLAS?” prompt stays removed. Registration confirmation, verification messages and sign-in failures are shown within the card. Password visibility, native validation, autocomplete, keyboard controls and the authenticator code workflow remain supported.

Sign-in and MFA submissions now prevent repeated requests while pending. A client response-order issue was also corrected: an accepted password requiring MFA must still return an incomplete sign-in result to the form, so it displays verification instead of prematurely attempting dashboard navigation. Server verification requirements are unchanged.

## Validation

- Frontend lint and production build pass without warnings.
- Seventeen browser checks pass with intercepted fixture API responses; no live accounts or authenticator settings are changed.
- Layouts verified at 320×700, 390×844, 768×1024, 1365×645 and 1365×900, including 16px input text, 44px password-toggle targets, recovery-link placement and no horizontal overflow. The short desktop view fits without page scrolling.
- Interaction checks cover native validation, password visibility, keyboard recovery navigation, persistent errors and clearing, pending/duplicate submits, email verification links, account creation and registration confirmation, administrator verification, teacher MFA setup, failed setup, return to credentials and student sign-in routing.
- No browser page exceptions occurred. Desktop, phone, error and narrow MFA screens were visually inspected or captured for review.

The browser role-flow checks simulate server responses. They do not enroll or verify the owner's personal authenticator, deliver recovery emails or certify complete accessibility compliance.
