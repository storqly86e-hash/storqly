// ═══════════════════════════════════════════════════════════════
// Batch Test Script for Phase 3B — Direct API testing via curl
// ═══════════════════════════════════════════════════════════════════

const BASE = 'http://127.0.0.1:3000';
const EMAIL = 'batch3b@test.com';
const PASSWORD = 'batchtest123';

interface TestResult {
  name: string;
  prompt: string;
  success: boolean;
  timeMs: number;
  outputSize: number;
  productCount: number;
  sectionCount: number;
  hasHeroBgImage: boolean;
  hasAnnouncement: boolean;
  error?: string;
  fallback?: boolean;
}

// Log in via NextAuth credentials and get session cookie
async function login(): Promise<string> {
  console.log('[Test] Logging in...');
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: EMAIL, password: PASSWORD, csrfToken: 'test' }).toString(),
    redirect: 'manual',
  });

  // Try form-based login
  const res2 = await fetch(`${BASE}/api/auth/signin/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, redirect: false }),
  });

  const cookies: string[] = [];
  // Extract cookies from both responses
  for (const [key, val] of res.headers) {
    if (key === 'set-cookie') cookies.push(val.split(';')[0]);
  }
  for (const [key, val] of res2.headers) {
    if (key === 'set-cookie') cookies.push(val.split(';')[0]);
  }

  if (cookies.length === 0) {
    console.log('[Test] Could not get session cookie via callback. Trying session endpoint...');
    // Try getting session directly
    const sessionRes = await fetch(`${BASE}/api/auth/session`);
    const sessionCookies: string[] = [];
    for (const [key, val] of sessionRes.headers) {
      if (key === 'set-cookie') sessionCookies.push(val.split(';')[0]);
    }
    return sessionCookies.join('; ');
  }

  return cookies.join('; ');
}

// Generate a store via SSE and collect results
async function generateStore(cookie: string, prompt: string): Promise<TestResult> {
  const start = performance.now();
  let success = false;
  let outputSize = 0;
  let productCount = 0;
  let sectionCount = 0;
  let hasHeroBgImage = false;
  let hasAnnouncement = false;
  let fallback = false;
  let errorMsg: string | undefined;

  try {
    const res = await fetch(`${BASE}/api/store/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
      body: JSON.stringify({ prompt }),
    });

    if (res.status === 401) {
      return {
        name: prompt.substring(0, 40),
        prompt,
        success: false,
        timeMs: performance.now() - start,
        outputSize: 0,
        productCount: 0,
        sectionCount: 0,
        hasHeroBgImage: false,
        hasAnnouncement: false,
        error: '401 Unauthorized — auth cookie issue',
      };
    }

    if (!res.ok || !res.body) {
      return {
        name: prompt.substring(0, 40),
        prompt,
        success: false,
        timeMs: performance.now() - start,
        outputSize: 0,
        productCount: 0,
        sectionCount: 0,
        hasHeroBgImage: false,
        hasAnnouncement: false,
        error: `HTTP ${res.status}`,
      };
    }

    // Parse SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullOutput = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Process SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          fullOutput += data;
          try {
            const parsed = JSON.parse(data);
            if (parsed.event === 'result' && parsed.data) {
              const store = parsed.data.store;
              if (store) {
                success = true;
                fallback = !!parsed.data._isFallback;
                productCount = store.products?.length || 0;
                sectionCount = store.pages?.reduce((s: number, p: any) => s + (p.sections?.length || 0), 0) || 0;
                hasHeroBgImage = store.pages?.some((p: any) =>
                  p.sections?.some((s: any) => s.type === 'hero' && s.style?.backgroundImage)
                ) || false;
                hasAnnouncement = !!store.announcementText;
              }
            }
          } catch {
            // Not JSON, skip
          }
        }
      }
    }

    outputSize = fullOutput.length;
  } catch (e: any) {
    errorMsg = e.message || String(e);
  }

  return {
    name: prompt.substring(0, 40),
    prompt,
    success,
    timeMs: performance.now() - start,
    outputSize,
    productCount,
    sectionCount,
    hasHeroBgImage,
    hasAnnouncement,
    error: errorMsg,
    fallback,
  };
}

