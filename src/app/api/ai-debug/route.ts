// ========================================
// AI Provider Diagnostics (no API calls)
// ========================================
// GET /api/ai-debug
// Returns env-var presence, provider chain, AND runtime code fingerprint.
// This endpoint lets you verify EXACTLY what code Railway is running.

import { NextResponse } from 'next/server';
import { getProviders, getProviderDiagnostics } from '@/lib/ai-providers';

// ── Runtime code fingerprint (compiled into the bundle at build time) ──
// These strings are hardcoded in the source. If Railway returns different values,
// the deployment is running OLD code.
const GROQ_MODEL = 'llama-4-scout-17b-16e-instruct';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_SDK = '@google/genai';
const ZAI_EXCLUDED_IN_PROD = true; // true = z-ai checks NODE_ENV !== 'production'

function analyzeGeminiKey(value: string | undefined): { format: string; isLikelyOAuth: boolean; isLikelyApiKey: boolean; advice: string } {
  if (!value || value === 'placeholder') {
    return { format: 'NOT_SET', isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Set GOOGLE_AI_API_KEY in Railway, then redeploy.' };
  }
  if (value.startsWith('AIzaSy')) {
    return { format: 'AIzaSy... (permanent API key)', isLikelyOAuth: false, isLikelyApiKey: true, advice: '✅ Correct format for Google AI API key.' };
  }
  if (value.startsWith('AQ.')) {
    return {
      format: 'AQ.... (OAuth access token)',
      isLikelyOAuth: true,
      isLikelyApiKey: false,
      advice: '❌ This is a short-lived OAuth access token (~1 hour), NOT a permanent API key. ' +
        'The @google/genai SDK sends it in the x-goog-api-key header, which Google rejects for non-AIzaSy keys. ' +
        'FIX: Go to https://aistudio.google.com/apikey → click "Create API Key" → copy the AIzaSy... key → paste into Railway.' ,
    };
  }
  if (value.length < 20) {
    return { format: `TOO_SHORT(${value.length} chars)`, isLikelyOAuth: false, isLikelyApiKey: false, advice: 'This key is suspiciously short. Check for truncation in Railway env vars.' };
  }
  return { format: `${value.slice(0, 6)}...${value.slice(-4)}`, isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Unknown key format. Verify it starts with AIzaSy.' };
}

function analyzeGroqKey(value: string | undefined): { format: string; isLikelyApiKey: boolean; advice: string } {
  if (!value || value === 'placeholder') {
    return { format: 'NOT_SET', isLikelyApiKey: false, advice: 'Set GROQ_API_KEY in Railway, then redeploy.' };
  }
  if (value.startsWith('gsk_')) {
    return { format: 'gsk_... (Groq API key format)', isLikelyApiKey: true, advice: '✅ Correct format. If still getting 403, the key may be revoked/expired. Check at https://console.groq.com/keys' };
  }
  if (value.length < 20) {
    return { format: `TOO_SHORT(${value.length} chars)`, isLikelyApiKey: false, advice: 'Key too short. Check for truncation.' };
  }
  return { format: `${value.slice(0, 6)}...${value.slice(-4)}`, isLikelyApiKey: false, advice: 'Unknown format. Groq keys should start with gsk_.' };
}

export async function GET() {
  const diagnostics = getProviderDiagnostics();
  const providers = getProviders();
  const geminiKey = process.env.GOOGLE_AI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const geminiAnalysis = analyzeGeminiKey(geminiKey);
  const groqAnalysis = analyzeGroqKey(groqKey);

  return NextResponse.json({
    // ── Code Fingerprint (changes with each code update) ──
    codeFingerprint: {
      groqModel: GROQ_MODEL,
      geminiModel: GEMINI_MODEL,
      geminiSdk: GEMINI_SDK,
      zaiExcludedInProd: ZAI_EXCLUDED_IN_PROD,
      // If this says "old", the deployment did NOT pick up the latest commit.
      fingerprintVersion: 'v4-2026-08-18',
    },
    // ── Key Format Analysis ──
    keyAnalysis: {
      groq: { format: groqAnalysis.format, isLikelyApiKey: groqAnalysis.isLikelyApiKey, advice: groqAnalysis.advice },
      gemini: { format: geminiAnalysis.format, isLikelyOAuth: geminiAnalysis.isLikelyOAuth, isLikelyApiKey: geminiAnalysis.isLikelyApiKey, advice: geminiAnalysis.advice },
    },
    // ── Original diagnostics ──
    ...diagnostics,
    providerChain: providers.map(p => p.name),
    providerCount: providers.length,
    // ── Verdict ──
    verdict: geminiAnalysis.isLikelyOAuth
      ? 'GEMINI KEY IS AN OAUTH TOKEN — will NEVER work until replaced with AIzaSy... key. See keyAnalysis.gemini.advice.'
      : diagnostics.env.GROQ_API_KEY || diagnostics.env.GOOGLE_AI_API_KEY
        ? 'Keys detected — if still failing, check /api/ai-status for per-provider errors'
        : 'No AI keys detected. Set GROQ_API_KEY and/or GOOGLE_AI_API_KEY in Railway Variables, then REDEPLOY.',
  });
}
