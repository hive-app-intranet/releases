# HIVE — production image.
#
# This Dockerfile expects to be built from inside a release folder
# (releases/hive-<version>/), not from the repo root — it already contains
# the compiled/obfuscated server + CLI + built UI, so there's no source to
# compile here, only runtime dependencies to install.
FROM node:20-alpine

WORKDIR /app

# tsup externalizes every package @hive/api declares as a real dependency
# (see apps/api/tsup.config.ts) — none of them get bundled into api.js/
# cli.js, so they all need to come from npm at runtime. package-lock.json
# (generated at build time — see scripts/build.mjs) pins exact versions;
# `npm ci` requires both files present, unlike `npm install`.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 4000

CMD ["node", "api.js"]
