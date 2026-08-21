// ========================================
// AI Provider Status Check
// ========================================
// GET /api/ai-status
// Strategy: Check key format first (instant, no API call).
// Also detect z-ai SDK availability (sandbox primary provider).
// If any provider is available, report anyWorking=true.
// If ?ping=true query param, also do a live API test.

import { NextRequest, NextResponse } from 'next/server';
import { getProviders, type AIProvider } from '@/lib/ai-providers';

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
  model?: string;
};

// ── Quick format-based check (no API call) ──
function checkByFormat(): ProviderStatus[] {
  const results: ProviderStatus[] = [];
  const start = Date.now();

  // z-ai SDK (sandbox primary provider — no API key needed)
  if (zaiSdkAvailable && process.env.NODE_ENV !== 'production') {
    results.push({ name: 'z-ai', ok: true, latencyMs: Date.now() - start, method: 'format' });
  }

  // OpenRouter (primary production provider)
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey && orKey !== 'placeholder') {
    if (orKey.startsWith('sk-or-')) {
      results.push({
        name: 'openrouter',
        ok: true,
        latencyMs: Date.now() - start,
        method: 'format',
        model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free',
      });
    } else {
      results.push({
        name: 'openrouter',
        ok: false,
        error: `Invalid key format (starts with '${orKey.slice(0, 6)}', needs 'sk-or-')`,
        latencyMs: Date.now() - start,
        method: 'format',
      });
    }
  }

  // Gemini (secondary provider)
  const gemKey = process.env.GOOGLE_AI_API_KEY;
  if (gemKey && gemKey !== 'placeholder') {
    if (gemKey.startsWith('AIzaSy')) {
      results.push({ name: 'gemini', ok: true, latencyMs: Date.now() - start, method: 'format' });
    } else {
      const isOAuth = gemKey.startsWith('AQ.');
      results.push({
        name: 'gemini',
        ok: false,
        error: isOAuth ? 'OAuth token (need AIzaSy key)' : `Key format invalid (starts with '${gemKey.slice(0, 6)}')`,
        latencyMs: Date.now() - start,
        method: 'format',
      });
    }
  }

  return results;
}

// ── Live API ping (only when ?ping=true) ──

async function pingProvider(provider: AIProvider): Promise<ProviderStatus> {
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
    } else if (msg.includes('401') || msg.includes('API_KEY_INVALID') || msg.includes('invalid_api_key') || msg.includes('not valid')) {
      shortError = 'Invalid API key';
    } else if (msg.includes('402')) {
      shortError = 'Insufficient credits';
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
  }

  const anyWorking = results.some(r => r.ok);
  return NextResponse.json({
    providers: results,
    anyWorking,
    method: doPing ? 'live-ping' : 'format-check',
    timestamp: new Date().toISOString(),
  });
}
