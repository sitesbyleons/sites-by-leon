# ISHOTYOUU image route repair — 2026-10-01

The `www.ishotyouu.net` public site used `/work/*.jpg` for the Home hero, About
photo, and Work gallery. The production gateway image only routed those paths
to `ishotyouu-stills` for `ishotyouu.leonsites.org`, so the shared photographer
app returned its gallery 404 page for image requests. The stills were present
in `/srv/public/work/` inside the sidecar. The checked-in Caddyfile already
included both hostnames; its live image was stale.

The route-only gateway image `leon-design-prod:ishot-www-media-20261001` was
built from `leon-design-prod:ishot-apex-20260920` with
`Dockerfile.gateway-config-overlay` and the reviewed Caddyfile. Its production
compose override is stored at
`/opt/leon-platform/design-releases/ishot-apex-20260920/compose.yml`, with the
previous override preserved alongside it as
`compose.yml.before-ishot-www-media-20261001`.

After recreation, the gateway served both the Home and About photographs as
`200 image/jpeg`; Home, About, and Work returned `200 text/html`. Browser checks
confirmed the Home and About images and all 27 Work images loaded. No customer
records, uploads, or billing data changed.

Future gateway releases should include the current `infra/ovh/Caddyfile` and
verify an image URL on `www.ishotyouu.net` after the container is recreated.
