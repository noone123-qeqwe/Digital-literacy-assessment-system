# Mobile cinematic entrance — 16 November 2026

The login entrance keeps the Masbate Colleges seal, campus photograph and green-and-gold school branding. Phones use a shorter 1.85-second main sequence, staggered text reveals and a small rotating seal accent. The campus image stays still on mobile, including landscape phones, and the full-screen light sweep is reserved for larger screens. The existing desktop composition remains available.

The entrance fits the current viewport, including short landscape screens, with safe-area padding and a cream “Continue to sign in” button near the bottom. Skip intro remains available at the top. Both actions work immediately. Keyboard focus cycles through visible controls, Escape closes the entrance, and finishing restores scrolling and focuses the login heading without opening the phone keyboard.

Brand text and an MC seal fallback appear while images prepare. Preparation is bounded to 350 milliseconds. Only images decoded within that window are included in the entrance, so a slow download cannot suddenly replace its background during playback. Failed or unsupported image decoding leaves the branded fallback and never prevents sign-in. The login page can still load the original school images normally.

The entrance still plays once per browser-tab session. Registration confirmation and reduced-motion preferences bypass it. Changing the motion preference during playback also releases the sign-in page. Existing session markers are preserved; use a fresh browser tab or private window to preview it again.

## Validation

Browser verification uses isolated contexts and intercepted account API responses, without creating accounts, sending emails or changing real assessment records. It covers small portrait phones, landscape phones, tablet and desktop; automatic exit; both skip actions; keyboard navigation; restored focus and scrolling; slow and failed images; unavailable storage and decoding; reduced motion; repeat visits; registration confirmation; and rotation during playback.

Nineteen entrance check groups pass at 320×568, 360×640, 390×844, 430×932, 768×1024, 844×390, 667×375, 568×320 and 1365×645. Visual inspection caught and corrected overlap on the shortest landscape layout. Motion-preference testing also caught a focus issue when the hidden login page was uncovered; focusing after its paint resolves it. No browser exceptions were recorded.

The existing 17 login and 13 mobile-login regression checks pass and cover sign-in validation, password visibility, recovery navigation, verification, MFA, errors and role routing. Frontend lint and production build pass.

These are desktop-browser simulations of mobile screens, with visual screenshot review. Physical iPhone/Android rendering, notch behavior and frame-rate performance have not been measured on hardware.
