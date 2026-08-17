#!/bin/bash
# ═══════════════════════════════════════════════════════════
# Phase 3B Batch Test — Pure curl (no additional runtimes)
# ═══════════════════════════════════════════════════════════
set -euo pipefail

BASE="http://127.0.0.1:3000"
COOKIE_JAR="/tmp/storqly-cookies.txt"
rm -f "$COOKIE_JAR"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Phase 3B Batch Test Suite                              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo

# Health check
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/api/health")
echo "[Health] $HEALTH"
if [ "$HEALTH" != "200" ]; then echo "Server not healthy!"; exit 1; fi

# Login via NextAuth
# First get the CSRF token from the session
echo "[Auth] Getting CSRF token..."
CSRF_RESP=$(curl -s --max-time 10 -c "$COOKIE_JAR" "$BASE/api/auth/csrf")
CSRF=$(echo "$CSRF_RESP" | jq -r '.csrfToken // empty')
if [ -z "$CSRF" ]; then
  echo "  No CSRF token — trying direct signin..."
  SIGIN_RESP=$(curl -s --max-time 10 -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/auth/signin/credentials" \
    -H 'Content-Type: application/json' \
    -d '{"email":"batch3b@test.com","password":"batchtest123","redirect":false}')')
  echo "  Signin response: $(echo "$SIGIN_RESP" | head -c 200)"
else
  echo "  CSRF: ${CSRF:0:20}..."
  # Submit credentials
  SIGNIN_RESP=$(curl -s --max-time 10 -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -X POST "$BASE/api/auth/callback/credentials" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "email=batch3b@test.com" \
    --data-urlencode "password=batchtest123" \
    --data-urlencode "csrfToken=$CSRF" \
    -L --max-redirs 0 -o /dev/null -w '%{http_code}' 2>/dev/null || echo 'follow-failed')
  echo "  Callback status: $SIGNIN_RESP"
fi

# Verify session
SESSION=$(curl -s --max-time 10 -b "$COOKIE_JAR" -c "$COOKIE_JAR" "$BASE/api/auth/session")
USER_EMAIL=$(echo "$SESSION" | jq -r '.user.email // empty')
echo "[Auth] Session user: ${USER_EMAIL:-NOT AUTHENTICATED}"
if [ -z "$USER_EMAIL" ]; then
  echo "  WARNING: Not authenticated. Generate calls may return 401."
fi
echo

# Run a single test
run_test() {
  local NAME="$1"
  local PROMPT="$2"
  
  echo "━━━ $NAME ━━━"
  echo "  Prompt: ${PROMPT:0:80}..."
  
  local START=$(date +%s%N)
  local OUTPUT_FILE="/tmp/storqly-test-$$.txt"
  local HTTP_CODE
  
  HTTP_CODE=$(curl -s --max-time 300 -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -X POST "$BASE/api/store/generate" \
    -H 'Content-Type: application/json' \
    -d "{\"prompt\":\"$PROMPT\"}" \
    -o "$OUTPUT_FILE" -w '%{http_code}' 2>/dev/null || echo '000')
  
  local END=$(date +%s%N)
  local TIME_MS=$(( (END - START) / 1000000 ))
  local OUTPUT_SIZE=$(wc -c < "$OUTPUT_FILE" 2>/dev/null || echo 0)
  
  if [ "$HTTP_CODE" = "000" ]; then
    echo "  ❌ FAILED — connection error (server may have crashed)"
    echo "  Time: ${TIME_MS}ms"
    echo
    return 1
  fi
  
  if [ "$HTTP_CODE" != "200" ]; then
    echo "  ❌ HTTP $HTTP_CODE"
    echo "  Time: ${TIME_MS}ms"
    echo "  Response: $(head -c 200 "$OUTPUT_FILE")"
    echo
    return 1
  fi
  
  # Parse SSE for results
  local RESULT_LINE=$(rg '^data: ' "$OUTPUT_FILE" | rg '"result"' | tail -1 | sed 's/^data: //')
  local FALLBACK=$(echo "$RESULT_LINE" | jq -r '._isFallback // false')
  local PRODUCTS=$(echo "$RESULT_LINE" | jq '.data.store.products | length // 0')
  local SECTIONS=$(echo "$RESULT_LINE" | jq '[.data.store.pages[].sections[]] | length // 0')
  local HERO_BG=$(echo "$RESULT_LINE" | jq '[.data.store.pages[].sections[] | select(.type=="hero") | .style.backgroundImage] | any // false')
  local ANNOUNCEMENT=$(echo "$RESULT_LINE" | jq '.data.store.announcementText | length > 0 // false')
  
  local STATUS="✅ SUCCESS"
  [ "$FALLBACK" = "true" ] && STATUS="⚠️ FALLBACK"
  
  echo "  $STATUS"
  echo "  Time: ${TIME_MS}ms ($(echo "scale=1; $TIME_MS / 1000" | bc)s)"
  echo "  Output: ${OUTPUT_SIZE} chars"
  echo "  Products: $PRODUCTS | Sections: $SECTIONS"
  echo "  Hero BG Image: $([ "$HERO_BG" = "true" ] && echo '✅ YES' || echo '❌ NO')"
  echo "  Announcement: $([ "$ANNOUNCEMENT" = "true" ] && echo '✅ YES' || echo '❌ NO')"
  echo
  
  rm -f "$OUTPUT_FILE"
  
  # Return timing for summary
  echo "${NAME}|${TIME_MS}|${OUTPUT_SIZE}|${PRODUCTS}|${SECTIONS}|${HERO_BG}|${ANNOUNCEMENT}|${FALLBACK}" >> /tmp/storqly-results.txt
}

# Clear results
rm -f /tmp/storqly-results.txt

# Test 1: Short (3 products)
run_test "Short (3 products)" "Build a store called Tiny Shop selling 3 artisan candles"

# Test 2: Medium (8 products)
run_test "Medium (8 products)" "Create Coastal Breeze a beach lifestyle brand selling 8 products like towels sunscreen and beach accessories"

# Test 3: Long (20 products)
run_test "Long (20 products)" "Build GreenLeaf Organics an organic skincare brand with 20 products including cleansers serums moisturizers face masks eye creams body oils toners and essences"

# Test 4: Stress (50 products, hits soft cap at 30)
run_test "Stress (50→30 products)" "Create MegaMart Pro a massive electronics store with 50 products covering smartphones laptops tablets headphones cameras drones smart watches gaming consoles monitors keyboards mice speakers routers chargers cables cases"

# Summary
echo "══════════════════════════════════════════════════════════"
echo "  SUMMARY"
echo "══════════════════════════════════════════════════════════"
while IFS='|' read -r NAME TIME SIZE PRODS SECTS HERO ANN FALL; do
  ICON="✅"
  [ "$FALL" = "true" ] && ICON="⚠️"
  printf "  %s %-25s | %6sms | %6s chars | P:%-2s S:%-1s | HeroBG:%s Ann:%s\n" \
    "$ICON" "$NAME" "$TIME" "$SIZE" "$PRODS" "$SECTS" "$HERO" "$ANN"
done < /tmp/storqly-results.txt
echo "══════════════════════════════════════════════════════════"

rm -f /tmp/storqly-results.txt "$COOKIE_JAR"
