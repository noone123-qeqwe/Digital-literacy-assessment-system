# Login form update — 16 November 2026

The login heading and sign-in controls now share one white card with a restrained green accent, consistent spacing, readable fields and a clear primary button. The repeated seal and department row inside the card is removed. The campus photograph, overlay, introductory animation and main school branding retain their existing settings. Registration has its own layout; the new card styles are scoped to the login page.

Forgot password remains right-aligned directly below Sign in. Create account remains a separate secondary action. The removed “New to DLAS?” prompt stays removed. Registration confirmation, verification messages and sign-in failures are shown within the card. Password visibility, native validation, autocomplete, keyboard controls and the authenticator code workflow remain supported.

Sign-in and MFA submissions now prevent repeated requests while pending. A client response-order issue was also corrected: an accepted password requiring MFA must still return an incomplete sign-in result to the form, so it displays verification instead of prematurely attempting dashboard navigation. Server verification requirements are unchanged.

## Validation

- Frontend lint and production build pass without warnings.
- Seventeen browser checks pass with intercepted fixture API responses; no live accounts or authenticator settings are changed.
- Layouts verified at 320×700, 390×844, 768×1024, 1365×645 and 1365×900, including 16px input text, 44px password-toggle targets, recovery-link placement and no horizontal overflow. The short desktop view fits without page scrolling.
- Interaction checks cover native validation, password visibility, keyboard recovery navigation, persistent errors and clearing, pending/duplicate submits, email verification links, account creation and registration confirmation, administrator verification, teacher MFA setup, failed setup, return to credentials and student sign-in routing.
- No browser page exceptions occurred. Desktop, phone, error and narrow MFA screens were visually inspected or captured for review.

The browser role-flow checks simulate server responses. They do not enroll or verify the owner's personal authenticator, deliver recovery emails or certify complete accessibility compliance.

## Mobile refinement

On phones and tablets below 1024px, the existing school branding now sits above the form in a compact header. The desktop marketing content is hidden at these widths, and the form no longer reserves a full viewport of blank space. Safe-area padding, 16px input text and touch-sized controls keep the form usable, with natural scrolling on short screens. Desktop retains its two-column presentation; registration retains its separate layout.

Thirteen additional browser checks passed across 320×568, 360×640, 375×667, 390×844, 430×932, 768×1024 and 844×390. They cover layout and overflow, field and button reachability in a reduced-height viewport, long error messages, recovery navigation, skipping the intro, desktop and registration regressions, and browser exceptions. The reduced-height check simulates limited keyboard space; it is not a physical-device keyboard test. All API responses were fixtures and no live accounts were changed.

## Password reset clipboard controls

The reset form has independent show/hide, Copy and Paste controls for both password fields. A browser check reproduced native paste working while copying a masked password was suppressed; copying after revealing the field worked. Explicit clipboard buttons provide a clear action for each field. They use the browser Clipboard API only after a button press and preserve its permission checks. Missing APIs and denied permissions show instructions for native selection, copying and pasting. No clipboard content is read on load, logged, stored or submitted automatically.

Paste preserves the exact text, including spaces, and replaces only the chosen field. Empty or overlong clipboard text leaves its existing entry intact and shows feedback. Native clipboard events remain unblocked. Inputs retain new-password autocomplete and have stable names, selectable text, and disabled autocorrection and spellchecking.

Thirteen clipboard check groups and the eleven password-visibility regression groups pass. Coverage includes independent fields, keyboard actions, permission denial, missing APIs, empty/long content, input attributes, four screen sizes (320×568, 390×844, 844×390 and 1365×900), form validation and reset feedback. New clipboard tests use an isolated browser stub and fixture reset requests, with no system clipboard access or production password changes. The mobile screen was visually reviewed; physical phones and individual password-manager apps were not tested. Frontend lint and production build pass.
