// ========================================
// AI Provider Abstraction Layer
// ========================================
// Multi-provider failover: z-ai (primary), GROQ (backup 1), Gemini (backup 2).
// Each provider implements the same interface. The orchestrator tries
// providers in order, switching on 429/timeout/persistent failures.

import ZAI from 'z-ai-web-dev-sdk';
import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// ─── z-ai Provider (Primary) ──────────────────────────────────

class ZAIProvider implements AIProvider {
  readonly name = 'z-ai';
  private instance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

  private async getInstance(): Promise<Awaited<ReturnType<typeof ZAI.create>>> {
    if (!this.instance) {
      this.instance = await ZAI.create();
    }
    return this.instance;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const zai = await this.getInstance();
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

// ─── GROQ Provider (Backup 1) ──────────────────────────────────

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
        model: 'llama-3.3-70b-versatile',
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

// ─── Google AI Studio / Gemini Provider (Backup 2) ─────────────

class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private client: GoogleGenerativeAI | null = null;

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey || apiKey === 'placeholder') throw new Error('GOOGLE_AI_API_KEY not configured');
      this.client = new GoogleGenerativeAI(apiKey);
    }
    return this.client;
  }

  async call(options: ProviderCallOptions): Promise<string> {
    const genAI = this.getClient();
    const { messages, temperature = 0.7, maxTokens, jsonMode, timeout = 30_000 } = options;

    // Gemini uses a different message format: system instruction + user/assistant history
    // The orchestrator sends system prompts as role:'assistant' (z-ai convention),
    // so we need to extract and convert.
    let systemInstruction: string | undefined;
    const geminiContents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'assistant' && geminiContents.length === 0) {
        // First 'assistant' message is actually the system prompt in our convention
        systemInstruction = msg.content;
      } else {
        geminiContents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
        });
      }
    }

    // Use gemini-2.0-flash for speed + JSON support
    // Build a single generationConfig that merges json mode, temperature, and max tokens
    const generationConfig: Record<string, unknown> = {};
    if (jsonMode) generationConfig.responseMimeType = 'application/json';
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (maxTokens) generationConfig.maxOutputTokens = maxTokens;

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      ...(systemInstruction ? { systemInstruction } : {}),
      ...(Object.keys(generationConfig).length > 0 ? { generationConfig } : {}),
    });

    const completion = await Promise.race([
      model.generateContent({ contents: geminiContents }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Request timed out')), timeout)
      ),
    ]);

    const content = completion.response.text();
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

  const chain: AIProvider[] = [
    new ZAIProvider(),
  ];

  // Add GROQ if API key is configured
  if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'placeholder') {
    chain.push(new GroqProvider());
  }

  // Add Gemini if API key is configured
  if (process.env.GOOGLE_AI_API_KEY && process.env.GOOGLE_AI_API_KEY !== 'placeholder') {
    chain.push(new GeminiProvider());
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
