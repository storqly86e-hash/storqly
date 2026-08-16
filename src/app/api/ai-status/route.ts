// ========================================
// Lightweight AI Provider Status Check
// ========================================
// GET /api/ai-status
// Quickly pings each provider to check availability.
// Uses minimal tokens/timeout to avoid consuming quota.

import { NextResponse } from 'next/server';
import { getProviders } from '@/lib/ai-providers';

type ProviderStatus = {
  name: string;
  ok: boolean;
  error?: string;
  latencyMs: number;
};

interface PingableProvider {
  name: string;
  call: (opts: { messages: Array<{ role: string; content: string }>; timeout: number }) => Promise<string>;
}

async function pingProvider(provider: PingableProvider): Promise<ProviderStatus> {
  const start = Date.now();
  try {
    await provider.call({
      messages: [{ role: 'user', content: 'hi' }],
      timeout: 10_000,
    });
    return { name: provider.name, ok: true, latencyMs: Date.now() - start };
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
    return { name: provider.name, ok: false, error: shortError, latencyMs: Date.now() - start };
  }
}

export async function GET() {
  const providers = getProviders();
  const results: ProviderStatus[] = [];

  for (const p of providers) {
    const status = await pingProvider(p);
    results.push(status);
    try { p.reset(); } catch { /* ignore */ }
  }

  const anyWorking = results.some(r => r.ok);
  return NextResponse.json({
    providers: results,
    anyWorking,
    timestamp: new Date().toISOString(),
  });
}
