#!/usr/bin/env bash
# Uploads the recordings and pictures to R2 (bucket tcf-monster-files), 8 at a time, resumable.
#
#   scripts/media-upload.sh            every file of the manifest not yet uploaded
#   scripts/media-upload.sh 3          at most 3 files this run (to try it out)
#
# Reads ~/Developer/tcf.monster-data/media-manifest.json (written by scripts/bank-export.py: key → local path).
# Keeps ~/Developer/tcf.monster-data/media-uploaded.txt, one key per line, appended after each success: a rerun
# skips those keys, so a stopped or failed run just continues. Progress is printed every 100 files.
set -u

REPO="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$HOME/Developer/tcf.monster-data"
MANIFEST="$DATA/media-manifest.json"
DONE="$DATA/media-uploaded.txt"
BUCKET="tcf-monster-files"
PARALLEL=8
LIMIT="${1:-0}"

cd "$REPO" || exit 1
[ -f "$MANIFEST" ] || { echo "no manifest at $MANIFEST — run python3 -I scripts/bank-export.py first" >&2; exit 1; }
touch "$DONE"

# one file: called by xargs with "key<TAB>path" on one line
upload_one() {
  local line="$1" key path ext ct out total
  key="${line%%$'\t'*}"
  path="${line#*$'\t'}"
  ext="$(printf '%s' "${key##*.}" | tr '[:upper:]' '[:lower:]')"
  case "$ext" in
    mp3) ct="audio/mpeg" ;;
    m4a) ct="audio/mp4" ;;
    ogg) ct="audio/ogg" ;;
    webp) ct="image/webp" ;;
    png) ct="image/png" ;;
    jpg|jpeg) ct="image/jpeg" ;;
    *) ct="application/octet-stream" ;;
  esac
  if [ ! -f "$path" ]; then
    echo "MISSING  $key  ($path)" >&2
    return 1
  fi
  if out="$(npx wrangler r2 object put "$BUCKET/$key" --file "$path" --content-type "$ct" --cache-control "public, max-age=31536000, immutable" --remote -c wrangler.app.jsonc 2>&1)"; then
    echo "$key" >> "$DONE"
    total="$(wc -l < "$DONE" | tr -d ' ')"
    if [ $((total % 100)) -eq 0 ]; then echo "$total / $TOTAL_ALL uploaded"; fi
    return 0
  fi
  echo "FAILED   $key" >&2
  echo "$out" | tail -n 5 | sed 's/^/         /' >&2
  return 1
}
export -f upload_one
export DONE BUCKET

# the manifest minus the keys already done, as "key<TAB>path" lines (python only reads JSON here)
TODO="$(mktemp)"
python3 -I - "$MANIFEST" "$DONE" "$LIMIT" > "$TODO" <<'EOF'
import json, sys
manifest = json.load(open(sys.argv[1], encoding="utf-8"))
done = set(l.strip() for l in open(sys.argv[2], encoding="utf-8") if l.strip())
limit = int(sys.argv[3])
todo = [(k, p) for k, p in sorted(manifest.items()) if k not in done]
if limit > 0:
    todo = todo[:limit]
for k, p in todo:
    print(k + "\t" + p)
EOF
export TOTAL_ALL="$(python3 -I -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$MANIFEST")"
N_TODO="$(wc -l < "$TODO" | tr -d ' ')"
N_DONE="$(sort -u "$DONE" | wc -l | tr -d ' ')"
echo "$TOTAL_ALL files in the manifest, $N_DONE already uploaded, $N_TODO to do this run ($PARALLEL at a time)"
[ "$N_TODO" -gt 0 ] || { rm -f "$TODO"; echo "nothing to do"; exit 0; }

tr '\n' '\0' < "$TODO" | xargs -0 -P "$PARALLEL" -n 1 bash -c 'upload_one "$0"'
STATUS=$?
rm -f "$TODO"

N_DONE="$(sort -u "$DONE" | wc -l | tr -d ' ')"
LEFT=$((TOTAL_ALL - N_DONE))
echo "done: $N_DONE of $TOTAL_ALL uploaded, $LEFT left"
if [ "$LEFT" -gt 0 ] && [ "$LIMIT" -eq 0 ]; then
  echo "some uploads failed — run the script again, it continues where it stopped" >&2
  exit 1
fi
exit $STATUS
