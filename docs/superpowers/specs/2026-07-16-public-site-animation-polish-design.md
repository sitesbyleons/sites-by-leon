# Public Site Animation Polish

## Objective

Improve the feel, responsiveness, and performance of motion across the three
public Sites By Leon domains without redesigning any surface.

- `leonsites.org`: the standalone coming-soon experience.
- `test.leonsites.org`: the full marketing site and its three embedded concept
  previews.
- `demo.leonsites.org`: the public Northline Sports photographer site.

The work must preserve the current layout, copy, imagery, typography, colors,
component structure, and overall visual identity. Dashboard, admin, billing,
infrastructure, and deployment behavior are outside this project.

## Motion Language

Use a compact shared vocabulary across both public applications:

- Entrances use `opacity` and a small `transform` with the strong ease-out
  curve `cubic-bezier(0.23, 1, 0.32, 1)`.
- Movement already on screen uses the ease-in-out curve
  `cubic-bezier(0.77, 0, 0.175, 1)`.
- Press feedback uses `transform: scale(0.97)` for `160ms` with the strong
  ease-out curve.
- Small interface transitions stay between `160ms` and `240ms`.
- Marketing explanation may use longer scroll-driven motion, but it must be
  tied directly to scroll progress and remain interruptible.
- Group entrances use a `55ms` to `80ms` stagger and never delay interaction.
- Hover-only movement is gated behind
  `@media (hover: hover) and (pointer: fine)`.
- Repeated navigation and frequently used controls receive only immediate,
  subtle feedback.

The implementation should centralize these values as CSS custom properties in
the existing global style files instead of adding a dependency or parallel
token system.

## `leonsites.org`

Keep the current full-screen photo bento, scrim, logo, `Coming soon.` headline,
and email link exactly as designed.

Add one first-view orchestration:

1. The three image tiles settle from `opacity: 0` and `scale(1.025)` to their
   existing state with a short stagger.
2. The scrim crossfades in as the images settle so the headline remains
   readable throughout.
3. The brand mark, headline, and email enter in that order with small vertical
   offsets and strong ease-out timing.
4. No continuous loop, mouse tracking, carousel, or decorative cursor effect
   is added.

The page must be completely usable before JavaScript and must never flash
hidden content if scripts fail.

## `test.leonsites.org`

Preserve the existing hero, three concept browser frames, pricing, services,
and contact sections.

Polish the current motion rather than replacing it:

- Coordinate the hero copy and image entrance into one short sequence.
- Keep the scroll-driven hero depth and concept-browser 3D settling because
  they explain the showcase, while tightening their range and avoiding
  permanent `will-change` layers.
- Make section reveals one-time, interruptible entrances instead of replaying
  decorative motion during normal reading.
- Keep the concept progress bars tied directly to scroll.
- Add restrained press feedback to primary calls to action.
- Gate image hover zooms to fine pointers and keep them below the normal UI
  timing budget.
- Keep pricing readable immediately; its entrance may stagger but must not
  rotate or delay the information the visitor is trying to compare.
- Preserve the mobile pricing carousel layout and scroll snapping. Motion work
  must not change card dimensions or introduce an automatic carousel.

## `demo.leonsites.org`

Preserve the existing editorial hero, Selected Work reel, gallery layouts,
image drift, spring tilt, and photographer-specific theme controls.

Improve the implementation and restraint:

- Keep the initial editorial entrance but do not replay page-level entrances
  every time an element re-enters the viewport.
- Keep scroll-linked image drift and heading movement, using compositor-safe
  full transform strings rather than Motion shorthand properties.
- Keep the subtle pointer tilt for fine pointers only. Touch devices and
  reduced-motion mode must not initialize the effect.
- Replace paint-heavy or long hover treatments with short transform/opacity
  feedback where the same visual intent can be preserved.
- Keep the Selected Work reel usable before React hydration and preserve its
  current DOM content, links, image crops, and responsive grid.
- Add subtle press feedback to public calls to action without animating the
  sticky navigation itself.

## Reduced Motion

The design source requires reduced-motion support. When
`prefers-reduced-motion: reduce` is active:

- Remove parallax, 3D rotation, image drift, pointer tilt, and large position
  changes.
- Keep brief `200ms` opacity or color transitions that explain state.
- Use normal browser scrolling instead of smooth scrolling.
- Keep every piece of content visible and every interaction immediate.

Existing tests that require full 3D motion in reduced-motion mode must be
updated to assert this approved behavior.

## Performance And Accessibility

- Prefer `transform` and `opacity`; do not animate layout dimensions,
  positioning offsets, margins, or padding.
- Do not introduce `transition: all`.
- Do not add autoplaying media, sound, or motion controls.
- Preserve focus indicators, keyboard access, semantic structure, and current
  contrast.
- Motion must not cause horizontal overflow at `390px`, `768px`, or `1440px`.
- Public content and navigation remain visible when JavaScript is disabled or
  hydration fails.

## Verification

Run the existing Astro checks, unit tests, builds, and Playwright suites for
the marketing and photographer applications. Add focused assertions for:

- the coming-soon entrance hooks and reduced-motion fallback;
- compositor-safe transforms and one-time reveals on the marketing site;
- reduced-motion behavior for both applications;
- the Selected Work reel remaining present before hydration;
- no mobile or desktop overflow and no serious accessibility violations.

Perform desktop and mobile feel checks at normal speed and in slow motion.
Confirm that the three domains retain their current visual design before any
deployment is considered.
