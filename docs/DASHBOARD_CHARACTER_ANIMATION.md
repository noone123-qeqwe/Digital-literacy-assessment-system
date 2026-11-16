# Dashboard character animation — 16 November 2026

The existing customizable SVG character now blinks, nods gently, types with alternating hands and has a softly pulsing laptop light. Plant leaves sway when the plant is enabled. These details accompany the existing Float and Breathe modes. Choosing None disables all character animation without changing the user's saved appearance.

Update: the whole-character up-and-down Float movement has been removed. Its editor label is now Animated; existing saved `float` settings remain compatible and display the same anchored character with blinking, typing and other detail animations. Breathe and None remain separate choices. This applies to the dashboard and editor preview on desktop and mobile without changing saved position or appearance settings.

Focused browser checks pass at 320×568, 390×844, 844×390 and 1365×900: the character container stays at the same position throughout its detail animations, the editor shows Animated for existing settings, pause/resume and other modes work, and reduced motion still disables animation. There were no browser exceptions or production account writes. Frontend lint and build pass.

The banner shows only Customize character; its separate pause icon was removed at the user's request. Pause/resume remains available in the editor's Motion settings. The dashboard character pauses while the editor is open. Animation also pauses outside the viewport or while the document is hidden, and all motion is disabled for the device's reduced-motion preference. Movement uses CSS transforms and opacity on existing SVG parts, with no additional image downloads, animation library or frame-by-frame JavaScript loop.

Frontend lint and production build pass. Fourteen isolated browser checks cover actual animation transforms, pause/resume and keyboard use, offscreen and document visibility suspension, preview behavior, existing hairstyles/expressions/clothing, saving and reloading None, five phone/tablet/landscape sizes from 320×568 to 844×390, desktop rendering at 1365×900, reduced motion and browser exceptions. API responses and saves were fixtures; no production character settings were changed. Desktop and phone screenshots were visually inspected. These checks use Chrome emulation rather than physical-device performance measurements.

After removing the banner's pause icon, focused checks passed at 320×700, 390×844, 768×1024 and 1365×900: only Customize character remains in the banner, character motion continues while visible, editor pause/resume still works, reduced motion is respected and no browser exceptions occur. Lint and build passed again.

## Illustration refinement

The character has a wider, softer face, more natural eyes and smile, curved hairstyles with strand detail, and subtle shading derived from the selected colors. Clothing now includes collar stitching, sleeve trim, fabric depth and a small book emblem. The desk scene has a thinner laptop, ceramic planter, detailed book pages, a bookmark and softer ground shadows. The optional backdrop adds a faint clock and small decorative accents.

All seven hairstyles, three clothing styles, three expressions, glasses, facial hair, skin colors, scene toggles and existing animation modes remain supported. Gradients use a unique ID per illustration, keeping preview colors independent from the saved dashboard character. No raster assets or animation libraries were added, and the banner pause icon remains removed.

Eight additional isolated browser checks passed for valid independent gradient references, appearance options, six skin tones and preview isolation, complete scene toggles, finite SVG paths, save/reload behavior, reduced motion and browser/SVG errors. A seven-character variation sheet and desktop/mobile views were visually inspected. The four-size banner checks passed again, including motion and editor controls. These checks use fixture responses and did not change production appearance settings. Frontend lint and build passed.

## Laptop perspective correction

The laptop now has a taller rear-facing lid without an interior-screen bezel, a connected hinge and a keyboard deck projecting toward the student behind the lid. Hands rest over that deck; the case has a thin side edge, vents and a small status light. The open book and book stack were repositioned to keep the laptop's base clear. Lid and deck shading continue to use the chosen laptop color.

Nine illustration checks and four viewport checks passed, including dark/light laptop color changes, rendering with books hidden, valid SVG paths, animation and editor controls. The laptop was visually inspected both with and without the desk props. Lint and production build passed; no production character settings were changed during checks.

## Male and female character choices

Character settings now start with illustrated Male and Female choices. They select a base face and starting hairstyle, while skin, hair, clothing, expression, glasses, facial hair, scene and motion remain independently editable. Re-selecting the current style preserves a customized hairstyle. Preview and Cancel leave the saved banner unchanged; Save persists the chosen style with the account's other character settings. The style is an illustration preference, separate from research demographic data.

The shared settings schema validates both styles through the existing account-owned API and JSON storage. Old saved settings default to the existing male illustration while retaining their customized features. No database migration or new assets are needed, and the removed floating movement remains absent.

Twelve isolated browser check groups passed, including persistence, legacy preferences, keyboard selection, reset/cancel, recoverable save failure, all hairstyles and clothing, independent valid SVG gradients, reduced motion and responsive controls at 320×568, 390×844, 844×390 and 1365×900. Desktop and mobile previews were visually reviewed. The real API integration suite passed 84 checks against its temporary database, including five new checks for style persistence, legacy compatibility, invalid input and account isolation. Lint and production build passed. Browser saves used fixture responses; no production character settings were changed. Physical phones were not tested.
