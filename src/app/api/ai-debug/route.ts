// ========================================
// AI Provider Diagnostics (no API calls)
// ========================================
// GET /api/ai-debug
// Returns env-var presence, provider chain, AND runtime code fingerprint.
// This endpoint lets you verify EXACTLY what code Railway is running.

import { NextResponse } from 'next/server';
import { getProviders, getProviderDiagnostics } from '@/lib/ai-providers';

// ── Runtime code fingerprint (compiled into the bundle at build time) ──
const GROQ_MODEL = 'qwen/qwen3.6-27b';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_SDK = '@google/genai';
const ZAI_EXCLUDED_IN_PROD = true;
const FINGERPRINT = 'v7-groq-primary-no-openrouter-2026-08-20';

function analyzeGroqKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isLikelyApiKey: false, advice: 'Set GROQ_API_KEY in Railway. Get a key at https://console.groq.com/keys' };
  if (value.startsWith('gsk_')) return { format: 'gsk_... (valid format)', isLikelyApiKey: true, advice: '✅ Format OK. If 403, key may be revoked. Check https://console.groq.com/keys' };
  return { format: `${value.slice(0, 6)}...${value.slice(-4)}`, isLikelyApiKey: false, advice: 'Unknown format. Should start with gsk_.' };
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

  const groqAnalysis = analyzeGroqKey(process.env.GROQ_API_KEY);
  const geminiAnalysis = analyzeGeminiKey(process.env.GOOGLE_AI_API_KEY);

  // Build verdict
  let verdict: string;
  if (groqAnalysis.isLikelyApiKey) {
    verdict = '✅ Groq key detected as primary provider. Check /api/ai-status?ping=true for live test.';
  } else if (!diagnostics.env.GROQ_API_KEY && !diagnostics.env.GOOGLE_AI_API_KEY) {
    verdict = '❌ No AI keys detected. Set GROQ_API_KEY in Railway. Get one at https://console.groq.com/keys';
  } else {
    verdict = 'Keys detected — if still failing, check /api/ai-status for per-provider errors.';
  }

  return NextResponse.json({
    codeFingerprint: {
      fingerprintVersion: FINGERPRINT,
      groqModel: GROQ_MODEL,
      geminiModel: GEMINI_MODEL,
      geminiSdk: GEMINI_SDK,
      zaiExcludedInProd: ZAI_EXCLUDED_IN_PROD,
    },
    keyAnalysis: {
      groq: { format: groqAnalysis.format, isLikelyApiKey: groqAnalysis.isLikelyApiKey, advice: groqAnalysis.advice },
      gemini: { format: geminiAnalysis.format, isLikelyOAuth: geminiAnalysis.isLikelyOAuth, isLikelyApiKey: geminiAnalysis.isLikelyApiKey, advice: geminiAnalysis.advice },
    },
    ...diagnostics,
    providerChain: providers.map(p => p.name),
    providerCount: providers.length,
    verdict,
  });
}