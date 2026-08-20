// ========================================
// AI Provider Status Check
// ========================================
// GET /api/ai-status
// Strategy: Check key format first (instant, no API call).
// Also detect z-ai SDK availability (sandbox primary provider).
// If any provider is available, report anyWorking=true.
// If ?ping=true query param, also do a live API test.

import { NextRequest, NextResponse } from 'next/server';
import { getProviders } from '@/lib/ai-providers';

// Detect z-ai SDK (same logic as ai-providers.ts)
let zaiSdkAvailable = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('z-ai-web-dev-sdk');
  if (mod?.default?.create) zaiSdkAvailable = true;
} catch {
  zaiSdkAvailable = false;
}

type ProviderStatus = {
  name: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
  method: 'format' | 'ping';
};

// ── Quick format-based check (no API call) ──
function checkByFormat(): ProviderStatus[] {
  const results: ProviderStatus[] = [];
  const start = Date.now();

  // z-ai SDK (sandbox primary provider — no API key needed)
  if (zaiSdkAvailable && process.env.NODE_ENV !== 'production') {
    results.push({ name: 'z-ai', ok: true, latencyMs: Date.now() - start, method: 'format' });
  }

  // Groq (primary production provider)
  const gKey = process.env.GROQ_API_KEY;
  if (gKey && gKey !== 'placeholder' && gKey.startsWith('gsk_')) {
    results.push({ name: 'groq', ok: true, latencyMs: Date.now() - start, method: 'format' });
  }

  // Gemini (only if valid API key configured)
  const gemKey = process.env.GOOGLE_AI_API_KEY;
  if (gemKey && gemKey !== 'placeholder' && gemKey.startsWith('AIzaSy')) {
    results.push({ name: 'gemini', ok: true, latencyMs: Date.now() - start, method: 'format' });
  }

  return results;
}

// ── Live API ping (only when ?ping=true) ──
interface PingableProvider {
  name: string;
  call: (opts: { messages: Array<{ role: string; content: string }>; timeout: number }) => Promise<string>;
}

async function pingProvider(provider: PingableProvider): Promise<ProviderStatus> {
  const start = Date.now();
  try {
    await provider.call({
      messages: [{ role: 'user', content: 'hi' }],
      timeout: 15_000,
    });
    return { name: provider.name, ok: true, latencyMs: Date.now() - start, method: 'ping' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    let shortError: string;
    if (msg.includes('429') || msg.includes('Too many requests')) {
      shortError = 'Rate limited';
    } else if (msg.includes('403') || msg.includes('Forbidden')) {
      shortError = 'Access denied';
    } else if (msg.includes('401') || msg.includes('API_KEY_INVALID') || msg.includes('not valid')) {
      shortError = 'Invalid API key';
    } else if (msg.includes('timed out') || msg.includes('ETIMEDOUT')) {
      shortError = 'Timed out';
    } else if (msg.includes('404') || msg.includes('not found')) {
      shortError = 'Model not found';
    } else {
      shortError = msg.substring(0, 80);
    }
    return { name: provider.name, ok: false, error: shortError, latencyMs: Date.now() - start, method: 'ping' };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const doPing = searchParams.get('ping') === 'true';

  let results: ProviderStatus[];

  if (doPing) {
    // Live ping mode
    const providers = getProviders();
    results = [];
    for (const p of providers) {
      const status = await pingProvider(p);
      results.push(status);
      try { p.reset(); } catch { /* ignore */ }
    }
  } else {
    // Default: fast format check (no API calls, no rate limit risk)
    results = checkByFormat();
    // Also report providers that are configured but have wrong format
    const env = process.env;
    if (env.GROQ_API_KEY && env.GROQ_API_KEY !== 'placeholder') {
      if (!results.find(r => r.name === 'groq')) {
        results.push({ name: 'groq', ok: false, error: 'Key format invalid (needs gsk_)', latencyMs: 0, method: 'format' });
      }
    }
    if (env.GOOGLE_AI_API_KEY && env.GOOGLE_AI_API_KEY !== 'placeholder') {
      if (!results.find(r => r.name === 'gemini')) {
        const isOAuth = env.GOOGLE_AI_API_KEY!.startsWith('AQ.');
        results.push({ name: 'gemini', ok: false, error: isOAuth ? 'OAuth token (need AIzaSy key)' : 'Key format invalid', latencyMs: 0, method: 'format' });
      }
    }
  }

  const anyWorking = results.some(r => r.ok);
  return NextResponse.json({
    providers: results,
    anyWorking,
    method: doPing ? 'live-ping' : 'format-check',
    timestamp: new Date().toISOString(),
  });
}