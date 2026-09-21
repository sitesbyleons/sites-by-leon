FROM leon-design-prod:signin-20260920
COPY patch.mjs /tmp/admin-width-patch.mjs
USER root
RUN node /tmp/admin-width-patch.mjs
COPY --chown=node:node admin-workspace-v5.css /workspace/dashboard/dist/client/admin-assets/admin-workspace-v5.css
USER node
