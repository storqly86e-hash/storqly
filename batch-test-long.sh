#!/bin/bash
# Batch test: 12 long, detailed prompts (realistic user behavior)
# Tests SSE streaming with complex prompts that produce longer AI output

PROMPTS=(
  "Build a modern minimalist skincare brand called Pure Elements, targeting young professionals who want clean science-backed beauty products. The store should feel calm and premium with a soft neutral color palette including sage green cream and soft beige tones. Include sections for bestseller products ingredient transparency story customer reviews and a newsletter signup for a loyalty program. Product categories should include serums moisturizers and cleansers all priced between 25 and 60 dollars."

  "Create an upscale Italian leather goods brand named Artigiano with a warm luxurious aesthetic using deep burgundy and gold color scheme. Target affluent professionals aged 30 to 50. Include handmade bags wallets belts and accessories. Add a craftsmanship story section customer testimonials from verified buyers a size guide and care instructions section. Products should range from 80 to 400 dollars."

  "Design a trendy plant-based protein snack company called VedgeFit targeting fitness enthusiasts and health-conscious millennials. Use bold energetic colors like bright green orange and black. Include best selling products section nutrition comparison table customer before and after transformations subscription plans and an FAQ about ingredients and allergens. Products should be protein bars shakes and snacks priced 3 to 15 dollars."

  "Build an artisanal coffee subscription service called Roast Republic targeting coffee connoisseurs and remote workers. The design should feel warm and rustic with earthy tones brown amber and cream. Include sections for origin story of each roast blend flavor profiles with tasting notes subscription tier comparison customer reviews from coffee lovers and a brew guide tutorial section. Monthly plans from 15 to 45 dollars."

  "Create a sustainable children clothing brand called Little Sprout targeting eco-conscious parents who want organic cotton and ethical manufacturing. Use soft pastel colors mint green peach and lavender. Include a materials and sustainability section size guide by age group customer photo gallery seasonal collections and a loyalty rewards program signup. Products should be onesies rompers and sets priced 20 to 55 dollars."

  "Design a premium pet wellness brand called Pawsitive Vitality selling organic dog treats supplements and grooming products. Target devoted pet owners who treat their dogs like family. Use warm inviting colors forest green and warm gold. Include ingredient transparency section veterinarian endorsements customer testimonials with pet photos a dosage guide and subscription options for monthly deliveries. Products 15 to 60 dollars."

  "Build a modern home office furniture brand called DeskCraft targeting remote workers and freelancers who want ergonomic and stylish furniture. Use sleek minimalist colors charcoal gray white and natural wood tones. Include product categories for standing desks ergonomic chairs monitor arms and cable management. Add a workspace inspiration gallery customer setup photos assembly guide and a compare features section. Products 150 to 800 dollars."

  "Create a craft cocktail mixology kit brand called Shaker and Stir targeting home bartending enthusiasts and party hosts. Use a sophisticated dark theme with gold and deep navy blue accents. Include cocktail recipe cards section ingredient sourcing story video tutorial links for popular drinks gift bundle suggestions and customer reviews with photos of their creations. Products 25 to 75 dollars."

  "Design an outdoor adventure gear brand called TrailBound targeting weekend hikers and camping enthusiasts. Use rugged earthy colors olive green burnt orange and slate gray. Include product categories for hiking boots camping tents sleeping bags and outdoor accessories. Add a trail guide section customer adventure stories with photos a gear comparison by activity type and a seasonal clearance section. Products 40 to 300 dollars."

  "Build a minimalist tech accessories brand called Circuit selling phone cases laptop sleeves and desk organizers for professionals. Use a clean monochrome palette with subtle accent colors. Include a product customization section where users can see different color options a tech compatibility checker customer reviews organized by device type and a corporate bulk ordering section with volume discounts. Products 20 to 80 dollars."

  "Create a luxury candle and home fragrance brand called Ember and Oak targeting home decor enthusiasts who appreciate artisanal craftsmanship. Use rich warm tones deep amber burgundy and cream. Include sections for scent profiles and notes craftsmanship story showing the pouring process customer reviews with home photos a seasonal collection preview and a gift set builder. Products 25 to 65 dollars."

  "Design a specialty tea brand called Leaf and Lore targeting tea enthusiasts interested in rare and exotic blends from around the world. Use elegant serene colors sage teal and warm cream. Include sections for tea origins and sourcing stories brewing guides for different tea types a tea quiz to find your perfect blend customer testimonials and a monthly tea club subscription. Products 12 to 45 dollars."
)

PASS=0
FAIL=0
FALLBACK=0
RESULTS=()

for i in "${!PROMPTS[@]}"; do
  PROMPT="${PROMPTS[$i]}"
  echo ""
  echo "=== Test $((i+1))/${#PROMPTS[@]} ==="
  # Show first 80 chars of prompt
  echo "Prompt: ${PROMPT:0:80}..."
  
  START=$(date +%s)
  
  # Send request, capture SSE events
  RESPONSE=$(curl -s -N --max-time 180 -X POST http://localhost:3000/api/store/generate \
    -H 'Content-Type: application/json' \
    -d "{\"prompt\":\"$(echo "$PROMPT" | sed 's/"/\\\\"/g')\"}" 2>&1)
  
  END=$(date +%s)
  ELAPSED=$((END - START))
  
  # Check for result event
  if echo "$RESPONSE" | grep -q 'event: result'; then
    # Extract store name
    STORE_NAME=$(echo "$RESPONSE" | grep '^data: ' | grep -o '"name":"[^"]*"' | head -1 | sed 's/"name":"//;s/"$//')
    
    if echo "$RESPONSE" | grep -q '_isFallback.*true'; then
      echo "  Result: FALLBACK (${ELAPSED}s) - $STORE_NAME"
      FALLBACK=$((FALLBACK + 1))
    else
      echo "  Result: AI SUCCESS (${ELAPSED}s) - $STORE_NAME"
      PASS=$((PASS + 1))
    fi
    RESULTS+=("$STORE_NAME")
  else
    echo "  Result: NO RESULT EVENT (${ELAPSED}s)"
    FAIL=$((FAIL + 1))
  fi
  
  # 8s spacing between requests
  sleep 8
done

echo ""
echo "========================================"
echo "BATCH TEST RESULTS (Long Prompts)"
echo "========================================"
echo "Total:    ${#PROMPTS[@]}"
echo "AI Success: $PASS"
echo "Fallback:  $FALLBACK"
echo "Failed:    $FAIL"
echo "AI Rate:   $(echo "scale=1; $PASS * 100 / ${#PROMPTS[@]}" | bc)%"
echo ""
echo "Store names:"
for name in "${RESULTS[@]}"; do
  echo "  - $name"
done
