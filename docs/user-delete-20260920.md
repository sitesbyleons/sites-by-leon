# Permanent user deletion

Owner Users page now includes a Delete user button and a typed DELETE confirmation that identifies the selected account. Server authorization is enforced separately: trusted origin, signed-in platform admin, bounded JSON body, target-bound confirmation, no self-deletion, no other admin deletion, and no deletion of users present in workspace membership or client provisioning records. Lookup failures fail closed. The only destructive operation is Clerk account deletion; no site, upload, database record or billing operation is performed.

Deletion is permanent. This is not a client-offboarding or billing-cancellation feature. Do not link/provision an account while deleting that same account; Clerk deletion and PostgreSQL association checks are separate systems, not one distributed transaction.

## Demo-history correction

After demo memberships were detached, the original blanket provisioning-history guard still blocked a former demo owner. The corrected endpoint checks every historical workspace (bounded to 100, failing closed beyond that) against current site classification. Exclusively verified demo history no longer blocks deletion; active membership, admins/self, client history, missing connections, mixed history and failed lookups remain protected. ISHOTYOUU's legacy site key is explicitly excluded from demo eligibility. Historical records are retained, not deleted.

93 dashboard tests passed and Astro check returned zero errors/warnings. Release `user-delete-demo-fix-20260920` retains the preceding `user-delete-20260920` image for rollback, and replaces only the dashboard. Testing uses Clerk mocks; no real account deletion is performed.

Verification: 87 dashboard unit tests passed, including deletion provider mocks and authorization/protection failures; Astro check reported zero errors or warnings. No real account is deleted as part of testing or deployment.

Release uses `infra/user-delete/deploy.py` and a dashboard-only image `leon-design-prod:user-delete-20260920`, preserving the Operations mount, environment and all other containers. Previous image `leon-design-prod:operations-20260920` is retained; use the production base compose with `infra/user-delete/rollback.yml` under the maintenance lock for code-only rollback. No schema migration is required.
