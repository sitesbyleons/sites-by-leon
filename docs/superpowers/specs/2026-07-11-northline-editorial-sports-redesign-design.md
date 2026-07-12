# Northline Editorial Sports Portfolio Redesign

## Purpose

Northline Sports is a production-style portfolio for a fictional sports photographer. Its public site must make the photographs feel valuable, help teams and athletes understand the available coverage, and provide one clear contact path. It must not look like the Sites by Leon marketing site or expose prototype language to visitors.

This redesign fixes the current title collisions, off-center headers, oversized display type, equal-card layouts, and visible references to a demo. It uses Lindsey Wernli's portfolio as a reference for calm image pacing, restrained navigation, and generous white space without copying its exact grid, typography, imagery, or interaction design.

## Design Read

This is a full visual overhaul of a sports-photography portfolio for teams, athletes, and schools. The visual language is editorial, image-first, calm, and contemporary. It uses native Astro, CSS, and the existing GSAP motion layer.

- Design variance: 7
- Motion intensity: 6
- Visual density: 3
- Theme: light throughout
- Shape system: square images and controls with no decorative rounding

## Visual System

### Color

- Paper: `#f7f7f3`
- Ink: `#171918`
- Muted ink: `#6f736f`
- Rule: `#d8dad5`
- Northline red: `#b63a32`

Red is the only accent and appears only in focused states, active links, and small functional details. The site does not alternate between light and dark sections.

### Typography

- Display and studio name: Newsreader, used sparingly for the Northline name and selected editorial headings.
- Body and navigation: Manrope, retained for clean, readable interface text.
- Utility labels: IBM Plex Mono for dates, prices, and short metadata.

Headings use natural casing rather than all-uppercase condensed display text. No heading exceeds two lines on desktop. Page titles are centered in one content column, so descriptions cannot collide with the title.

### Signature

The memorable element is an editorial sports contact sheet: large photographs in an asymmetric two-column rhythm, with alternating landscape and portrait proportions. Images reveal gently as they enter the viewport and move at slightly different vertical speeds. The effect supports the act of reviewing a photographer's work instead of imitating sports-broadcast graphics.

## Information Architecture

Existing public routes and primary navigation remain stable:

- `/` - selected work and contact entry point
- `/work` - all galleries
- `/work/[slug]` - one sports gallery
- `/packages` - coverage options
- `/contact` - direct contact
- `/journal` and `/journal/[slug]` - short photography notes
- `/invoice/[token]` - unavailable payment-link state until payments are connected

The primary navigation remains Work, Services, and Contact. The protected photographer studio at `/studio` is a separate future implementation and is not added as part of this visual redesign.

## Page Designs

### Header

The header is 72 pixels tall on desktop and remains on one line. Northline Sports appears as a simple typographic wordmark on the left. Work, Services, and Contact sit on the right. The current red square monogram and broadcast-style treatment are removed. On mobile, the wordmark and the three short links remain visible without a menu.

### Homepage

The homepage opens with the portfolio rather than a giant slogan.

1. A compact introduction names Northline Sports and states `Sports photography for teams and athletes.`
2. Two large photographs create the first viewport: one landscape and one portrait.
3. The remaining selected work continues in an asymmetric editorial grid.
4. Gallery names and sport categories appear below images, never overlaid on them.
5. A compact services list shows Game coverage, Season coverage, and Athlete sessions.
6. The final section shows the email address and a single Contact link.

The homepage contains no numbered badges, scorebug, scroll cue, marquee, decorative statistics, or giant all-caps statement.

### Work Archive

The page title and one-sentence description are centered above the gallery grid. Galleries use varied but balanced image proportions. Each gallery card contains one image, its gallery title, and its sport category. The layout becomes one column on mobile.

### Gallery Pages

The gallery title, category, and description are vertically stacked and centered above the photographs. The description has a fixed readable measure. Photographs alternate between full-width landscapes and offset portrait pairs on desktop, then become a single column on mobile. No gallery title can share a grid track with descriptive copy, which removes the existing collision at its source.

### Services

Coverage options are not rendered as three equal boxes. They form a vertical editorial list with the service name on the left, starting price on the right, and one short description below. Features are reduced to the information needed to compare services. Every row uses the same `Ask about coverage` action and links to Contact. No public checkout is offered.

### Contact

The disabled prototype form is removed. The page shows one centered heading, a short instruction, the public email address, and a `Send email` link. This is honest and functional without claiming that an unconnected form can submit. The page contains no reference to a demo, fictional studio, or unavailable submission mechanism.

### Journal

Photography notes use the same editorial image rhythm and smaller typography. Article pages keep one image, one short paragraph, and a related gallery link. Labels remain plain and functional.

### Footer

The footer contains Northline Sports, the email address, and the public navigation. The visible `Fictional portfolio demo for Sites by Leon` notice is removed.

### Invoice State

The invoice route remains non-transactional until Stripe Connect is configured. It uses the plain message `This payment link is unavailable.` and a Contact link. It does not mention a demo or expose token values.

## Motion

Motion remains enabled without a user-facing toggle.

- Header and introductory copy fade into place on load.
- Images reveal with opacity and a small vertical translation as they enter the viewport.
- Selected images receive restrained scroll-linked vertical movement.
- Gallery links use a subtle image scale on hover and keyboard focus.
- The existing long horizontal scroll section is removed because it competes with the calm portfolio reference.

All animations use transforms and opacity. GSAP contexts are cleaned up during navigation. Motion must never move text into another content track or create horizontal overflow.

## Responsive Rules

- Desktop content width is capped at 1600 pixels with fluid side gutters.
- Two-column image layouts collapse to one column below 768 pixels.
- Header typography and links fit at 320 pixels without horizontal scrolling.
- Headings use `clamp()` with a maximum width and natural word wrapping.
- Images reserve their aspect ratio to prevent layout shift.
- Form controls are removed from Contact, eliminating the current oversized empty form on mobile.

## Content Rules

- No visible use of `demo`, `fictional`, `concept`, `sample`, or prototype labels.
- No slogans, sports metaphors, decorative captions, or invented statistics.
- No text overlays on photographs.
- Public body-copy paragraphs contain no more than 25 words.
- Calls to action use consistent labels: Work, Services, Contact, Ask about coverage, and Send email.

Internal fixture and repository names may retain `demo` because they are not public content and renaming them adds risk without changing the visitor experience.

## Accessibility and Quality

- Preserve semantic headings, landmarks, alternative text, skip link, keyboard focus, and sufficient contrast.
- Test desktop at 1440 by 1000 and mobile at 390 by 844.
- Add regression coverage proving titles and descriptions do not overlap.
- Verify every public route has no horizontal overflow.
- Verify no visible page text contains banned prototype language.
- Verify the site still builds for Vercel and the private GitHub repository remains the deployment source.

## Administration Boundary

The existing Sites by Leon dashboard remains separate at `sites-by-leon-dashboard.vercel.app`:

- `/sign-in` - Clerk sign-in
- `/dashboard` - client account area
- `/admin` - Leon-only control area

The planned Northline photographer editor at `/studio` is not implemented by this redesign. Building it requires a separate authenticated content-management plan covering Clerk, Supabase storage, galleries, posts, homepage text, invoices, deposits, and workspace authorization.
