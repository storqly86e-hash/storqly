// ========================================
// Provider Diagnostic Test Endpoint
// ========================================
// GET /api/test-providers
// Tests each AI provider individually, then tests the full failover chain.
// Returns real evidence of which providers work and failover behavior.

import { NextResponse } from 'next/server';
import { getProviders, resetAllProviders } from '@/lib/ai-providers';
import { executeAI } from '@/lib/ai-orchestrator';

const SIMPLE_TEST_MESSAGES = [{ role: 'user' as const, content: 'Say "hello" in exactly one word. No punctuation.' }];
const JSON_TEST_MESSAGES = [{ role: 'user' as const, content: 'Return JSON: {"status":"ok","number":42}' }];
const TEST_TIMEOUT = 15_000;

async function testProvider(name: string): Promise<{ name: string; ok: boolean; latencyMs: number; error?: string; response?: string }> {
  const start = Date.now();
  try {
    const result = await executeAI('chat-edit', SIMPLE_TEST_MESSAGES, {
      systemPrompt: 'You are a test assistant. Reply with exactly one word.',
      temperature: 0.1,
      timeout: TEST_TIMEOUT,
      maxRetries: 0,
      forceProvider: name,
    });
    const latency = Date.now() - start;
    if (result.success && result.content) {
      return { name, ok: true, latencyMs: latency, response: result.content.substring(0, 100) };
    }
    return { name, ok: false, latencyMs: latency, error: result.error };
  } catch (err: unknown) {
    const latency = Date.now() - start;
    return { name, ok: false, latencyMs: latency, error: err instanceof Error ? err.message : String(err) };
  }
}

async function testJsonMode(name: string): Promise<{ name: string; ok: boolean; latencyMs: number; error?: string; response?: string }> {
  const start = Date.now();
  try {
    const result = await executeAI('store-generation', JSON_TEST_MESSAGES, {
      systemPrompt: 'You return JSON. No markdown. No explanation.',
      temperature: 0.1,
      timeout: TEST_TIMEOUT,
      maxRetries: 0,
      responseFormat: 'json_object',
      forceProvider: name,
    });
    const latency = Date.now() - start;
    if (result.success && result.content) {
      // Validate it's actually JSON
      try {
        JSON.parse(result.content);
        return { name: name + ' (JSON mode)', ok: true, latencyMs: latency, response: result.content.substring(0, 100) };
      } catch {
        return { name: name + ' (JSON mode)', ok: false, latencyMs: latency, error: 'Response was not valid JSON: ' + result.content.substring(0, 80) };
      }
    }
    return { name: name + ' (JSON mode)', ok: false, latencyMs: latency, error: result.error };
  } catch (err: unknown) {
    const latency = Date.now() - start;
    return { name: name + ' (JSON mode)', ok: false, latencyMs: latency, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const results: Record<string, unknown> = {};
  const startAll = Date.now();

  // 1. List configured providers
  const providers = getProviders();
  results.providerChain = providers.map(p => p.name);
  console.log(`[Test Providers] Provider chain: ${providers.map(p => p.name).join(' → ')}`);

  // 2. Test each provider individually (simple text)
  const individualTests: Array<Awaited<ReturnType<typeof testProvider>>> = [];
  for (const p of providers) {
    console.log(`[Test Providers] Testing ${p.name} (simple)...`);
    const test = await testProvider(p.name);
    individualTests.push(test);
    console.log(`[Test Providers] ${test.name}: ${test.ok ? 'OK' : 'FAIL'} (${test.latencyMs}ms) ${test.error || ''}`);
  }
  results.individualTests = individualTests;

  // 3. Test JSON mode for each provider
  const jsonTests: Array<Awaited<ReturnType<typeof testJsonMode>>> = [];
  for (const p of providers) {
    console.log(`[Test Providers] Testing ${p.name} (JSON mode)...`);
    const test = await testJsonMode(p.name);
    jsonTests.push(test);
    console.log(`[Test Providers] ${test.name}: ${test.ok ? 'OK' : 'FAIL'} (${test.latencyMs}ms) ${test.error || ''}`);
  }
  results.jsonModeTests = jsonTests;

  // 4. Test failover chain (no forceProvider — let it use the natural chain)
  resetAllProviders();
  console.log(`[Test Providers] Testing failover chain (natural order)...`);
  const chainStart = Date.now();
  try {
    const chainResult = await executeAI('chat-edit', SIMPLE_TEST_MESSAGES, {
      systemPrompt: 'You are a test assistant. Reply with exactly one word.',
      temperature: 0.1,
      timeout: TEST_TIMEOUT,
      maxRetries: 1,
      // NO forceProvider — uses natural chain
    });
    results.failoverChain = {
      success: chainResult.success,
      provider: chainResult.provider,
      attempts: chainResult.attempts,
      latencyMs: Date.now() - chainStart,
      error: chainResult.error,
      response: chainResult.content?.substring(0, 100),
    };
    console.log(`[Test Providers] Failover chain: ${chainResult.success ? 'OK' : 'FAIL'} via ${chainResult.provider} (${chainResult.attempts} attempts, ${Date.now() - chainStart}ms)`);
  } catch (err: unknown) {
    results.failoverChain = { success: false, error: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - chainStart };
  }

  results.totalTimeMs = Date.now() - startAll;
  return NextResponse.json(results);
}
