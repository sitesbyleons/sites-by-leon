FROM leon-design-prod:dashboard-20260920
COPY patch.mjs transform.mjs SignInScene.html /tmp/signin-design/
USER root
RUN node /tmp/signin-design/patch.mjs
COPY --chown=node:node assets/ /workspace/dashboard/dist/client/admin-assets/
USER node
