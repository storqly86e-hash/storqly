// ========================================
// AI Provider Abstraction Layer
// ========================================
// Provider chain:
//   1. z-ai (sandbox-only, local dev)
//   2. Gemini (disabled until valid API key is configured)

import { GoogleGenAI } from '@google/genai';

// ─── Provider Interface ───────────────────────────────────────

export interface ProviderCallOptions {
  messages: Array<{ role: 'assistant' | 'user'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeout?: number;
}

export interface AIProvider {
  readonly name: string;
  /** Make a chat completion call. Returns trimmed content string. */
  call(options: ProviderCallOptions): Promise<string>;
  /** Reset any internal state (e.g., auth tokens) */
  reset(): void;
}

// ─── Error classification ──────────────────────────────────────

export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('Too many requests') || msg.includes('rate.limit');
}

export function isTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('timed out') || msg.includes('ETIMEDOUT') || msg.includes('Timeout');
}

export function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('401') || msg.includes('missing X-Token') || msg.includes('unauthorized') || msg.includes('Unauthorized') || msg.includes('API_KEY_INVALID');
}

// ─── z-ai Provider (Sandbox-only, gracefully disabled in production) ──

// Detect if z-ai SDK is available (only in Z.ai sandbox)
let zaiCreate: (() => Promise<unknown>) | null = null;
try {
  // Dynamic require: ESLint complains about this, but it's intentional.
  // The z-ai SDK may not be installed or may fail to load in production.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('z-ai-web-dev-sdk');
  if (mod?.default?.create) {
    zaiCreate = mod.default.create;
  }
} catch {
  zaiCreate = null;
}

export function isZAiLoaded(): boolean {
  return !!zaiCreate;
}

class ZAIProvider implements AIProvider {
  readonly name = 'z-ai';
  private instance: Awaited<ReturnType<typeof zaiCreate>> | null = null;
  private available = true;

  private async getInstance(): Promise<unknown> {
    if (!zaiCreate || !this.available) {
      throw new Error('z-ai SDK not available in this environment');
    }
    if (!this.instance) {
      try {
        this.instance = await zaiCreate();
      } catch {
        this.available = false;
        throw new Error('z-ai SDK initialization failed');
      }
    }
    return this.instance;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 30_000 } = options;

    // Try with existing instance, then with fresh instance on 401/auth errors
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const zai = await this.getInstance() as {
          chat: {
            completions: {
              create(opts: Record<string, unknown>): Promise<{ choices: Array<{ message?: { content?: string } }> }>;
            }
          }
        };

        const completion = await Promise.race([
          zai.chat.completions.create({
            messages,
            temperature,
            thinking: { type: 'disabled' },
            ...(maxTokens ? { max_tokens: maxTokens } : {}),
            ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
          ),
        ]);

        const content = completion.choices[0]?.message?.content;
        if (!content || content.trim().length === 0) throw new Error('Empty response');
        return content.trim();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        // On auth error (401), refresh the instance and retry once
        if ((msg.includes('401') || msg.includes('authentication') || msg.includes('unauthorized')) && attempt === 0) {
          console.warn('[ZAI Provider] Auth error, refreshing instance and retrying...');
          this.instance = null;
          this.available = true;
          continue;
        }
        throw err;
      }
    }
    throw new Error('z-ai: Unexpected loop exit');
  }

  reset() {
    this.instance = null;
    this.available = true;
  }
}

// ─── Google AI Studio / Gemini Provider (DISABLED — no valid key) ──
// Will be re-enabled when a valid GOOGLE_AI_API_KEY (starting with 'AIzaSy') is configured.

