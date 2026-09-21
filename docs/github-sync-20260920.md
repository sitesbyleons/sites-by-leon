# Source synchronization — 2026-09-20

This update preserves the local marketing redesign, dashboard and studio UI,
opt-in visitor statistics, owner Operations panel, demo-membership isolation
migration, and protected account deletion changes in GitHub.

## Source ownership

The shared `photographer-site` application contains the Northline and Vow & Light
layouts and the ISHOTYOUU studio integration. The separate site repositories are
not interchangeable with this workspace: do not replace their histories or copy
this application into them without reconciling dependencies and deployment paths.

## Release boundary

This is a source synchronization, not a production deployment. Production has
historically used image overlays and release-specific compose overrides. Review
those overrides and current runtime source before performing a clean rebuild.
No client records, uploaded media, secrets, database dumps, or private operational
reports are included in this update.

## Local verification

- Dashboard unit tests: 93 passed.
- Photographer-site unit tests: 167 passed.
- Root tests: 204 passed, 22 skipped, 22 failed. The failing shell-helper tests
  require Bash, which is not available on the Windows test PATH. These results
  are not a clean CI pass; Linux CI remains required before merging.

Local design-tool context, private operational notes, and the one-off membership
repair script containing production record identifiers remain outside this commit.
