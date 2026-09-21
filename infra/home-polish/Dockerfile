FROM leon-design-prod:demo-links-20260920
RUN echo '969f7bef0e4e353c1dbcabb319ed21614e98e5e8e5d58ef124194c93e73e54e4  /srv/marketing/index.html' | sha256sum -c -
COPY marketing/index.html /srv/marketing/index.html
COPY marketing/_astro/ /srv/marketing/_astro/
COPY marketing/fonts/barlow-condensed-latin.woff2 /srv/marketing/fonts/barlow-condensed-latin.woff2
