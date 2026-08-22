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
const GLM_DEFAULT_MODEL = 'glm-4-flash';
const FINGERPRINT = 'v10-glm-primary-2026-08-22';

function analyzeGLMKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isValid: false, advice: 'Not configured. Get a free key at https://open.bigmodel.cn' };
  if (value.includes('.')) return { format: `${value.slice(0, 4)}...${value.slice(-4)}`, isValid: true, advice: '✅ Correct format ({id}.{secret}).' };
  return { format: `${value.slice(0, 8)}...`, isValid: false, advice: '❌ Invalid format. Expected {id}.{secret}.' };
}

function analyzeOpenRouterKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isValid: false, advice: 'Not configured.' };
  if (value.startsWith('sk-or-')) return { format: `${value.slice(0, 8)}...${value.slice(-4)}`, isValid: true, advice: '✅ Correct format.' };
  return { format: `${value.slice(0, 8)}...${value.slice(-4)}`, isValid: false, advice: `❌ Invalid format.` };
}

function analyzeGeminiKey(value: string | undefined) {
  if (!value || value === 'placeholder') return { format: 'NOT_SET', isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Not configured.' };
  if (value.startsWith('AIzaSy')) return { format: 'AIzaSy... (API key)', isLikelyOAuth: false, isLikelyApiKey: true, advice: '✅ Correct format.' };
  if (value.startsWith('AQ.')) return { format: 'AQ.... (OAuth token)', isLikelyOAuth: true, isLikelyApiKey: false, advice: '❌ OAuth token, not API key.' };
  return { format: `${value.slice(0, 6)}...`, isLikelyOAuth: false, isLikelyApiKey: false, advice: 'Unknown format.' };
}

export async function GET() {
  const diagnostics = getProviderDiagnostics();
  const providers = getProviders();

  const glmAnalysis = analyzeGLMKey(process.env.GLM_API_KEY);
  const orAnalysis = analyzeOpenRouterKey(process.env.OPENROUTER_API_KEY);
  const geminiAnalysis = analyzeGeminiKey(process.env.GOOGLE_AI_API_KEY);

  let verdict: string;
  if (isZAiLoaded() && process.env.NODE_ENV !== 'production') {
    verdict = '✅ z-ai SDK available (sandbox).';
  } else if (glmAnalysis.isValid) {
    verdict = '✅ GLM key detected. Check /api/ai-status?ping=true for live test.';
  } else if (orAnalysis.isValid) {
    verdict = '⚠️ OpenRouter key detected (requires credits).';
  } else {
    verdict = '❌ No AI providers available. Set GLM_API_KEY (free from https://open.bigmodel.cn).';
  }

  return NextResponse.json({
    codeFingerprint: {
      fingerprintVersion: FINGERPRINT,
      geminiModel: GEMINI_MODEL,
      geminiSdk: GEMINI_SDK,
      zaiExcludedInProd: ZAI_EXCLUDED_IN_PROD,
      glmDefaultModel: GLM_DEFAULT_MODEL,
    },
    keyAnalysis: {
      glm: { format: glmAnalysis.format, isValid: glmAnalysis.isValid, advice: glmAnalysis.advice },
      openrouter: { format: orAnalysis.format, isValid: orAnalysis.isValid },
      gemini: { format: geminiAnalysis.format, isLikelyOAuth: geminiAnalysis.isLikelyOAuth, isLikelyApiKey: geminiAnalysis.isLikelyApiKey, advice: geminiAnalysis.advice },
    },
    ...diagnostics,
    providerChain: providers.map(p => p.name),
    providerCount: providers.length,
    verdict,
  });
}
