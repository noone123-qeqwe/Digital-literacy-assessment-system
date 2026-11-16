# Dashboard character animation — 16 November 2026

The existing customizable SVG character now blinks, nods gently, types with alternating hands and has a softly pulsing laptop light. Plant leaves sway when the plant is enabled. These details accompany the existing Float and Breathe modes. Choosing None disables all character animation without changing the user's saved appearance.

The banner shows only Customize character; its separate pause icon was removed at the user's request. Pause/resume remains available in the editor's Motion settings. The dashboard character pauses while the editor is open. Animation also pauses outside the viewport or while the document is hidden, and all motion is disabled for the device's reduced-motion preference. Movement uses CSS transforms and opacity on existing SVG parts, with no additional image downloads, animation library or frame-by-frame JavaScript loop.

Frontend lint and production build pass. Fourteen isolated browser checks cover actual animation transforms, pause/resume and keyboard use, offscreen and document visibility suspension, preview behavior, existing hairstyles/expressions/clothing, saving and reloading None, five phone/tablet/landscape sizes from 320×568 to 844×390, desktop rendering at 1365×900, reduced motion and browser exceptions. API responses and saves were fixtures; no production character settings were changed. Desktop and phone screenshots were visually inspected. These checks use Chrome emulation rather than physical-device performance measurements.

After removing the banner's pause icon, focused checks passed at 320×700, 390×844, 768×1024 and 1365×900: only Customize character remains in the banner, character motion continues while visible, editor pause/resume still works, reduced motion is respected and no browser exceptions occur. Lint and build passed again.

## Illustration refinement

The character has a wider, softer face, more natural eyes and smile, curved hairstyles with strand detail, and subtle shading derived from the selected colors. Clothing now includes collar stitching, sleeve trim, fabric depth and a small book emblem. The desk scene has a thinner laptop, ceramic planter, detailed book pages, a bookmark and softer ground shadows. The optional backdrop adds a faint clock and small decorative accents.

All seven hairstyles, three clothing styles, three expressions, glasses, facial hair, skin colors, scene toggles and existing animation modes remain supported. Gradients use a unique ID per illustration, keeping preview colors independent from the saved dashboard character. No raster assets or animation libraries were added, and the banner pause icon remains removed.

Eight additional isolated browser checks passed for valid independent gradient references, appearance options, six skin tones and preview isolation, complete scene toggles, finite SVG paths, save/reload behavior, reduced motion and browser/SVG errors. A seven-character variation sheet and desktop/mobile views were visually inspected. The four-size banner checks passed again, including motion and editor controls. These checks use fixture responses and did not change production appearance settings. Frontend lint and build passed.
