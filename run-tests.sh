#!/bin/bash
OUT="/home/z/my-project/test-results.csv"

# Ensure header exists
if [ ! -f "$OUT" ] || [ ! -s "$OUT" ]; then
  echo "run,idx,category,words,chars,time_s,attempt,ai_success,store_name" > "$OUT"
fi

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
  # Count attempts: number of 'generating' stages in data lines
  local ATT=$(echo "$R" | grep '^data: ' | grep -c '"stage":"generating"' || true)
  [ "$ATT" = "0" ] && ATT="?"
  echo "$RUN,$IDX,$CAT,$W,$C,$E,$ATT,$AI,$N" >> "$OUT"
  echo "R${RUN} ${CAT}#${IDX}: ${E}s att${ATT} AI=${AI} ${N}"
}

# Parse arguments: RUN CATEGORY START_IDX "prompt1" "prompt2" ...
RUN=$1; CAT=$2; START=$3; shift 3
for i in "$@"; do
  run_test "$RUN" "$CAT" "$START" "$i"
  START=$((START + 1))
  sleep 2
done
