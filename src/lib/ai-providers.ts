// ========================================
// AI Provider Abstraction Layer
// ========================================
// Provider chain (production):
//   1. GLM / Zhipu AI (primary — requires balance on platform)
//   2. Gemini (secondary — genuinely FREE, 15 RPM)
//   3. OpenRouter (fallback, requires credits)
//
// Provider chain (sandbox / local dev):
//   1. z-ai (sandbox-only, fastest)
//   2. GLM (fallback)
//   3. Gemini (if valid key)
//   4. OpenRouter (fallback)

import { GoogleGenAI } from '@google/genai';
import { createHmac } from 'crypto';

// ─── Provider Interface ───────────────────────────────────────

export interface ProviderCallOptions {
  messages: Array<{ role: 'assistant' | 'user'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeout?: number;
  /** Enable chain-of-thought for complex reasoning tasks */
  thinking?: boolean;
}

export interface AIProvider {
  readonly name: string;
  /** Make a chat completion call. Returns trimmed content string. */
  call(options: ProviderCallOptions): Promise<string>;
  /** Reset any internal state (e.g., auth tokens) */
  reset(): void;
}

/** Streaming options (for marketing-kit SSE) */
export interface StreamOptions {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  onDelta: (text: string) => void;
  timeout?: number;
  signal?: AbortSignal;
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
  return msg.includes('401') || msg.includes('missing X-Token') || msg.includes('unauthorized') || msg.includes('Unauthorized') || msg.includes('API_KEY_INVALID') || msg.includes('invalid_api_key');
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
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 60_000, thinking } = options;

    // Try with existing instance, then with fresh instance on 401/auth errors
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const zai = await this.getInstance() as {
          chat: {
            completions: {
              create(opts: Record<string, unknown>): Promise<{ choices: Array<{ message?: { content?: string } }> }> };
          }
        };

        const completion = await Promise.race([
          zai.chat.completions.create({
            messages,
            temperature,
            thinking: thinking ? { type: 'enabled', budget_tokens: 2000 } : { type: 'disabled' },
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

// ─── GLM / Zhipu AI Provider (Production — requires balance/resource package) ──────────
// API: OpenAI-compatible at https://open.bigmodel.cn/api/paas/v4/chat/completions
// Auth: JWT token generated from API key (format: {id}.{secret})
// NOTE: As of 2026-08, old models (glm-4-flash, glm-4-air, etc.) are DEPRECATED.
//       New models: glm-4.5, glm-4.5-air, glm-5, glm-5.3 etc.
//       ALL models require a valid resource package or balance on the Zhipu AI platform.
// Get a key at https://open.bigmodel.cn

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const DEFAULT_GLM_MODEL = 'glm-4.5-air';

const GLM_FALLBACK_MODELS = [
  'glm-4.5',
  'glm-4.6',
  'glm-5-turbo',
  'glm-5.1',
];

/** Generate a Zhipu AI JWT token from an API key (format: {id}.{secret}) */
function generateGLMToken(apiKey: string): string {
  const dotIndex = apiKey.indexOf('.');
  if (dotIndex === -1) throw new Error('GLM_API_KEY invalid format: expected {id}.{secret}');

  const id = apiKey.slice(0, dotIndex);
  const secret = apiKey.slice(dotIndex + 1);

  const now = Date.now();
  const exp = now + 3600_000; // 1 hour expiry

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ api_key: id, exp, timestamp: now })).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

class GLMProvider implements AIProvider {
  readonly name = 'glm';
  private _apiKey: string | null = null;
  private _token: string | null = null;
  private _tokenExpiry = 0;

  private getApiKey(): string {
    if (!this._apiKey) {
      const key = process.env.GLM_API_KEY;
      if (!key || key === 'placeholder') {
        throw new Error('GLM_API_KEY not configured. Get a free key at https://open.bigmodel.cn');
      }
      if (!key.includes('.')) {
        throw new Error('GLM_API_KEY invalid format. Expected {id}.{secret}. Get one at https://open.bigmodel.cn');
      }
      this._apiKey = key;
    }
    return this._apiKey;
  }

  private getToken(): string {
    const now = Date.now();
    // Regenerate token if expired or not yet generated
    if (!this._token || now >= this._tokenExpiry) {
      this._token = generateGLMToken(this.getApiKey());
      this._tokenExpiry = now + 3500_000; // Regenerate 5 min before expiry
    }
    return this._token;
  }

  private getModel(): string {
    return process.env.GLM_MODEL || DEFAULT_GLM_MODEL;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const token = this.getToken();
    const model = this.getModel();
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 90_000 } = options;

    // Convert orchestrator message format to OpenAI format
    const openaiMessages: Array<{ role: string; content: string }> = [];
    let systemPrompt: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'assistant' && openaiMessages.length === 0) {
        systemPrompt = msg.content;
      } else {
        openaiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...openaiMessages,
      ],
      temperature,
    };

    if (maxTokens) body.max_tokens = maxTokens;
    if (jsonMode) body.response_format = { type: 'json_object' };

    // Try primary model, then fallbacks
    const modelsToTry = [model, ...GLM_FALLBACK_MODELS.filter(m => m !== model)];

    for (let mi = 0; mi < modelsToTry.length; mi++) {
      const tryModel = modelsToTry[mi];
      body.model = tryModel;

      try {
        const response = await Promise.race([
          fetch(GLM_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(body),
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
          ),
        ]);

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const errMsg = `GLM ${response.status}: ${errBody.substring(0, 300)}`;

          // Retry on 429 (rate limit / no balance) or 400 (model deprecated)
          if (mi < modelsToTry.length - 1 && (response.status === 429 || response.status === 400)) {
            console.warn(`[GLM] ${tryModel} returned ${response.status}, trying next model...`);
            continue;
          }
          throw new Error(errMsg);
        }

        const data = await response.json() as {
          choices: Array<{ message?: { content?: string } }>;
          error?: { message: string };
        };

        if (data.error) throw new Error(`GLM error: ${data.error.message}`);

        const content = data.choices?.[0]?.message?.content;
        if (!content || content.trim().length === 0) throw new Error('Empty response from GLM');

        if (mi > 0) console.log(`[GLM] ✅ Fallback model ${tryModel} succeeded`);

        return content.trim();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (mi === modelsToTry.length - 1 || (!msg.includes('429') && !msg.includes('400'))) throw err;
      }
    }

