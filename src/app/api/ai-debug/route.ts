// ========================================
// AI Provider Diagnostics (no API calls)
// ========================================
// GET /api/ai-debug
// Returns env-var presence, provider chain, AND runtime code fingerprint.
// This endpoint lets you verify EXACTLY what code Railway is running.

import { NextResponse } from 'next/server';
import { getProviders, getProviderDiagnostics } from '@/lib/ai-providers';

// ── Runtime code fingerprint (compiled into the bundle at build time) ──
const GROQ_MODEL = 'llama-4-scout-17b-16e-instruct';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_SDK = '@google/genai';
const ZAI_EXCLUDED_IN_PROD = true;
const OPENROUTER_MODELS = ['cohere/north-mini-code:free', 'poolside/laguna-s-2.1:free', 'inclusionai/ling-3.0-flash:free'];
const FINGERPRINT = 'v5-openrouter-2026-08-18';

function analyzeGeminiKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Set GOOGLE_AI_API_KEY in Railway, then redeploy.' };
  if (value.startsWith('AIzaSy')) return { format: 'AIzaSy... (permanent API key)', isLikelyOAuth: false, isLikelyApiKey: true, advice: '✅ Correct format.' };
  if (value.startsWith('AQ.')) return { format: 'AQ.... (OAuth token)', isLikelyOAuth: true, isLikelyApiKey: false, advice: '❌ OAuth token (~1hr). Get real key at https://aistudio.google.com/apikey' };
  if (value.length < 20) return { format: `TOO_SHORT(${value.length} chars)`, isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Key too short. Check for truncation.' };
  return { format: `${value.slice(0, 6)}...${value.slice(-4)}`, isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Unknown format. Should start with AIzaSy.' };
}

function analyzeGroqKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isLikelyApiKey: false, advice: 'Set GROQ_API_KEY in Railway.' };
  if (value.startsWith('gsk_')) return { format: 'gsk_... (valid format)', isLikelyApiKey: true, advice: '✅ Format OK. If 403, key may be revoked. Check https://console.groq.com/keys' };
  return { format: `${value.slice(0, 6)}...${value.slice(-4)}`, isLikelyApiKey: false, advice: 'Unknown format. Should start with gsk_.' };
}

function analyzeOpenRouterKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isLikelyApiKey: false, advice: 'Set OPENROUTER_API_KEY in Railway. Get free key at https://openrouter.ai/keys (no credit card needed).' };
  if (value.startsWith('sk-or-')) return { format: 'sk-or-... (OpenRouter key)', isLikelyApiKey: true, advice: '✅ Correct format.' };
  return { format: `${value.slice(0, 8)}...${value.slice(-4)}`, isLikelyApiKey: false, advice: 'Unknown format. Should start with sk-or-.' };
}

export async function GET() {
  const diagnostics = getProviderDiagnostics();
  const providers = getProviders();

  const geminiAnalysis = analyzeGeminiKey(process.env.GOOGLE_AI_API_KEY);
  const groqAnalysis = analyzeGroqKey(process.env.GROQ_API_KEY);
  const openrouterAnalysis = analyzeOpenRouterKey(process.env.OPENROUTER_API_KEY);

  // Build verdict
  let verdict: string;
  if (openrouterAnalysis.isLikelyApiKey) {
    verdict = '✅ OpenRouter key detected — should work with free models. Check /api/ai-status for live test.';
  } else if (geminiAnalysis.isLikelyOAuth) {
    verdict = '❌ GEMINI KEY IS AN OAUTH TOKEN. Get real key at https://aistudio.google.com/apikey';
  } else if (!diagnostics.env.OPENROUTER_API_KEY && !diagnostics.env.GROQ_API_KEY && !diagnostics.env.GOOGLE_AI_API_KEY) {
    verdict = '❌ No AI keys detected. Easiest fix: get a FREE OpenRouter key at https://openrouter.ai/keys → set OPENROUTER_API_KEY in Railway → redeploy.';
  } else {
    verdict = 'Keys detected — if still failing, check /api/ai-status for per-provider errors.';
  }

  return NextResponse.json({
    codeFingerprint: {
      fingerprintVersion: FINGERPRINT,
      openrouterModels: OPENROUTER_MODELS,
      groqModel: GROQ_MODEL,
      geminiModel: GEMINI_MODEL,
      geminiSdk: GEMINI_SDK,
      zaiExcludedInProd: ZAI_EXCLUDED_IN_PROD,
    },
    keyAnalysis: {
      openrouter: { format: openrouterAnalysis.format, isLikelyApiKey: openrouterAnalysis.isLikelyApiKey, advice: openrouterAnalysis.advice },
      groq: { format: groqAnalysis.format, isLikelyApiKey: groqAnalysis.isLikelyApiKey, advice: groqAnalysis.advice },
      gemini: { format: geminiAnalysis.format, isLikelyOAuth: geminiAnalysis.isLikelyOAuth, isLikelyApiKey: geminiAnalysis.isLikelyApiKey, advice: geminiAnalysis.advice },
    },
    ...diagnostics,
    providerChain: providers.map(p => p.name),
    providerCount: providers.length,
    verdict,
  });
}
