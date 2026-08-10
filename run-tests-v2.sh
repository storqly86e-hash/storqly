#!/bin/bash
OUT="/home/z/my-project/test-results-v2.csv"

run_test() {
  local RUN=$1 CAT=$2 IDX=$3 PROMPT=$4
  local JSON=$(jq -n --arg p "$PROMPT" '{prompt: $p}')
  local S=$(date +%s)
  local R=$(curl -s -N --max-time 180 -X POST http://localhost:3000/api/store/generate -H 'Content-Type: application/json' -d "$JSON" 2>&1)
  local E=$(( $(date +%s) - S ))
  local N=$(echo "$R" | grep '^data: ' | tail -1 | grep -oP '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"$//')
  local F=$(echo "$R" | grep -c '_isFallback.*true')
  local AI="true"; [ "$F" -gt 0 ] && AI="false"
  [ -z "$N" ] && N="(none)"
  local W=$(echo "$PROMPT" | wc -w | tr -d ' ')
  local C=${#PROMPT}
  local ATT=$(echo "$R" | grep '^data: ' | grep -c '"stage":"generating"' || true)
  [ "$ATT" = "0" ] && ATT="?"
  echo "$RUN,$IDX,$CAT,$W,$C,$E,$ATT,$AI,$N" >> "$OUT"
  echo "R${RUN} ${CAT}#${IDX}: ${E}s att${ATT} AI=${AI} ${N}"
}

RUN=$1; CAT=$2; START=$3; shift 3
for i in "$@"; do
  run_test "$RUN" "$CAT" "$START" "$i"
  START=$((START + 1))
  sleep 2
done
