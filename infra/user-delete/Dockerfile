FROM leon-design-prod:operations-20260920 AS build
USER root
COPY dashboard/src/ /workspace/dashboard/src/
COPY dashboard/public/ /workspace/dashboard/public/
COPY dashboard/astro.config.mjs dashboard/tsconfig.json /workspace/dashboard/
COPY platform-core/src/ /workspace/platform-core/src/
ARG PUBLIC_CLERK_PUBLISHABLE_KEY
ENV PUBLIC_CLERK_PUBLISHABLE_KEY=$PUBLIC_CLERK_PUBLISHABLE_KEY
WORKDIR /workspace/dashboard
RUN node node_modules/astro/bin/astro.mjs build
FROM leon-design-prod:operations-20260920
COPY --from=build --chown=node:node /workspace/dashboard/dist/ /workspace/dashboard/dist/
USER node