    throw new Error('GLM: all models exhausted');
  }

  reset() {
    this._token = null;
    this._tokenExpiry = 0;
  }
}

// ─── GLM Streaming (for marketing-kit SSE) ─────────────────────────

export async function streamGLM(
  options: StreamOptions,
): Promise<string | null> {
  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey || apiKey === 'placeholder' || !apiKey.includes('.')) return null;

  const model = process.env.GLM_MODEL || DEFAULT_GLM_MODEL;
  const { messages, temperature = 0.8, maxTokens, onDelta, timeout = 180_000, signal } = options;

  let token: string;
  try {
    token = generateGLMToken(apiKey);
  } catch {
    return null;
  }

  const openaiMessages: Array<{ role: string; content: string }> = [];
  let systemPrompt: string | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content;
    } else {
      openaiMessages.push(msg);
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...openaiMessages,
    ],
    temperature,
    stream: true,
  };

  if (maxTokens) body.max_tokens = maxTokens;

  try {
    const response = await Promise.race([
      fetch(GLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeout)
      ),
    ]);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[GLM Stream] ${response.status}: ${errBody.substring(0, 200)}`);
      return null;
    }

    if (!response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onDelta(delta);
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    return fullContent.trim() || null;
  } catch (err: unknown) {
    if (signal?.aborted) return null;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[GLM Stream] Error: ${msg}`);
    return null;
  }
}

// ─── OpenRouter Provider (Fallback — requires credits) ──────────

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-chat-v3-0324';

const OPENROUTER_FALLBACK_MODELS = [
  'google/gemma-3-27b-it',
  'meta-llama/llama-4-maverick',
  'qwen/qwen3-235b-a22b',
];

