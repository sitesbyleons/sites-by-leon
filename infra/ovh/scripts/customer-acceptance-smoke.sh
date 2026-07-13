#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Run a destructive-but-self-cleaning acceptance test against one photographer tenant.

Required environment variables:
  TENANT_ORIGIN       Exact HTTPS editor origin, without a trailing slash.
  TEST_IMAGE          Local JPG, PNG, WebP, or AVIF image smaller than 15 MB.

Set exactly one authentication file:
  CLERK_COOKIE_JAR       Private Netscape cookie jar for an active owner session.
  CLERK_AUTH_HEADER_FILE Private file containing one Authorization: Bearer <JWT> line.

Optional environment variables:
  CURL_CONNECT_TIMEOUT_SECONDS  Connection timeout (default: 5).
  CURL_MAX_TIME_SECONDS         Request timeout (default: 30).

The target studio must not have Stripe payments enabled. The script creates, reads,
updates, and deletes temporary gallery, post, service, client, and draft-invoice
records. It also uploads optimized covers and verifies that invoice sending is
blocked while Stripe is disconnected. Authentication values are never printed.
EOF
}

if [[ ${1:-} == --help || ${1:-} == -h ]]; then
  usage
  exit 0
fi
if [[ $# -ne 0 ]]; then
  usage >&2
  exit 2
fi

fail() {
  echo "Customer acceptance smoke test: $*" >&2
  exit 1
}

: "${TENANT_ORIGIN:?Set TENANT_ORIGIN to the exact HTTPS tenant editor origin.}"
: "${TEST_IMAGE:?Set TEST_IMAGE to a local acceptance-test image.}"
CLERK_COOKIE_JAR=${CLERK_COOKIE_JAR:-}
CLERK_AUTH_HEADER_FILE=${CLERK_AUTH_HEADER_FILE:-}
if [[ -n ${CLERK_COOKIE_JAR} && -n ${CLERK_AUTH_HEADER_FILE} ]]; then
  fail 'Set either CLERK_COOKIE_JAR or CLERK_AUTH_HEADER_FILE, never both.'
fi
if [[ -z ${CLERK_COOKIE_JAR} && -z ${CLERK_AUTH_HEADER_FILE} ]]; then
  fail 'Set CLERK_COOKIE_JAR or CLERK_AUTH_HEADER_FILE for an active owner session.'
fi

CURL_CONNECT_TIMEOUT_SECONDS=${CURL_CONNECT_TIMEOUT_SECONDS:-5}
CURL_MAX_TIME_SECONDS=${CURL_MAX_TIME_SECONDS:-30}
for positive_number in CURL_CONNECT_TIMEOUT_SECONDS CURL_MAX_TIME_SECONDS; do
  if [[ ! ${!positive_number} =~ ^[1-9][0-9]*$ ]]; then
    fail "${positive_number} must be a positive whole number."
  fi
done

if [[ ! ${TENANT_ORIGIN} =~ ^https://([^/:?#]+)$ ]]; then
  fail 'TENANT_ORIGIN must be one exact HTTPS origin with no port, path, query, fragment, or trailing slash.'
fi
tenant_host=${BASH_REMATCH[1]}
if [[ ${#tenant_host} -gt 253 || ${tenant_host} != "${tenant_host,,}" || ${tenant_host} != *.* ]]; then
  fail 'TENANT_ORIGIN must contain a lowercase production hostname.'
fi
IFS='.' read -r -a tenant_labels <<<"${tenant_host}"
for label in "${tenant_labels[@]}"; do
  if [[ ${#label} -lt 1 || ${#label} -gt 63 || ! ${label} =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]]; then
    fail 'TENANT_ORIGIN contains an invalid hostname label.'
  fi
done

require_private_auth_file() {
  local path=$1
  local label=$2
  if [[ ! -f ${path} || -L ${path} ]]; then
    fail "${label} must be a regular, non-symlink file."
  fi
  local owner mode
  owner=$(stat -c '%u' "${path}")
  mode=$(stat -c '%a' "${path}")
  if [[ ${owner} != "$(id -u)" || $((8#${mode} & 077)) -ne 0 ]]; then
    fail "${label} must belong to the current user and have no group or other permissions (chmod 600)."
  fi
}

auth_options=()
if [[ -n ${CLERK_COOKIE_JAR} ]]; then
  require_private_auth_file "${CLERK_COOKIE_JAR}" CLERK_COOKIE_JAR
  if ! grep -q $'\t__session\t' "${CLERK_COOKIE_JAR}"; then
    fail 'CLERK_COOKIE_JAR does not contain an active Clerk __session cookie.'
  fi
  auth_options+=(--cookie "${CLERK_COOKIE_JAR}")
else
  require_private_auth_file "${CLERK_AUTH_HEADER_FILE}" CLERK_AUTH_HEADER_FILE
  header_lines=$(awk 'END { print NR }' "${CLERK_AUTH_HEADER_FILE}")
  if [[ ${header_lines} != 1 ]] \
    || ! LC_ALL=C grep -Eq '^Authorization: Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' "${CLERK_AUTH_HEADER_FILE}"; then
    fail 'CLERK_AUTH_HEADER_FILE must contain exactly one Authorization: Bearer <JWT> header.'
  fi
  auth_options+=(--header "@${CLERK_AUTH_HEADER_FILE}")
fi

if [[ ! -f ${TEST_IMAGE} || -L ${TEST_IMAGE} ]]; then
  fail 'TEST_IMAGE must be a regular, non-symlink file.'
fi
image_bytes=$(stat -c '%s' "${TEST_IMAGE}")
if [[ ! ${image_bytes} =~ ^[0-9]+$ ]] || (( image_bytes < 1 || image_bytes > 15728640 )); then
  fail 'TEST_IMAGE must be between 1 byte and 15 MB.'
fi

temporary_root=$(mktemp -d)
chmod 700 "${temporary_root}"

gallery_id=
post_id=
service_id=
client_id=
invoice_id=
gallery_upload_path=
post_upload_path=
gallery_title=
post_title=
service_name=
client_name=
invoice_description=
cleanup_failed=0
HTTP_STATUS=

curl_options=(
  --silent
  --show-error
  --connect-timeout "${CURL_CONNECT_TIMEOUT_SECONDS}"
  --max-time "${CURL_MAX_TIME_SECONDS}"
  --proto '=https'
  "${auth_options[@]}"
  --header "Origin: ${TENANT_ORIGIN}"
  --header "Referer: ${TENANT_ORIGIN}/admin"
)

http_request() {
  local method=$1
  local path=$2
  local output=$3
  shift 3
  if ! HTTP_STATUS=$(curl "${curl_options[@]}" \
    --request "${method}" \
    --output "${output}" \
    --write-out '%{http_code}' \
    "$@" \
    "${TENANT_ORIGIN}${path}"); then
    return 1
  fi
  [[ ${HTTP_STATUS} =~ ^[0-9]{3}$ ]]
}

json_request() {
  local method=$1
  local path=$2
  local payload=$3
  local output=$4
  http_request "${method}" "${path}" "${output}" \
    --header 'Content-Type: application/json' \
    --data-binary "${payload}"
}

public_error() {
  local response=$1
  jq -r 'if type == "object" and (.message | type) == "string" then .message[0:300] else "No public error message." end' \
    "${response}" 2>/dev/null || printf '%s\n' 'No public error message.'
}

expect_status() {
  local expected=$1
  local response=$2
  local action=$3
  if [[ ${HTTP_STATUS} != "${expected}" ]]; then
    fail "${action} returned HTTP ${HTTP_STATUS}; $(public_error "${response}")"
  fi
}

require_json_id() {
  local response=$1
  local action=$2
  local identifier
  identifier=$(jq -er '.id | select(type == "string")' "${response}") \
    || fail "${action} did not return a resource id."
  if [[ ! ${identifier} =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]]; then
    fail "${action} returned an invalid resource id."
  fi
  printf '%s\n' "${identifier}"
}

delete_resource() {
  local resource=$1
  local identifier=$2
  local response="${temporary_root}/cleanup-${resource}.json"
  local payload
  payload=$(jq -cn --arg id "${identifier}" '{id: $id}')
  if ! json_request DELETE "/api/admin/${resource}" "${payload}" "${response}"; then
    echo "Cleanup could not reach the ${resource} endpoint for temporary item ${identifier}." >&2
    cleanup_failed=1
    return
  fi
  if [[ ${HTTP_STATUS} != 200 && ${HTTP_STATUS} != 404 ]]; then
    echo "Cleanup could not delete temporary ${resource} item ${identifier}: $(public_error "${response}")" >&2
    cleanup_failed=1
  fi
}

delete_upload() {
  local managed_path=$1
  local label=$2
  local response="${temporary_root}/cleanup-upload-${label}.json"
  local payload
  payload=$(jq -cn --arg path "${managed_path}" '{path: $path}')
  if ! json_request DELETE '/api/admin/upload' "${payload}" "${response}"; then
    echo "Cleanup could not reach the upload endpoint for the temporary ${label} cover." >&2
    cleanup_failed=1
    return
  fi
  if [[ ${HTTP_STATUS} != 200 ]] || ! jq -e '.ok == true and .retained != true' "${response}" >/dev/null 2>&1; then
    echo "Cleanup could not release the temporary ${label} cover." >&2
    cleanup_failed=1
  fi
}

admin_page_contains() {
  local path=$1
  local marker=$2
  local output=$3
  if ! http_request GET "${path}" "${output}"; then
    fail "${path} could not be loaded."
  fi
  expect_status 200 "${output}" "Loading ${path}"
  grep -Fq -- "${marker}" "${output}" || fail "${path} did not show the saved acceptance-test value."
}

admin_page_omits() {
  local path=$1
  local marker=$2
  local output=$3
  if ! http_request GET "${path}" "${output}" || [[ ${HTTP_STATUS} != 200 ]]; then
    echo "Cleanup could not verify ${path}." >&2
    cleanup_failed=1
    return
  fi
  if grep -Fq -- "${marker}" "${output}"; then
    echo "Cleanup verification still found temporary content on ${path}." >&2
    cleanup_failed=1
  fi
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e

  if [[ -n ${invoice_id} ]]; then delete_resource invoices "${invoice_id}"; fi
  if [[ -n ${client_id} ]]; then delete_resource clients "${client_id}"; fi
  if [[ -n ${service_id} ]]; then delete_resource services "${service_id}"; fi
  if [[ -n ${post_id} ]]; then delete_resource posts "${post_id}"; fi
  if [[ -n ${gallery_id} ]]; then delete_resource galleries "${gallery_id}"; fi

  if [[ -n ${post_upload_path} ]]; then delete_upload "${post_upload_path}" post; fi
  if [[ -n ${gallery_upload_path} ]]; then delete_upload "${gallery_upload_path}" gallery; fi

  if [[ -n ${gallery_title} ]]; then admin_page_omits '/admin/galleries' "${gallery_title}" "${temporary_root}/verify-gallery-deleted.html"; fi
  if [[ -n ${post_title} ]]; then admin_page_omits '/admin/posts' "${post_title}" "${temporary_root}/verify-post-deleted.html"; fi
  if [[ -n ${service_name} ]]; then admin_page_omits '/admin/services' "${service_name}" "${temporary_root}/verify-service-deleted.html"; fi
  if [[ -n ${client_name} ]]; then admin_page_omits '/admin/clients' "${client_name}" "${temporary_root}/verify-client-deleted.html"; fi
  if [[ -n ${invoice_description} ]]; then admin_page_omits '/admin/invoices' "${invoice_description}" "${temporary_root}/verify-invoice-deleted.html"; fi

  rm -rf -- "${temporary_root}"
  if [[ ${cleanup_failed} -ne 0 ]]; then status=1; fi
  if [[ ${status} -eq 0 ]]; then
    echo "Production customer acceptance smoke test passed for ${tenant_host}; all temporary resources were removed."
  fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

health_response="${temporary_root}/health.json"
http_request GET '/api/health' "${health_response}" || fail 'The tenant health endpoint could not be reached.'
expect_status 200 "${health_response}" 'Tenant health check'
jq -e '.ok == true and .service == "leon-photographer-runtime"' "${health_response}" >/dev/null \
  || fail 'The supplied origin is not a healthy photographer tenant.'

admin_response="${temporary_root}/admin.html"
http_request GET '/admin' "${admin_response}" || fail 'The tenant editor could not be reached.'
expect_status 200 "${admin_response}" 'Owner-session check'
grep -Fq 'class="studio-shell"' "${admin_response}" \
  || fail 'The cookie jar does not contain an active owner session for this exact tenant.'

connect_payload='{"action":"status"}'
connect_response="${temporary_root}/connect-status.json"
json_request POST '/api/connect' "${connect_payload}" "${connect_response}" \
  || fail 'Stripe connection status could not be checked safely.'
expect_status 200 "${connect_response}" 'Stripe connection preflight'
jq -e '.charges_enabled == false and .payouts_enabled == false' "${connect_response}" >/dev/null \
  || fail 'Stripe is enabled for this studio; refusing to run a disconnected-payment smoke test.'

run_uuid=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || true)
if [[ ! ${run_uuid} =~ ^[0-9a-f-]{36}$ ]]; then
  run_uuid="$(date -u +%s)-${RANDOM}-${RANDOM}"
fi
short_id=${run_uuid//-/}
short_id=${short_id:0:12}
slug="sbl-smoke-${short_id}"
gallery_title="SBL smoke gallery ${short_id} updated"
post_title="SBL smoke post ${short_id} updated"
service_name="SBL smoke service ${short_id} updated"
client_name="SBL smoke client ${short_id} updated"
invoice_description="SBL smoke invoice ${short_id} updated"

gallery_upload_response="${temporary_root}/gallery-upload.json"
http_request POST '/api/admin/upload' "${gallery_upload_response}" \
  --form "file=@${TEST_IMAGE}" \
  --form-string 'kind=galleries' \
  || fail 'The gallery cover upload failed.'
expect_status 201 "${gallery_upload_response}" 'Gallery cover upload'
gallery_upload_path=$(jq -er '.path | select(type == "string")' "${gallery_upload_response}") \
  || fail 'Gallery cover upload did not return a managed path.'
gallery_upload_url=$(jq -er '.publicUrl | select(type == "string" and startswith("https://"))' "${gallery_upload_response}") \
  || fail 'Gallery cover upload did not return a secure public URL.'

gallery_create=$(jq -cn \
  --arg title "SBL smoke gallery ${short_id}" \
  --arg slug "${slug}-gallery" \
  --arg cover "${gallery_upload_url}" \
  --arg path "${gallery_upload_path}" \
  '{title:$title,slug:$slug,category:"Acceptance test",description:"Temporary production acceptance record.",cover_image_url:$cover,cover_storage_path:$path,status:"draft"}')
gallery_response="${temporary_root}/gallery-create.json"
json_request POST '/api/admin/galleries' "${gallery_create}" "${gallery_response}" || fail 'Gallery creation failed.'
expect_status 200 "${gallery_response}" 'Gallery creation'
gallery_id=$(require_json_id "${gallery_response}" 'Gallery creation')

gallery_update=$(jq -cn \
  --arg id "${gallery_id}" \
  --arg title "${gallery_title}" \
  --arg slug "${slug}-gallery" \
  --arg cover "${gallery_upload_url}" \
  --arg path "${gallery_upload_path}" \
  '{id:$id,title:$title,slug:$slug,category:"Acceptance test",description:"Temporary production acceptance record, updated.",cover_image_url:$cover,cover_storage_path:$path,status:"draft"}')
json_request POST '/api/admin/galleries' "${gallery_update}" "${temporary_root}/gallery-update.json" || fail 'Gallery update failed.'
expect_status 200 "${temporary_root}/gallery-update.json" 'Gallery update'
admin_page_contains '/admin/galleries' "${gallery_title}" "${temporary_root}/gallery-page.html"

post_upload_response="${temporary_root}/post-upload.json"
http_request POST '/api/admin/upload' "${post_upload_response}" \
  --form "file=@${TEST_IMAGE}" \
  --form-string 'kind=posts' \
  || fail 'The post cover upload failed.'
expect_status 201 "${post_upload_response}" 'Post cover upload'
post_upload_path=$(jq -er '.path | select(type == "string")' "${post_upload_response}") \
  || fail 'Post cover upload did not return a managed path.'
post_upload_url=$(jq -er '.publicUrl | select(type == "string" and startswith("https://"))' "${post_upload_response}") \
  || fail 'Post cover upload did not return a secure public URL.'

post_create=$(jq -cn \
  --arg title "SBL smoke post ${short_id}" \
  --arg slug "${slug}-post" \
  --arg cover "${post_upload_url}" \
  --arg path "${post_upload_path}" \
  '{title:$title,slug:$slug,excerpt:"Temporary acceptance post.",body:"This temporary post verifies production create, update, read, and delete behavior.",cover_image_url:$cover,cover_storage_path:$path,status:"draft"}')
post_response="${temporary_root}/post-create.json"
json_request POST '/api/admin/posts' "${post_create}" "${post_response}" || fail 'Post creation failed.'
expect_status 200 "${post_response}" 'Post creation'
post_id=$(require_json_id "${post_response}" 'Post creation')

post_update=$(jq -cn \
  --arg id "${post_id}" \
  --arg title "${post_title}" \
  --arg slug "${slug}-post" \
  --arg cover "${post_upload_url}" \
  --arg path "${post_upload_path}" \
  '{id:$id,title:$title,slug:$slug,excerpt:"Temporary acceptance post, updated.",body:"This temporary post verifies production create, update, read, and delete behavior.",cover_image_url:$cover,cover_storage_path:$path,status:"draft"}')
json_request POST '/api/admin/posts' "${post_update}" "${temporary_root}/post-update.json" || fail 'Post update failed.'
expect_status 200 "${temporary_root}/post-update.json" 'Post update'
admin_page_contains '/admin/posts' "${post_title}" "${temporary_root}/post-page.html"

service_create=$(jq -cn \
  --arg name "SBL smoke service ${short_id}" \
  '{name:$name,description:"Temporary acceptance service.",price_type:"fixed",price:"125.00",is_active:true}')
service_response="${temporary_root}/service-create.json"
json_request POST '/api/admin/services' "${service_create}" "${service_response}" || fail 'Service creation failed.'
expect_status 200 "${service_response}" 'Service creation'
service_id=$(require_json_id "${service_response}" 'Service creation')

service_update=$(jq -cn \
  --arg id "${service_id}" \
  --arg name "${service_name}" \
  '{id:$id,name:$name,description:"Temporary acceptance service, updated.",price_type:"fixed",price:"150.00",is_active:true}')
json_request POST '/api/admin/services' "${service_update}" "${temporary_root}/service-update.json" || fail 'Service update failed.'
expect_status 200 "${temporary_root}/service-update.json" 'Service update'
admin_page_contains '/admin/services' "${service_name}" "${temporary_root}/service-page.html"

client_create=$(jq -cn \
  --arg service "${service_id}" \
  --arg name "SBL smoke client ${short_id}" \
  --arg email "acceptance-${short_id}@example.com" \
  '{service_id:$service,name:$name,email:$email,phone:"",notes:"Temporary acceptance client."}')
client_response="${temporary_root}/client-create.json"
json_request POST '/api/admin/clients' "${client_create}" "${client_response}" || fail 'Client creation failed.'
expect_status 200 "${client_response}" 'Client creation'
client_id=$(require_json_id "${client_response}" 'Client creation')

client_update=$(jq -cn \
  --arg id "${client_id}" \
  --arg service "${service_id}" \
  --arg name "${client_name}" \
  --arg email "acceptance-${short_id}@example.com" \
  '{id:$id,service_id:$service,name:$name,email:$email,phone:"",notes:"Temporary acceptance client, updated."}')
json_request POST '/api/admin/clients' "${client_update}" "${temporary_root}/client-update.json" || fail 'Client update failed.'
expect_status 200 "${temporary_root}/client-update.json" 'Client update'
admin_page_contains '/admin/clients' "${client_name}" "${temporary_root}/client-page.html"

invoice_create=$(jq -cn \
  --arg client "${client_id}" \
  --arg description "SBL smoke invoice ${short_id}" \
  '{client_id:$client,description:$description,amount:"250.00",deposit:"75.00",due_date:""}')
invoice_response="${temporary_root}/invoice-create.json"
json_request POST '/api/admin/invoices' "${invoice_create}" "${invoice_response}" || fail 'Draft invoice creation failed.'
expect_status 200 "${invoice_response}" 'Draft invoice creation'
invoice_id=$(require_json_id "${invoice_response}" 'Draft invoice creation')

invoice_update=$(jq -cn \
  --arg id "${invoice_id}" \
  --arg client "${client_id}" \
  --arg description "${invoice_description}" \
  '{id:$id,client_id:$client,description:$description,amount:"275.00",deposit:"75.00",due_date:""}')
json_request POST '/api/admin/invoices' "${invoice_update}" "${temporary_root}/invoice-update.json" || fail 'Draft invoice update failed.'
expect_status 200 "${temporary_root}/invoice-update.json" 'Draft invoice update'
admin_page_contains '/admin/invoices' "${invoice_description}" "${temporary_root}/invoice-page.html"

json_request POST '/api/connect' "${connect_payload}" "${temporary_root}/connect-recheck.json" \
  || fail 'Stripe connection status could not be rechecked safely.'
expect_status 200 "${temporary_root}/connect-recheck.json" 'Stripe connection recheck'
jq -e '.charges_enabled == false and .payouts_enabled == false' "${temporary_root}/connect-recheck.json" >/dev/null \
  || fail 'Stripe became enabled during the test; invoice sending was not attempted.'

send_payload=$(jq -cn --arg invoiceId "${invoice_id}" '{invoiceId:$invoiceId}')
json_request POST '/api/invoices/send' "${send_payload}" "${temporary_root}/invoice-send.json" \
  || fail 'The disconnected Stripe invoice guard could not be tested.'
if [[ ${HTTP_STATUS} != 409 ]] \
  || ! jq -e '.message == "Finish Stripe onboarding first."' "${temporary_root}/invoice-send.json" >/dev/null; then
  fail 'Invoice sending was not safely blocked for the disconnected studio.'
fi

exit 0
