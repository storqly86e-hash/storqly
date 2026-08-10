#!/bin/bash
PROMPT="jewelry store gold rings"
JSON_BODY=$(jq -n --arg p "$PROMPT" '{prompt: $p}')
echo "JSON: $JSON_BODY"
START=$(date +%s%N)
RESP=$(curl -s -N --max-time 120 -X POST http://localhost:3000/api/store/generate \
  -H 'Content-Type: application/json' \
  -d "$JSON_BODY" 2>&1)
END=$(date +%s%N)
ELAPSED_MS=$(( (END - START) / 1000000 ))
ELAPSED_S=$(echo "scale=1; $ELAPSED_MS / 1000" | bc)
echo "Took ${ELAPSED_S}s"
echo "$RESP" | grep -E '^event:|^data:' | head -6