// Main test runner
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Phase 3B Batch Test Suite                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // Health check
  try {
    const healthRes = await fetch(`${BASE}/api/health`);
    console.log(`[Health] Server status: ${healthRes.status}`);
    if (healthRes.status !== 200) {
      console.error('Server not healthy! Aborting.');
      return;
    }
  } catch (e: any) {
    console.error(`Server not reachable: ${e.message}`);
    return;
  }

  // Login
  const cookie = await login();
  console.log(`[Auth] Cookie obtained: ${cookie ? cookie.substring(0, 50) + '...' : 'EMPTY'}`);
  console.log();

  // Test prompts
  const tests = [
    { name: 'Short (3 products)', prompt: 'Build a store called "Tiny Shop" selling 3 artisan candles' },
    { name: 'Medium (8 products)', prompt: 'Create "Coastal Breeze" — a beach lifestyle brand selling 8 products like towels, sunscreen, and beach accessories' },
    { name: 'Long (20 products)', prompt: 'Build "GreenLeaf Organics" — an organic skincare brand with 20 products including cleansers, serums, moisturizers, face masks, eye creams, body oils, toners, and essences' },
    { name: 'Stress (50 products)', prompt: 'Create "MegaMart Pro" — a massive electronics store with 50 products covering smartphones, laptops, tablets, headphones, cameras, drones, smart watches, gaming consoles, monitors, keyboards, mice, speakers, routers, chargers, cables, cases, and accessories. Make it look premium and modern.' },
  ];

  const results: TestResult[] = [];

  for (const test of tests) {
    console.log(`━━━ ${test.name} ━━━`);
    console.log(`  Prompt: "${test.prompt.substring(0, 80)}..."`);
    const result = await generateStore(cookie, test.prompt);
    results.push(result);

    const status = result.success ? (result.fallback ? '⚠️ FALLBACK' : '✅ SUCCESS') : '❌ FAILED';
    console.log(`  Status: ${status}`);
    console.log(`  Time: ${Math.round(result.timeMs)}ms (${(result.timeMs / 1000).toFixed(1)}s)`);
    console.log(`  Output: ${result.outputSize} chars`);
    if (result.success) {
      console.log(`  Products: ${result.productCount} | Sections: ${result.sectionCount}`);
      console.log(`  Hero BG Image: ${result.hasHeroBgImage ? '✅ YES' : '❌ NO'}`);
      console.log(`  Announcement: ${result.hasAnnouncement ? '✅ YES' : '❌ NO'}`);
    }
    if (result.error) console.log(`  Error: ${result.error}`);
    console.log();
  }

  // Summary
  console.log('══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('══════════════════════════════════════════════════════════');
  for (const r of results) {
    const icon = r.success ? (r.fallback ? '⚠' : '✅') : '❌';
    console.log(`  ${icon} ${r.name.padEnd(25)} | ${String(Math.round(r.timeMs)).padStart(6)}ms | ${String(r.outputSize).padStart(6)} chars | P:${r.productCount} S:${r.sectionCount} | HeroBG:${r.hasHeroBgImage ? 'Y' : 'N'} Ann:${r.hasAnnouncement ? 'Y' : 'N'}`);
  }

  const successes = results.filter(r => r.success && !r.fallback).length;
  const fallbacks = results.filter(r => r.fallback).length;
  const failures = results.filter(r => !r.success).length;
  const avgTime = results.filter(r => r.success).reduce((s, r) => s + r.timeMs, 0) / Math.max(1, results.filter(r => r.success).length);
  const maxTime = Math.max(...results.map(r => r.timeMs));

  console.log();
  console.log(`  Success: ${successes}/${results.length} | Fallback: ${fallbacks} | Failed: ${failures}`);
  console.log(`  Avg time (successful): ${Math.round(avgTime)}ms`);
  console.log(`  Max time: ${Math.round(maxTime)}ms (budget: 300,000ms)`);
  console.log(`  502 Risk: ${maxTime > 250000 ? 'HIGH' : maxTime > 180000 ? 'MEDIUM' : 'LOW'}`);
  console.log('══════════════════════════════════════════════════════════');
}

main().catch(console.error);
