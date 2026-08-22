# HTTPS on preview only

Production `leonsites.org` is frozen. Do not enable Cloudflare Always Use HTTPS on the zone, and do not add a redirect for the apex.

`http://leonsites.org` currently returns 200 with no `Location`. `public/_headers` already sends `upgrade-insecure-requests` and HSTS on HTTPS responses; that does not 301 the first HTTP document request.

`test.leonsites.org` is the preview host (Caddy behind Cloudflare). Apply `ops/caddy/test.leonsites.org.Caddyfile` only on that host so `http://test.leonsites.org` 308s to HTTPS.

Leave apex HTTP as-is until Leon approves a specific production push.