class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter';
  private _apiKey: string | null = null;

  private getApiKey(): string {
    if (!this._apiKey) {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key || key === 'placeholder') {
        throw new Error('OPENROUTER_API_KEY not configured');
      }
      if (!key.startsWith('sk-or-')) {
        throw new Error(`OPENROUTER_API_KEY invalid format (starts with '${key.slice(0, 6)}')`);
      }
      this._apiKey = key;
    }
    return this._apiKey;
  }

  private getModel(): string {
    return process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const apiKey = this.getApiKey();
    const model = this.getModel();
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 90_000 } = options;

    const openaiMessages: Array<{ role: string; content: string }> = [];
    let systemPrompt: string | undefined;

    for (const msg of messages) {
      if (msg.role === 'assistant' && openaiMessages.length === 0) {
        systemPrompt = msg.content;
      } else {
        openaiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model,
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        ...openaiMessages,
      ],
      temperature,
    };

    if (maxTokens) body.max_tokens = maxTokens;
    if (jsonMode) body.response_format = { type: 'json_object' };

    const modelsToTry = [model, ...OPENROUTER_FALLBACK_MODELS.filter(m => m !== model)];

    for (let mi = 0; mi < modelsToTry.length; mi++) {
      const tryModel = modelsToTry[mi];
      body.model = tryModel;

      try {
        const response = await Promise.race([
          fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://storqly.com',
              'X-Title': 'Storqly',
            },
            body: JSON.stringify(body),
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
          ),
        ]);

        if (!response.ok) {
          const errBody = await response.text().catch(() => '');
          const errMsg = `OpenRouter ${response.status}: ${errBody.substring(0, 200)}`;
          if (response.status === 429 && mi < modelsToTry.length - 1) continue;
          if (response.status === 402 && mi < modelsToTry.length - 1) continue;
          throw new Error(errMsg);
        }

        const data = await response.json() as {
          choices: Array<{ message?: { content?: string } }>;
          error?: { message: string };
        };

        if (data.error) throw new Error(`OpenRouter error: ${data.error.message}`);

        const content = data.choices?.[0]?.message?.content;
        if (!content || content.trim().length === 0) throw new Error('Empty response from OpenRouter');

        return content.trim();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (mi === modelsToTry.length - 1 || (!msg.includes('429') && !msg.includes('402'))) throw err;
      }
    }

    throw new Error('OpenRouter: all models exhausted');
  }

  reset() {
    this._apiKey = null;
  }
}

// ─── OpenRouter Streaming (for marketing-kit SSE fallback) ─────────

