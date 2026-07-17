# Plain-Language Copy Design

## Goal

Make every user-facing Sites By Leon surface sound clear, direct, and human. Remove slogans, filler, exaggerated claims, and wording that reads like generated marketing copy. Keep the existing visual design, page structure, features, prices, and product meaning.

## Scope

The copy pass covers:

- `leonsites.org`, including the coming-soon page, legal pages, authentication, and client dashboard
- `test.leonsites.org`, including its marketing page and three website concepts
- `demo.leonsites.org`, including the Northline public site and photographer studio
- Page titles, metadata, headings, supporting text, calls to action, empty states, helper text, and status messages visible to users

Internal code names, test descriptions, API contracts, database values, and infrastructure documentation are out of scope unless they appear in the interface.

## Writing Rules

1. Say what the page, service, or action does.
2. Prefer short sentences and common words.
3. Use specific nouns and verbs instead of broad claims.
4. Remove slogans, rhetorical questions, and repeated promises.
5. Avoid phrases such as "handled," "without the guesswork," "impossible to miss," "show off," "calm place," and "launch without the headache."
6. Keep button labels action-oriented and predictable.
7. Preserve legal meaning, prices, service limits, and operational status details.
8. Keep concept-site copy appropriate to each fictional photographer while making it restrained and believable.
9. Do not change layout, styling, animation, or application behavior for the copy pass.

## Content Direction

### Sites By Leon Marketing

Lead with the literal offer: websites and hosting for photographers. State the included work directly: portfolio pages, contact forms, payment setup, hosting, updates, and support. Pricing and plan differences remain unchanged. Contact language should invite a project discussion without making a grand claim.

### Website Concepts

Keep each concept distinct, but replace editorial slogans with straightforward studio language. Wedding copy should focus on dates and coverage, portrait copy on sessions and booking, and commercial copy on projects and briefs.

### Client Dashboard

Describe the dashboard as the place to view progress, request changes, and manage billing. Onboarding, support, and billing messages should tell the client what is ready and what happens next.

### Northline Public Site

Retain its already concise sports-photography language. Simplify any remaining promotional or vague phrases and keep package descriptions factual.

### Photographer Studio

Keep navigation and controls task-based. Supporting descriptions should explain what can be changed on the current screen, with no promotional language.

## Verification

- Scan user-facing source files for the rejected phrases and common generated-copy patterns.
- Run type checks, unit tests, and production builds for the marketing, dashboard, and photographer applications.
- Run browser suites for all three applications.
- Inspect representative desktop and mobile pages for overflow or awkward wrapping caused by the new copy.
- Confirm no layout, animation, or functional code changed beyond what is required for text assertions.

## Release

Commit the verified copy changes to `main`, push the branch to GitHub, update the checked-out release on the OVH VPS, run `infra/ovh/scripts/deploy.sh`, and complete the production health check. Confirm `leonsites.org`, `test.leonsites.org`, and `demo.leonsites.org` serve the new wording over HTTPS.
