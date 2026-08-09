#!/bin/bash
PROMPTS=(
  "a clothing store" "a coffee shop" "a jewelry store" "a hat shop" "a book store"
  "an electronics store" "a pet supplies store" "a furniture store" "a bakery" "a fitness store"
  "a plant nursery" "a toy store" "a wine shop" "a skincare brand" "a guitar shop"
  "an art supply store" "a candle company" "a tea shop" "a running shoes store" "a home decor store"
)
PASS=0; FAIL=0; AI_OK=0; AI_FAIL=0; FALLBACK=0; RESULTS=""
> /home/z/my-project/batch_log.txt
echo "Starting 20 sequential tests..." >> /home/z/my-project/batch_log.txt
for i in $(seq 0 19); do
  P="${PROMPTS[$i]}"
  START=$(date +%s%N)
  RESP=$(curl -s -X POST http://localhost:3000/api/store/generate \
    -H 'Content-Type: application/json' \
    -d "{\"prompt\": \"build $P\"}" \
    -w '\n%{http_code} %{time_total}s' \
    --max-time 130 2>&1)
  END=$(date +%s%N)
  ELAPSED_MS=$(( (END - START) / 1000000 ))
  STATUS=$(echo "$RESP" | tail -1 | awk '{print $1}')
  TIME=$(echo "$RESP" | tail -1 | awk '{print $2}')
  if [ "$STATUS" = "200" ]; then
    HAS_NOTE=$(echo "$RESP" | head -1 | python3 -c "import sys,json; d=json.load(sys.stdin); print('FALLBACK' if d.get('_note') else 'AI')" 2>/dev/null || echo "?")
    NAME=$(echo "$RESP" | head -1 | python3 -c "import sys,json; print(json.load(sys.stdin).get('store',{}).get('name','?'))" 2>/dev/null || echo "?")
    PASS=$((PASS+1))
    if [ "$HAS_NOTE" = "FALLBACK" ]; then
      FALLBACK=$((FALLBACK+1))
      RESULTS="$RESULTS\n  OK+FALLBACK [$((i+1))]/20] $P -> $NAME (${TIME}s)"
    else
      AI_OK=$((AI_OK+1))
      RESULTS="$RESULTS\n  OK+AI [$((i+1))]/20] $P -> $NAME (${TIME}s)"
    fi
  else
    FAIL=$((FAIL+1))
      RESULTS="$RESULTS\n  FAIL [$((i+1))]/20] $P -> $STATUS (${TIME}s)"
    fi
  echo "[$((i+1))/20] $STATUS ${TIME}s | AI_OK=$AI_OK FALLBACK=$FALLBACK FAIL=$FAIL" >> /home/z/my-project/batch_progress.txt
done
echo "" >> /home/z/my-project/batch_log.txt
echo "FINAL: $PASS/20 passed (AI: $AI_OK, Fallback: $FALLBACK), $FAIL/20 failed" >> /home/z/my-project/batch_log.txt
echo -e "$RESULTS" >> /home/z/my-project/batch_log.txt
echo "DONE" > /home/z/my-project/batch_done.txt