export async function streamOpenRouter(
  options: StreamOptions,
): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'placeholder' || !apiKey.startsWith('sk-or-')) return null;

  const model = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const { messages, temperature = 0.8, maxTokens, onDelta, timeout = 180_000, signal } = options;

  const openaiMessages: Array<{ role: string; content: string }> = [];
  let systemPrompt: string | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content;
    } else {
      openaiMessages.push(msg);
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...openaiMessages,
    ],
    temperature,
    stream: true,
  };

  if (maxTokens) body.max_tokens = maxTokens;

  try {
    const response = await Promise.race([
      fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://storqly.com',
          'X-Title': 'Storqly',
        },
        body: JSON.stringify(body),
        signal,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeout)
      ),
    ]);

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      console.error(`[OpenRouter Stream] ${response.status}: ${errBody.substring(0, 200)}`);
      return null;
    }

    if (!response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onDelta(delta);
          }
        } catch { /* skip malformed chunks */ }
      }
    }

    return fullContent.trim() || null;
  } catch (err: unknown) {
    if (signal?.aborted) return null;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[OpenRouter Stream] Error: ${msg}`);
    return null;
  }
}

// ─── Google AI Studio / Gemini Provider (secondary, if key available) ──

const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
  'gemini-2.5-pro-preview-05-06',
];

class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey || apiKey === 'placeholder') throw new Error('GOOGLE_AI_API_KEY not configured');
      if (apiKey.length < 20) {
        throw new Error(
          `GOOGLE_AI_API_KEY too short (${apiKey.length} chars). Expected 30+ chars.`,
        );
      }
      this.client = new GoogleGenAI({ apiKey, googleAuthOptions: { scopes: [] } });
    }
    return this.client;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const ai = this.getClient();
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 60_000 } = options;

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

    // Try multiple Gemini models (Google deprecates/renames models frequently)
    let lastError: unknown = null;
    for (const model of GEMINI_MODELS) {
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model,
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
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        lastError = err;
        // If model not found (404), try next model
        if (msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND')) {
          console.warn('[Gemini] Model ' + model + ' not found, trying next...');
          continue;
        }
        throw err;
      }
    }
    throw lastError || new Error('Gemini: all models exhausted');
  }

  reset() {
    this.client = null;
  }
}

// ─── Gemini Streaming (for marketing-kit SSE — FREE) ──────────

export async function streamGemini(
  options: StreamOptions,
): Promise<string | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey || apiKey === 'placeholder' || apiKey.length < 20) return null;

  const { messages, temperature = 0.8, maxTokens, onDelta, timeout = 180_000, signal } = options;

  let systemInstruction: string | undefined;
  const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
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
  config.temperature = temperature;
  if (maxTokens) config.maxOutputTokens = maxTokens;

  try {
    const ai = new GoogleGenAI({ apiKey, googleAuthOptions: { scopes: [] } });

    // Try multiple Gemini models for streaming
    for (const model of GEMINI_MODELS) {
      try {
        const response = await Promise.race([
          ai.models.generateContentStream({
            model,
            contents: geminiContents,
            config,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), timeout)
          ),
        ]);

        let fullContent = '';
        for await (const chunk of response) {
          if (signal?.aborted) return null;
          const text = chunk.text;
          if (text) {
            fullContent += text;
            onDelta(text);
          }
        }

        return fullContent.trim() || null;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('404') || msg.includes('not found') || msg.includes('NOT_FOUND')) {
          console.warn('[Gemini Stream] Model ' + model + ' not found, trying next...');
          continue;
        }
        if (signal?.aborted) return null;
        console.error('[Gemini Stream] Error with ' + model + ': ' + msg);
        return null;
      }
    }
    return null;
  } catch (err: unknown) {
    if (signal?.aborted) return null;
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Gemini Stream] Error: ' + msg);
    return null;
  }
}

// ─── Provider Chain Management ─────────────────────────────────

let providers: AIProvider[] | null = null;

function createProviders(): AIProvider[] {
  if (providers) return providers;

  const chain: AIProvider[] = [];

  // z-ai: ONLY in sandbox (non-production) environments.
  if (zaiCreate && process.env.NODE_ENV !== 'production') {
    chain.push(new ZAIProvider());
  }

  // GLM / Zhipu AI: Primary production provider. Requires balance/resource package.
  // Requires GLM_API_KEY (format: {id}.{secret}) — https://open.bigmodel.cn
  const glmKey = process.env.GLM_API_KEY;
  if (glmKey && glmKey !== 'placeholder' && glmKey.includes('.')) {
    chain.push(new GLMProvider());
  }

  // Gemini: FREE secondary (15 RPM free tier, no credits ever needed).
  // Requires GOOGLE_AI_API_KEY — https://aistudio.google.com/apikey
  const gemKey = process.env.GOOGLE_AI_API_KEY;
  if (gemKey && gemKey !== 'placeholder' && gemKey.length >= 20) {
    chain.push(new GeminiProvider());
  }

  // OpenRouter: Last resort fallback (requires paid credits).
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey && orKey !== 'placeholder' && orKey.startsWith('sk-or-')) {
    chain.push(new OpenRouterProvider());
  }

  if (chain.length === 0) {
    console.error('[AI Providers] CRITICAL: No AI providers configured!');
    console.error(`[AI Providers]   z-ai SDK: ${zaiCreate ? 'loaded (sandbox only)' : 'not available'}`);
    console.error(`[AI Providers]   GLM_API_KEY: ${glmKey ? 'set' : 'NOT SET'}`);
    console.error(`[AI Providers]   GOOGLE_AI_API_KEY: ${gemKey ? 'set' : 'NOT SET'}`);
    console.error(`[AI Providers]   OPENROUTER_API_KEY: ${orKey ? 'set' : 'NOT SET'}`);
    console.error('[AI Providers] Fix: Set GOOGLE_AI_API_KEY (free from https://aistudio.google.com/apikey)');
  }

  providers = chain;
  const details = chain.map(p => {
    if (p.name === 'glm') {
      const k = process.env.GLM_API_KEY;
      const m = process.env.GLM_MODEL || DEFAULT_GLM_MODEL;
      return `glm(key=${k?.slice(0, 4)}..., model=${m})`;
    }
    if (p.name === 'openrouter') {
      const k = process.env.OPENROUTER_API_KEY;
      const m = process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
      return `openrouter(key=${k?.slice(0, 8)}..., model=${m})`;
    }
    if (p.name === 'gemini') {
      const k = process.env.GOOGLE_AI_API_KEY;
      return `gemini(key=${k?.slice(0, 8)}...)`;
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
  providers = null;
}

/** Diagnostic info (no API calls) */
export function getProviderDiagnostics(): {
  env: Record<string, boolean | string>;
  zaiSdkLoaded: boolean;
  nodeEnv: string;
  glmModel: string;
  openrouterModel: string;
} {
  const maskKey = (v: string | undefined, minLen = 8) => {
    if (!v || v === 'placeholder') return false;
    if (v.length < minLen) return `TOO_SHORT(${v.length}chars)`;
    return `${v.slice(0, 4)}...${v.slice(-4)}`;
  };
  return {
    env: {
      GLM_API_KEY: maskKey(process.env.GLM_API_KEY),
      OPENROUTER_API_KEY: maskKey(process.env.OPENROUTER_API_KEY),
      GOOGLE_AI_API_KEY: maskKey(process.env.GOOGLE_AI_API_KEY),
      DATABASE_URL: !!process.env.DATABASE_URL,
      NEXTAUTH_SECRET: !!process.env.NEXTAUTH_SECRET,
      NEXTAUTH_URL: !!process.env.NEXTAUTH_URL,
    },
    zaiSdkLoaded: !!zaiCreate,
    nodeEnv: process.env.NODE_ENV || 'not set',
    glmModel: process.env.GLM_MODEL || DEFAULT_GLM_MODEL,
    openrouterModel: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
  };
}
