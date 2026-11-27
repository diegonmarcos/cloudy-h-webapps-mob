#!/usr/bin/env bash
# Guards: shared nav is current; every c3-* page has parseable mock JSON and no GitHub token handling.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/gen-cloud-apps.mjs --check
node scripts/gen-nav.mjs --check
node scripts/test-embed.mjs
# (the c3-* web-only stub pages and their MOCK checks retired with the stub folders, #1320 M7: /cloudy-c3/ has its own tests)
# Service fallback pages: generated from the vendored build.json service data; one page per service, current, public-safe.
node scripts/gen-fallback.mjs --check
n=$(node -e 'console.log(require("./scripts/fallback-services.json").services.length)')
[ "$n" -gt 0 ] || { echo "FAIL no services in fallback-services.json"; exit 1; }
for slug in $(node -e 'for(const s of require("./scripts/fallback-services.json").services)console.log(s.slug)'); do
  [ -f "services/$slug/dist/index.html" ] && cmp -s "services/$slug/src/index.html" "services/$slug/dist/index.html" || { echo "FAIL service page $slug"; exit 1; }
  grep -q 'cwa-nav\|/cloud-webapps/nav.js' "services/$slug/dist/index.html" || { echo "FAIL $slug lacks the shared nav"; exit 1; }
  # no secrets or internal addresses
  if grep -Eq '([0-9]{1,3}\.){3}[0-9]{1,3}|fd0c:|ghp_|github_pat_|sk-[A-Za-z0-9]{10}|BEGIN [A-Z ]*PRIVATE|eyJ[A-Za-z0-9_-]{20}|AKIA[0-9A-Z]{12}' "services/$slug/dist/index.html"; then echo "FAIL $slug page carries a secret-like or address string"; exit 1; fi
  # the return URL is validated against the declared hosts (no open redirect)
  if grep -q 'data-rd' "services/$slug/dist/index.html"; then grep -q "H.indexOf(u.hostname)>=0" "services/$slug/dist/index.html" || { echo "FAIL $slug rd not validated"; exit 1; }; fi
done
echo "ok: $n service fallback pages"
# the index lists every service page
for slug in $(node -e 'for(const s of require("./scripts/fallback-services.json").services)console.log(s.slug)'); do
  grep -q "href=\"/cloud-webapps/$slug/\"" _shared/dist/index.html || { echo "FAIL index lacks service $slug"; exit 1; }
done
# redirects (#1320 M7): old pages land on their new page (deep), the /cloud/ portal on /cloudy-c3/, the stubs are written
rt=$(mktemp -d); node scripts/gen-redirects.mjs "$rt" >/dev/null
grep -q 'url=/cloud-webapps/cloud-calc/calculator/graph/"' "$rt/cloud-superapp/apps/calc/calculator/graph/index.html" || { echo "FAIL old calc page does not redirect to cloud-calc"; exit 1; }
grep -q 'url=/cloud-webapps/cloud-c3/infra/machines/"' "$rt/cloud-superapp/apps/c3/infra/machines/index.html" || { echo "FAIL old c3 page does not redirect to cloud-c3"; exit 1; }
grep -q 'url=/cloudy-c3/portal/products/"' "$rt/cloud/products.html" || { echo "FAIL /cloud/products.html does not redirect to cloudy-c3"; exit 1; }
grep -q 'url=/cloud-webapps/"' "$rt/cloud-mobile/index.html" || { echo "FAIL /cloud-mobile/ does not redirect"; exit 1; }
rm -rf "$rt"
echo "cloud-webapps tests green"
