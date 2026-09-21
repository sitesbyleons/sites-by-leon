#!/usr/bin/env bash
set -euo pipefail
# Install with its SQL file at /opt/leon-platform/statistics before enabling collection.
# Only analytics rows are deleted; never restore or rewrite a customer database.
exec 9>/run/lock/leon-statistics-retention.lock
flock -n 9 || exit 0
docker exec -i leon-platform-database-1 sh -c 'exec psql --no-psqlrc --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --set=ON_ERROR_STOP=1' < /opt/leon-platform/statistics/statistics-retention.sql
