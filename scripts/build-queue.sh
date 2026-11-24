#!/bin/sh
# Builds every configured mountain that doesn't have public/mountains/<slug>.json yet, one at a time
# (the public Overpass servers don't like parallel heavy queries). Logs to $LOG_DIR/<slug>.log.
#   LOG_DIR=/tmp/builds sh scripts/build-queue.sh
LOG_DIR=${LOG_DIR:-.cache/build-logs}
mkdir -p "$LOG_DIR"
for slug in $(npx tsx scripts/list-mountains.ts); do
  [ -f "public/mountains/$slug.json" ] && continue
  echo "$(date +%H:%M) building $slug"
  if npx tsx scripts/build-all.ts "$slug" --debug "$LOG_DIR" > "$LOG_DIR/$slug.log" 2>&1; then echo "$(date +%H:%M) done $slug"; else echo "$(date +%H:%M) FAILED $slug"; fi
done
