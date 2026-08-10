#!/bin/bash
# Run 5 short + 5 medium tests (Run 1)
echo "run,idx,category,words,chars,time_s,attempt,ai_success,store_name" > /home/z/my-project/test-results.csv

# SHORT TESTS
declare -a SHORT=(
  "jewelry store gold rings"
  "coffee shop artisan beans"
  "vintage bookshop"
  "yoga studio downtown"
  "pet supplies store"
)

for i in 0 1 2 3 4; do
  P="${SHORT[$i]}"
  JSON=$(jq -n --arg p "$P" '{prompt: $p}')
  S=$(date +%s)
  R=$(curl -s -N --max-time 120 -X POST http://localhost:3000/api/store/generate -H 'Content-Type: application/json' -d "$JSON" 2>&1)
  E=$(( $(date +%s) - S ))
  A=$(echo "$R" | grep 'event: progress' | grep 'generating' | wc -l)
  N=$(echo "$R" | grep '^data: ' | tail -1 | grep -oP '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"$//')
  F=$(echo "$R" | grep -c '_isFallback.*true')
  if [ "$F" -gt 0 ]; then AI=false; else AI=true; fi
  [ -z "$N" ] && N="(none)"
  W=$(echo "$P" | wc -w | tr -d ' ')
  C=${#P}
  echo "1,$i,short,$W,$C,$E,$A,$AI,$N" >> /home/z/my-project/test-results.csv
  echo "SHORT #$(($i+1)): ${E}s att$A AI=$AI $N"
  sleep 2
done
echo "--- SHORT DONE ---"