#!/bin/bash
# Systematic test matrix: 5 short + 5 medium + 5 long, each 2x = 30 tests

OUTFILE="/home/z/my-project/test-results.csv"
echo "run,test_num,category,words,chars,time_s,attempt,ai_success,store_name" > "$OUTFILE"

# ─── Test Prompts ───
SHORT=(
  "jewelry store gold rings"
  "coffee shop artisan beans"
  "vintage bookshop"
  "yoga studio downtown"
  "pet supplies store"
)

MEDIUM=(
  "Build a cozy bakery called Sugar Lane that sells artisan cakes, pastries, and fresh bread with a warm pink and cream color theme."
  "Create an online plant nursery called Urban Jungle selling indoor plants, pots, and gardening tools with a modern green aesthetic."
  "Design a minimalist watch brand called Tempo targeting professionals who appreciate clean Scandinavian design and quality leather straps."
  "Build a craft beer delivery service called Hop Drop featuring seasonal IPAs, stouts, and sours with a bold orange and dark theme."
  "Create a handmade pottery shop called Clay Works selling mugs, bowls, and vases with an earthy warm terracotta color palette."
)

LONG=(
  "Build a modern minimalist skincare brand called Pure Elements, targeting young professionals who want clean science-backed beauty products with a soft sage green and cream color palette. Include sections for bestseller products, ingredient transparency, customer reviews, and newsletter signup for a loyalty program. Product categories include serums, moisturizers, and cleansers, all priced between 25 and 60 dollars."
  "Create an upscale Italian leather goods brand named Artigiano with deep burgundy and gold colors targeting affluent professionals aged 30 to 50. Include handmade bags, wallets, belts, and accessories. Add a craftsmanship story section, customer testimonials, a size guide, and care instructions. Products range from 80 to 400 dollars."
  "Design a trendy plant-based protein snack company called VedgeFit targeting fitness enthusiasts and health-conscious millennials with bold green, orange, and black colors. Include best-selling products, nutrition comparison table, customer before-and-after transformations, subscription plans, and an FAQ about ingredients and allergens. Products priced 3 to 15 dollars."
  "Build an artisanal coffee subscription service called Roast Republic for coffee connoisseurs and remote workers with warm rustic brown, amber, and cream tones. Include origin story, blend flavor profiles, subscription tier comparison, customer reviews, and a brew guide tutorial. Monthly plans from 15 to 45 dollars."
  "Create a sustainable children clothing brand called Little Sprout for eco-conscious parents with soft pastel mint green, peach, and lavender. Include a materials and sustainability section, size guide by age group, customer photo gallery, seasonal collections, and a loyalty rewards program. Products 20 to 55 dollars."
)

run_test() {
  local RUN=$1 CATEGORY=$2 IDX=$3 PROMPT=$4
  local WORDS=$(echo "$PROMPT" | wc -w | tr -d ' ')
  local CHARS=${#PROMPT}

  local JSON_BODY
  JSON_BODY=$(jq -n --arg p "$PROMPT" '{prompt: $p}')

  local START=$(date +%s)
  local RESP
  RESP=$(curl -s -N --max-time 200 -X POST http://localhost:3000/api/store/generate \
    -H 'Content-Type: application/json' \
    -d "$JSON_BODY" 2>&1)
  local END=$(date +%s)
  local ELAPSED=$((END - START))

  local AI_SUCCESS="true"
  if echo "$RESP" | grep -q '_isFallback.*true'; then
    AI_SUCCESS="false"
  fi

  local STORE_NAME
  STORE_NAME=$(echo "$RESP" | grep '^data: ' | tail -1 | grep -oP '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"$//')
  [ -z "$STORE_NAME" ] && STORE_NAME="(no store)"

  local ATTEMPT
  ATTEMPT=$(echo "$RESP" | grep 'event: progress' | grep 'generating' | wc -l | tr -d ' ')
  [ -z "$ATTEMPT" ] || [ "$ATTEMPT" = "0" ] && ATTEMPT="?"

  printf "R%d | %-6s #%d | %2dw %3dc | %3ds | att%s | AI:%s | %s\n" \
    "$RUN" "$CATEGORY" "$((IDX+1))" "$WORDS" "$CHARS" "$ELAPSED" "$ATTEMPT" "$AI_SUCCESS" "$STORE_NAME"

  echo "$RUN,$IDX,$CATEGORY,$WORDS,$CHARS,$ELAPSED,$ATTEMPT,$AI_SUCCESS,$STORE_NAME" >> "$OUTFILE"
}

for RUN in 1 2; do
  echo ""
  echo "==========================================="
  echo "  RUN $RUN OF 2"
  echo "==========================================="

  for i in 0 1 2 3 4; do
    echo -n "SHORT #$(($i+1))... "
    run_test $RUN "short" $i "${SHORT[$i]}"
    sleep 2
  done

  for i in 0 1 2 3 4; do
    echo -n "MEDIUM #$(($i+1))... "
    run_test $RUN "medium" $i "${MEDIUM[$i]}"
    sleep 2
  done

  for i in 0 1 2 3 4; do
    echo -n "LONG #$(($i+1))... "
    run_test $RUN "long" $i "${LONG[$i]}"
    sleep 2
  done

done

echo ""
echo "DONE. Results in $OUTFILE"
