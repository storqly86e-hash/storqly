// ========================================
// AI Provider Abstraction Layer
// ========================================
// Multi-provider failover chain:
//   1. z-ai (sandbox-only, local dev)
//   2. OpenRouter (free models — primary for production)
//   3. GROQ (backup, if key valid)
//   4. Gemini (backup, if key valid)

import Groq from 'groq-sdk';
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

// ─── z-ai Provider (Sandbox-only, gracefully disabled on Render) ──

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
    const zai = await this.getInstance() as {
      chat: {
        completions: {
          create(opts: Record<string, unknown>): Promise<{ choices: Array<{ message?: { content?: string } }> }>;
        }
      }
    };
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 30_000 } = options;

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
  }

  reset() {
    this.instance = null;
  }
}

// ─── OpenRouter Provider (Free models — Primary for production) ──
// OpenAI-compatible API at https://openrouter.ai/api/v1
// Free models: cohere/north-mini-code, poolside/laguna-s-2.1, inclusionai/ling-3.0-flash
// Rate limits: 50 req/day (free account), 1000 req/day ($10 credit)

const OPENROUTER_MODELS = [
  'inclusionai/ling-3.0-flash:free',     // General-purpose (best for marketing)
  'google/gemma-3-27b-it:free',           // Google's Gemma 3 27B
  'meta-llama/llama-4-scout-17b-16e-instruct:free',  // Meta's Llama 4
  'cohere/north-mini-code:free',          // Code specialist
  'deepseek/deepseek-chat-v3-0324:free',  // DeepSeek V3
] as const;

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter';
  private lastWorkingModel = 0; // index into OPENROUTER_MODELS

  private getApiKey(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key || key === 'placeholder') throw new Error('OPENROUTER_API_KEY not configured');
    return key;
  }

  private async callWithParams(
    options: ProviderCallOptions,
    useJsonMode: boolean,
  ): Promise<string> {
    const apiKey = this.getApiKey();
    const { messages, temperature = 0.7, maxTokens, timeout = 30_000 } = options;

    // Convert messages: treat first 'assistant' message as system prompt
    const openaiMessages: Array<{ role: string; content: string }> = [];
    for (const msg of messages) {
      if (msg.role === 'assistant' && openaiMessages.length === 0) {
        openaiMessages.push({ role: 'system', content: msg.content });
      } else {
        openaiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: OPENROUTER_MODELS[this.lastWorkingModel],
      messages: openaiMessages,
      temperature,
      max_tokens: maxTokens || 8000,
      ...(useJsonMode ? { response_format: { type: 'json_object' } } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://storqly.com',
          'X-Title': 'Storqly',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const errStr = errBody.substring(0, 300);

        // If rate-limited on this model, try next model
        if (response.status === 429 && this.lastWorkingModel < OPENROUTER_MODELS.length - 1) {
          this.lastWorkingModel++;
          console.warn(`[OpenRouter] Rate limited on ${body.model}, falling back to ${OPENROUTER_MODELS[this.lastWorkingModel]}`);
          return this.callWithParams(options, useJsonMode);
        }

        // If 400 and json_mode is on, model might not support response_format — retry without it
        if (response.status === 400 && useJsonMode && errStr.includes('response_format')) {
          console.warn(`[OpenRouter] ${body.model} does not support response_format, retrying without json_mode`);
          return this.callWithParams({ ...options, jsonMode: false }, false);
        }

        throw new Error(`OpenRouter ${response.status}: ${errStr.substring(0, 200)}`);
      }

      const data = await response.json() as {
        choices: Array<{ message?: { content?: string } }>;
        error?: { message: string };
      };

      if (data.error) {
        throw new Error(`OpenRouter error: ${data.error.message}`);
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content || content.trim().length === 0) throw new Error('Empty response');
      return content.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  async call(options: ProviderCallOptions): Promise<string> {
    return this.callWithParams(options, !!options.jsonMode);
  }

  reset() {
    this.lastWorkingModel = 0;
  }
}

// ─── GROQ Provider (Backup 1) ──────────

class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private client: Groq | null = null;

  private getClient(): Groq {
    if (!this.client) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey || apiKey === 'placeholder') throw new Error('GROQ_API_KEY not configured');
      this.client = new Groq({ apiKey });
    }
    return this.client;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const client = this.getClient();
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 30_000 } = options;

    const completion = await Promise.race([
      client.chat.completions.create({
        model: 'llama-4-scout-17b-16e-instruct',
        messages: messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
        temperature,
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
  }

  reset() {
    this.client = null;
  }
}

// ─── Google AI Studio / Gemini Provider (Backup 2) ──

class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey || apiKey === 'placeholder') throw new Error('GOOGLE_AI_API_KEY not configured');
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const ai = this.getClient();
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 30_000 } = options;

    // Gemini uses a different message format: system instruction + user/assistant history
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

  // OpenRouter: primary for production — free models, no credit card needed.
  // Get your key at https://openrouter.ai/keys
  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'placeholder') {
    chain.push(new OpenRouterProvider());
  }

  // GROQ: add if API key is configured
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'placeholder') {
    chain.push(new GroqProvider());
  }

  // Gemini: add if API key is configured
  if (process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY !== 'placeholder') {
    chain.push(new GeminiProvider());
  }

  if (chain.length === 0) {
    console.warn('[AI Providers] WARNING: No AI providers configured! Store generation will fail.');
    console.warn('[AI Providers] OPENROUTER_API_KEY (free) or GROQ_API_KEY or GOOGLE_AI_API_KEY needed.');
  }

  providers = chain;
  console.log(`[AI Providers] Initialized ${chain.length} providers: ${chain.map(p => p.name).join(' → ')}`);
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
  openrouterModels: readonly string[];
} {
  const maskKey = (v: string | undefined) => {
    if (!v || v === 'placeholder') return false;
    if (v.length < 8) return `TOO_SHORT(${v.length}chars)`;
    return `${v.slice(0, 4)}...${v.slice(-4)}`;
  };
  return {
    env: {
      OPENROUTER_API_KEY: maskKey(process.env.OPENROUTER_API_KEY),
      GROQ_API_KEY: maskKey(process.env.GROQ_API_KEY),
      GOOGLE_AI_API_KEY: maskKey(process.env.GOOGLE_AI_API_KEY),
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
    },
    zaiSdkLoaded: !!zaiCreate,
    nodeEnv: process.env.NODE_ENV || 'not set',
    openrouterModels: [...OPENROUTER_MODELS],
  };
}
