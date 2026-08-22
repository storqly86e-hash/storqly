// ========================================
// AI Provider Diagnostics (no API calls)
// ========================================
// GET /api/ai-debug
// Returns env-var presence, provider chain, AND runtime code fingerprint.

import { NextResponse } from 'next/server';
import { getProviders, getProviderDiagnostics, isZAiLoaded } from '@/lib/ai-providers';

// ── Runtime code fingerprint (compiled into the bundle at build time) ──
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_SDK = '@google/genai';
const ZAI_EXCLUDED_IN_PROD = true;
const OPENROUTER_DEFAULT_MODEL = 'deepseek/deepseek-chat-v3-0324';
const FINGERPRINT = 'v9-openrouter-added-2026-08-21';

function analyzeKey(value: string | undefined, name: string) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isValid: false, advice: `Not configured. ${name} is disabled until a valid key is provided.` };
  return { format: `${value.slice(0, 8)}...${value.slice(-4)}`, isValid: true, advice: '✅ Key detected.' };
}

function analyzeOpenRouterKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isValid: false, advice: 'Not configured. Get a free key at https://openrouter.ai/keys — no billing required.' };
  if (value.startsWith('sk-or-')) return { format: `${value.slice(0, 8)}...${value.slice(-4)}`, isValid: true, advice: '✅ Correct format.' };
  return { format: `${value.slice(0, 8)}...${value.slice(-4)}`, isValid: false, advice: `❌ Invalid format. Must start with 'sk-or-'. Get one at https://openrouter.ai/keys` };
}

function analyzeGeminiKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Not configured (disabled until valid key is provided).' };
  if (value.startsWith('AIzaSy')) return { format: 'AIzaSy... (permanent API key)', isLikelyOAuth: false, isLikelyApiKey: true, advice: '✅ Correct format.' };
  if (value.startsWith('AQ.')) return { format: 'AQ.... (OAuth token)', isLikelyOAuth: true, isLikelyApiKey: false, advice: '❌ OAuth token (~1hr). Get real key at https://aistudio.google.com/apikey' };
  return { format: `${value.slice(0, 6)}...${value.slice(-4)}`, isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Unknown format. Should start with AIzaSy.' };
}

export async function GET() {
  const diagnostics = getProviderDiagnostics();
  const providers = getProviders();

  const openRouterAnalysis = analyzeOpenRouterKey(process.env.OPENROUTER_API_KEY);
  const geminiAnalysis = analyzeGeminiKey(process.env.GOOGLE_AI_API_KEY);

  // Build verdict
  let verdict: string;
  if (isZAiLoaded() && process.env.NODE_ENV !== 'production') {
    verdict = '✅ z-ai SDK available (sandbox). OpenRouter: ' + (openRouterAnalysis.isValid ? 'configured' : 'not set');
  } else if (openRouterAnalysis.isValid) {
    verdict = '✅ OpenRouter key detected. Check /api/ai-status?ping=true for live test.';
  } else if (geminiAnalysis.isLikelyApiKey) {
    verdict = '✅ Gemini key detected. Check /api/ai-status?ping=true for live test.';
  } else {
    verdict = '❌ No AI providers available. Set OPENROUTER_API_KEY (free from https://openrouter.ai/keys).';
  }

  return NextResponse.json({
    codeFingerprint: {
      fingerprintVersion: FINGERPRINT,
      geminiModel: GEMINI_MODEL,
      geminiSdk: GEMINI_SDK,
      zaiExcludedInProd: ZAI_EXCLUDED_IN_PROD,
      openrouterDefaultModel: OPENROUTER_DEFAULT_MODEL,
    },
    keyAnalysis: {
      openrouter: { format: openRouterAnalysis.format, isValid: openRouterAnalysis.isValid, advice: openRouterAnalysis.advice },
      gemini: { format: geminiAnalysis.format, isLikelyOAuth: geminiAnalysis.isLikelyOAuth, isLikelyApiKey: geminiAnalysis.isLikelyApiKey, advice: geminiAnalysis.advice },
    },
    ...diagnostics,
    providerChain: providers.map(p => p.name),
    providerCount: providers.length,
    verdict,
  });
}
