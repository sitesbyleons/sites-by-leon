# OVH production cutover

## Before DNS changes

- [ ] All four containers are healthy on the OVH VPS.
- [ ] Imported table counts match the managed export.
- [ ] Coming Soon is centered at desktop and iPhone widths.
- [ ] `test.leonsites.org` shows the full marketing site.
- [ ] Clerk sign-in, sign-up, admin authorization, and personal accounts work.
- [ ] Gallery, image, post, service, client, invoice, and inquiry actions work.
- [ ] Stripe test checkout, portal, Connect onboarding, invoice links, and both webhooks work.
- [ ] A PostgreSQL plus upload-directory backup restores successfully.
- [ ] Existing Namecheap DNS is exported, including all Zoho MX/TXT records.

## Cutover

1. Record current database row counts and DNS records.
2. Take a final managed export and import it into the OVH PostgreSQL container.
3. Compare row counts and run the health check.
4. Create the Cloudflare Tunnel and its four public hostname routes.
5. Preserve the Zoho mail records when the zone is created.
6. Add the new Stripe webhook destinations while leaving old destinations active.
7. Change Namecheap nameservers to the assigned Cloudflare nameservers.
8. Verify desktop and iPhone layouts, auth, writes, uploads, and payments.
9. Monitor Caddy, application, Tunnel, PostgreSQL, and Stripe logs.

## Rollback

If authentication, writes, images, or payment webhooks fail, restore the exported Namecheap DNS records to their Vercel targets, re-enable the old webhook endpoints, and keep the OVH apps read-only until any OVH-only writes are reconciled.

Keep Vercel and the managed database intact for at least seven days after successful cutover.
