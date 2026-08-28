#!/bin/bash
# E2E Test: Full store generation with log capture
# All steps in one script so the dev server stays alive.

cd /home/z/my-project

# Kill any existing servers
pkill -f 'next dev' 2>/dev/null || true
sleep 2

# Start server
npx next dev -p 3000 > e2e-server.log 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"
sleep 15

# Verify
HTTP=$(curl -s -o /dev/null -w '%{http_code}' 'http://localhost:3000/')
echo "Server HTTP: $HTTP"
if [ "$HTTP" != "200" ]; then echo "FAIL: server not up"; cat e2e-server.log; exit 1; fi

# ── Step 1: Open browser and sign in ──
echo "=== STEP 1: Opening browser ==="
agent-browser open 'http://localhost:3000/' 2>&1
sleep 3

SNAP=$(agent-browser snapshot -i 2>&1)
echo "$SNAP" | head -20

# Check if already signed in (has 'Sign out') or need to sign in (has 'Sign In' + form)
if echo "$SNAP" | grep -q 'Sign out'; then
  echo "=== Already signed in ==="
else
  echo "=== Need to sign in ==="
  # Find the Sign In tab/button
  SIGNIN_REF=$(echo "$SNAP" | grep 'tab.*Sign In' | grep -oP 'ref=e\K\d+')
  if [ -z "$SIGNIN_REF" ]; then
    SIGNIN_REF=$(echo "$SNAP" | grep 'button.*Sign In' | grep -oP 'ref=e\K\d+')
  fi
  echo "Sign In ref: e$SIGNIN_REF"
  
  if [ -n "$SIGNIN_REF" ]; then
    agent-browser click @e$SIGNIN_REF 2>&1
    sleep 2
    
    SNAP2=$(agent-browser snapshot -i 2>&1)
    echo "After clicking sign in:"
    echo "$SNAP2" | head -20
    
    # Find email and password fields
    EMAIL_REF=$(echo "$SNAP2" | grep 'textbox.*Email' | grep -oP 'ref=e\K\d+')
    PASS_REF=$(echo "$SNAP2" | grep 'textbox.*Password' | grep -oP 'ref=e\K\d+')
    LOGIN_BTN=$(echo "$SNAP2" | grep 'button.*Sign In' | grep -v 'tab' | grep -oP 'ref=e\K\d+')
    
    echo "Email ref: e$EMAIL_REF, Pass ref: e$PASS_REF, Login btn: e$LOGIN_BTN"
    
    agent-browser fill @e$EMAIL_REF 'e2e@test.com' 2>&1
    agent-browser fill @e$PASS_REF 'testpass123' 2>&1
    sleep 1
    
    # Check if login button is enabled
    SNAP3=$(agent-browser snapshot -i 2>&1)
    LOGIN_BTN2=$(echo "$SNAP3" | grep 'button.*Sign In' | grep -v 'tab' | grep -oP 'ref=e\K\d+')
    echo "Login button ref after fill: e$LOGIN_BTN2"
    
    agent-browser click @e$LOGIN_BTN2 2>&1
    sleep 3
    
    # Verify signed in
    SNAP4=$(agent-browser snapshot -i 2>&1)
    if echo "$SNAP4" | grep -q 'Sign out'; then
      echo "=== Signed in successfully ==="
    else
      echo "=== SIGN IN FAILED ==="
      echo "$SNAP4" | head -20
      exit 1
    fi
  else
    echo "FAIL: Could not find Sign In button"
    exit 1
  fi
fi

# ── Step 2: Generate store ──
echo ""
echo "=== STEP 2: Generating store ==="
SNAP=$(agent-browser snapshot -i 2>&1)
PROMPT_REF=$(echo "$SNAP" | grep 'textbox' | grep -oP 'ref=e\K\d+')
GEN_REF=$(echo "$SNAP" | grep 'Generate Store' | grep -oP 'ref=e\K\d+')
echo "Prompt ref: e$PROMPT_REF, Generate ref: e$GEN_REF"

agent-browser fill @e$PROMPT_REF "A cozy home bakery called Sweet Crumb selling artisan breads, croissants, and cakes" 2>&1
sleep 1

# Re-get generate button ref (might change after fill)
SNAP=$(agent-browser snapshot -i 2>&1)
GEN_REF=$(echo "$SNAP" | grep 'Generate Store' | grep -oP 'ref=e\K\d+')
echo "Generate ref after fill: e$GEN_REF"

# Clear server log right before clicking
echo "=== LOG CLEARED AT $(date -u) ===" > e2e-server.log

echo "=== CLICKING GENERATE ==="
agent-browser click @e$GEN_REF 2>&1

echo "=== Waiting 55s for generation ==="
sleep 55

# Check server alive
if kill -0 $SERVER_PID 2>/dev/null; then
  echo "✅ Server still alive"
else
  echo "❌ Server DEAD"
fi

echo ""
echo "=== AI-RELATED LOG LINES ==="
grep -E '(Store Generate|AI Orchestrator|z-ai|gemini|Enrich|enrichProduct)' e2e-server.log 2>/dev/null || echo '(none)'

echo ""
echo "=== PAGE STATE (first 40 lines) ==="
agent-browser snapshot -i 2>&1 | head -40

echo ""
echo "=== E2E TEST COMPLETE ==="
