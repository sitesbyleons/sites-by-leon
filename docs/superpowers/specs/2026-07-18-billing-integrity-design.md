# Billing Integrity Repair Design

**Status:** Approved through the owner's blanket authorization to fix the audited issues.

## Purpose

Make platform billing and Stripe Connect fail closed before production begins accepting live payments. This repair covers workspace authorization, unambiguous workspace selection, Billing Portal configuration, webhook ledger durability, live Stripe destination parity, and stable publication dates.

## Authorization And Workspace Selection

`resolveClientWorkspace` will return both the selected workspace and the caller's database-backed membership role. An active Clerk organization may select its matching workspace, but it does not grant access by itself: the caller must also have a `workspace_members` row for that workspace.

When no Clerk organization is active, exactly one membership may be selected automatically. Zero memberships returns no workspace. More than one membership returns an explicit ambiguous result instead of silently selecting the oldest membership.

Checkout and Billing Portal routes will permit only `owner` and `admin` roles. A `member` receives `403`; ambiguous selection receives `409`; database failures remain `503`. Content requests and dashboard reads remain available to all legitimate workspace members.

## Billing Portal And Checkout

The dashboard requires `STRIPE_BILLING_PORTAL_CONFIGURATION`. Portal sessions always pass that configuration ID explicitly. Deployment verification checks that the key, prices, Portal configuration, and webhook destination all belong to the same Stripe mode and are active.

There will be one active Portal configuration in the deployed test account and one in the live platform account. Both allow payment-method updates, invoice history, and cancellation at period end. Subscription plan changes remain disabled because the application does not yet reconcile proration or plan-switch workflows.

Production remains in test mode while repairs are tested. The final cutover securely installs the already-created live products and prices, Portal configuration, platform webhook secret, and Connect webhook secrets. No real charge is created automatically during verification.

## Webhook Durability

All three webhook routes will use one shared helper to mark an event `processed` or `failed`. The helper treats a query error or a missing ledger row as failure. A route may acknowledge an event only after its processed state is durably written.

If business processing fails, the route attempts to persist `failed` and returns `500`. If that persistence also fails, the response still returns `500` with a generic message and does not claim success. Duplicate-subscription cleanup and intentionally ignored events follow the same checked finalization path.

The live Connect snapshot destination must receive events from connected accounts (`@accounts`) and subscribe to `account.updated`, deauthorization, and all four supported invoice terminal events. The Accounts v2 destination must receive connected-account events and match the deployed test capability event set.

## Publication Dates

Creating a published post sets `published_at` once. Editing an already-published post preserves its original timestamp. Moving a draft to published sets the transition time, and moving a post back to draft clears the timestamp.

## Verification

- Unit tests prove role authorization, organization membership verification, ambiguous membership rejection, and publication timestamp transitions.
- Webhook tests prove that failed ledger writes never return a successful acknowledgement.
- Stripe configuration verification runs against deployed test mode and live mode without printing credentials.
- Test-mode checkout and Portal flows pass before live secrets are installed.
- Live configuration is verified by object mode, active state, endpoint URL, event origin, and event type; no live payment is submitted.