class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey || apiKey === 'placeholder') throw new Error('GOOGLE_AI_API_KEY not configured');

      // Validate key format: Gemini API keys MUST start with 'AIzaSy'.
      if (!apiKey.startsWith('AIzaSy')) {
        throw new Error(
          `GOOGLE_AI_API_KEY has invalid format (starts with '${apiKey.slice(0, 6)}'). ` +
          `Gemini API keys must start with 'AIzaSy'. Get one at https://aistudio.google.com/apikey.`,
        );
      }

      this.client = new GoogleGenAI({
        apiKey,
        googleAuthOptions: { scopes: [] },
      });
    }
    return this.client;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const ai = this.getClient();
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 30_000 } = options;

    let systemInstruction: string | undefined;
    const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && geminiContents.length === 0) {
        systemInstruction = msg.content;
      } else {
        geminiContents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        });
      }
    }

    const config: Record<string, unknown> = {};
    if (systemInstruction) config.systemInstruction = systemInstruction;
    if (jsonMode) config.responseMimeType = 'application/json';
    if (temperature !== undefined) config.temperature = temperature;
    if (maxTokens) config.maxOutputTokens = maxTokens;

    const response = await Promise.race([
      ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: geminiContents,
        ...(Object.keys(config).length > 0 ? { config } : {}),
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeout)
      ),
    ]);

    const content = response.text;
    if (!content || content.trim().length === 0) throw new Error('Empty response');
    return content.trim();
  }

  reset() {
    this.client = null;
  }
}

// ─── Provider Chain Management ─────────────────────────────────

let providers: AIProvider[] | null = null;

function createProviders(): AIProvider[] {
  if (providers) return providers;

  const chain: AIProvider[] = [];

  // z-ai: ONLY in sandbox (non-production) environments where the SDK backend is reachable.
  if (zaiCreate && process.env.NODE_ENV !== 'production') {
    chain.push(new ZAIProvider());
  }

  // Gemini: ONLY enabled when a valid API key is configured.
  // Disabled by default — no key means no fallback to a broken provider.
  if (process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY !== 'placeholder' && process.env.GOOGLE_AI_API_KEY.startsWith('AIzaSy')) {
    chain.push(new GeminiProvider());
  }

  if (chain.length === 0) {
    console.error('[AI Providers] CRITICAL: No AI providers configured!');
    console.error(`[AI Providers]   z-ai SDK: ${zaiCreate ? 'loaded (sandbox only)' : 'not available'}`);
    console.error(`[AI Providers]   GOOGLE_AI_API_KEY: ${process.env.GOOGLE_AI_API_KEY ? 'set (' + process.env.GOOGLE_AI_API_KEY.slice(0, 8) + '...)' : 'NOT SET'}`);
    console.error('[AI Providers] Fix: Provide a valid GOOGLE_AI_API_KEY (starts with AIzaSy).');
  }

  providers = chain;
  const details = chain.map(p => {
    if (p.name === 'gemini') {
      const k = process.env.GOOGLE_AI_API_KEY;
      return `gemini(key=${k?.slice(0, 8)}..., format=${k?.startsWith('AIzaSy') ? 'VALID' : 'SUSPECT'})`;
    }
    return p.name;
  });
  console.log(`[AI Providers] Initialized ${chain.length} providers: ${details.join(' → ')}`);
  return chain;
}

/** Get the ordered provider chain */
export function getProviders(): AIProvider[] {
  return createProviders();
}

/** Reset all provider instances (e.g., on auth errors) */
export function resetAllProviders(): void {
  for (const p of getProviders()) {
    try { p.reset(); } catch { /* ignore */ }
  }
}

/** Diagnostic info (no API calls) — useful for debugging env-var issues on deploy */
export function getProviderDiagnostics(): {
  env: Record<string, boolean | string>;
  zaiSdkLoaded: boolean;
  nodeEnv: string;
} {
  const maskKey = (v: string | undefined) => {
    if (!v || v === 'placeholder') return false;
    if (v.length < 8) return `TOO_SHORT(${v.length}chars)`;
    return `${v.slice(0, 4)}...${v.slice(-4)}`;
  };
  return {
    env: {
      GOOGLE_AI_API_KEY: maskKey(process.env.GOOGLE_AI_API_KEY),
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
    },
    zaiSdkLoaded: !!zaiCreate,
    nodeEnv: process.env.NODE_ENV || 'not set',
  };
}
