// ========================================
// Marketing Kit Generator API — Streaming
// ========================================
// Streams the AI response token-by-token to the client.
// Supports auto-continue: if the proxy kills the connection mid-stream,
// the client sends continueFrom=<partial> and the AI picks up where it left off.
//
// Provider priority: z-ai (sandbox) → OpenRouter (free, production primary) → GROQ → Gemini (fallback)
// Auth guard: returns 401 JSON before creating the SSE stream.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, authErrorResponse } from '@/lib/auth-utils';

const TIMEOUT_MS = 180_000;

const SYSTEM_PROMPT = `You are a world-class business strategist and direct-response copywriter. You produce comprehensive, actionable marketing and business documents.

OUTPUT RULES:
1. Use well-structured Markdown with clear headings (##, ###), bullet lists, numbered lists, and tables where appropriate.
2. Be specific and actionable — include real examples, exact copy, and concrete numbers.
3. Organize content into clearly labeled sections that the user can immediately use.
4. Use bold (**text**) for emphasis on key terms and actionable items.
5. When the user requests image prompts (e.g., for Midjourney, DALL-E), provide them as clearly labeled code blocks or quoted blocks.
6. If the user provides a role/perspective (e.g., \"Act as a Master E-commerce Architect\"), fully adopt that perspective.
7. Output ONLY the requested document content — no preamble like \"Here is your document\" or \"Sure, I can help with that.\"
8. The document should be production-ready: professional tone, zero fluff, maximum utility.`;

const CONTINUE_SYSTEM_PROMPT = `You are continuing a partially written marketing/business document. Your job is to pick up EXACTLY where the previous text stopped.

CRITICAL RULES:
1. Do NOT repeat anything from the partial content provided.
2. Start immediately with the next heading, paragraph, or list item — no preamble, no summary, no \"Here is the continuation...\".
3. Match the style, tone, and formatting of the existing content perfectly.
4. Continue until ALL originally requested sections are complete.
5. Use the same Markdown formatting (##, ###, bullets, etc.).`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Try z-ai SDK (sandbox only) ───────────────────────────
let zaiInstance: unknown = null;

async function tryZAIStream(
  messages: Array<{ role: string; content: string }>,
  onDelta: (text: string) => void,
): Promise<string | null> {
  try {
    // Dynamic require: z-ai SDK may not be available in production.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('z-ai-web-dev-sdk');
    if (!mod?.default?.create) return null;

    if (!zaiInstance) {
      zaiInstance = await mod.default.create();
    }
    const zai = zaiInstance as {
      chat: {
        completions: {
          create(opts: Record<string, unknown>): Promise<unknown>;
        }
      }
    };

    const aiBody = await zai.chat.completions.create({
      messages,
      temperature: 0.8,
      thinking: { type: 'disabled' },
      stream: true,
    });

    const aiStream = aiBody as ReadableStream<Uint8Array> | null;
    if (!aiStream) return null;

    const reader = aiStream.getReader();
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
        } catch { /* skip */ }
      }
    }

    return fullContent.trim() || null;
  } catch {
    zaiInstance = null;
    return null;
  }
}

// ─── OpenRouter — production primary (free models) ────────
// General-purpose models first (better for marketing content),
// code models as fallback. Tries streaming first, then non-streaming.

const OPENROUTER_MODELS = [
  'inclusionai/ling-3.0-flash:free',
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-4-scout-17b-16e-instruct:free',
  'cohere/north-mini-code:free',
  'deepseek/deepseek-chat-v3-0324:free',
] as const;

async function tryOpenRouterStream(
  messages: Array<{ role: string; content: string }>,
  onDelta: (text: string) => void,
  onProgress: (msg: string) => void,
): Promise<string | null> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey || apiKey === 'placeholder') return null;

    let lastError: Error | null = null;
    for (const model of OPENROUTER_MODELS) {
      try {
        onProgress(`Trying ${model}...`);
        console.log(`[Marketing Kit] OpenRouter trying ${model} (streaming)...`);

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://storqly.com',
            'X-Title': 'Storqly',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 8000,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          lastError = new Error(`OpenRouter ${response.status} on ${model}: ${errText.substring(0, 300)}`);
          console.warn(`[Marketing Kit] OpenRouter ${model} HTTP ${response.status}: ${errText.substring(0, 200)}`);
          continue;
        }

        const reader = response.body?.getReader();
        if (!reader) continue;

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';
        let chunkCount = 0;

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
              // Check for error in stream
              if (parsed.error) {
                console.warn(`[Marketing Kit] OpenRouter stream error on ${model}:`, parsed.error.message);
                break;
              }
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                chunkCount++;
                onDelta(delta);
              }
            } catch { /* skip malformed JSON */ }
          }
        }

        const trimmed = fullContent.trim();
        if (trimmed) {
          console.log(`[Marketing Kit] ✅ OpenRouter ${model} streaming OK: ${trimmed.length} chars, ${chunkCount} chunks`);
          return trimmed;
        }
        // Streaming returned empty — try non-streaming as fallback for this model
        console.log(`[Marketing Kit] OpenRouter ${model} streaming empty, trying non-streaming...`);
        const nonStreamResult = await tryOpenRouterNonStream(apiKey, model, messages);
        if (nonStreamResult) return nonStreamResult;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        console.warn(`[Marketing Kit] OpenRouter ${model} error:`, lastError.message);
      }
    }
    console.error('[Marketing Kit] All OpenRouter models failed:', lastError?.message);
    return null;
  } catch (e) {
    console.error('[Marketing Kit] OpenRouter unexpected error:', e);
    return null;
  }
}

// Non-streaming OpenRouter call (fallback when streaming returns empty)
async function tryOpenRouterNonStream(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://storqly.com',
        'X-Title': 'Storqly',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 8000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Marketing Kit] OpenRouter non-stream ${model} HTTP ${response.status}: ${errText.substring(0, 200)}`);
      return null;
    }

    const data = await response.json() as {
      choices: Array<{ message?: { content?: string } }>;
      error?: { message: string };
    };

    if (data.error) {
      console.warn(`[Marketing Kit] OpenRouter non-stream ${model} error:`, data.error.message);
      return null;
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (content) {
      console.log(`[Marketing Kit] ✅ OpenRouter ${model} non-stream OK: ${content.length} chars`);
      return content;
    }
    return null;
  } catch (e) {
    console.warn(`[Marketing Kit] OpenRouter non-stream error:`, e);
    return null;
  }
}

// ─── GROQ streaming (backup) ─────────────────────
async function tryGroqStream(
  messages: Array<{ role: string; content: string }>,
  onDelta: (text: string) => void,
): Promise<string | null> {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'placeholder') return null;

    const Groq = (await import('groq-sdk')).default;
    const client = new Groq({ apiKey });

    const stream = await client.chat.completions.create({
      model: 'llama-4-scout-17b-16e-instruct',
      messages: messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })),
      temperature: 0.8,
      stream: true,
    });

    let fullContent = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        fullContent += delta;
        onDelta(delta);
      }
    }

    return fullContent.trim() || null;
  } catch {
    return null;
  }
}

// ─── Gemini non-streaming fallback ───────────────────────────
async function tryGemini(
  messages: Array<{ role: string; content: string }>,
): Promise<string | null> {
  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey || apiKey === 'placeholder') return null;

    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });

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

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: geminiContents,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    });
    return response.text.trim() || null;
  } catch {
    return null;
  }
}

// ─── POST handler ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return authErrorResponse(e);
    throw e;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* closed */ }
      };

      const heartbeat = setInterval(() => {
        try { send('ping', { t: Date.now() }); }
        catch { clearInterval(heartbeat); }
      }, 3000);

      const startTime = Date.now();
      const timedOut = () => Date.now() - startTime > TIMEOUT_MS;

      try {
        const body = await req.json();
        const { prompt, continueFrom } = body as { prompt?: string; continueFrom?: string };

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 20) {
          send('error', { message: 'Please provide a detailed prompt (at least 20 characters).' });
          return;
        }

        const isContinuation = !!continueFrom && continueFrom.trim().length > 50;
        const systemPrompt = isContinuation ? CONTINUE_SYSTEM_PROMPT : SYSTEM_PROMPT;

        let userMessage: string;
        if (isContinuation) {
          const partial = continueFrom!.length > 6000
            ? '...' + continueFrom!.slice(-5000)
            : continueFrom!;
          userMessage = `Continue EXACTLY from where this text stops. Do not repeat any of it.\n\n--- PARTIAL OUTPUT ---\n${partial}\n--- END PARTIAL ---\n\nContinue now (start immediately with the next content):`;
        } else {
          userMessage = prompt.trim();
        }

        send('progress', { message: isContinuation ? 'Continuing...' : 'AI is generating your marketing kit...' });

        const messages = [
          { role: 'system' as const, content: systemPrompt },
          { role: 'user' as const, content: userMessage },
        ];

        // Try providers in order: z-ai → OpenRouter → GROQ → Gemini
        let result: string | null = null;

        // 1. Try z-ai (sandbox streaming)
        if (!result && !timedOut()) {
          console.log('[Marketing Kit] Trying z-ai provider...');
          result = await tryZAIStream(messages, (delta) => send('delta', { content: delta }));
          if (result) console.log('[Marketing Kit] ✅ z-ai succeeded');
        }

        // 2. Try OpenRouter (production primary — free models)
        if (!result && !timedOut()) {
          console.log('[Marketing Kit] Trying OpenRouter (free models)...');
          result = await tryOpenRouterStream(
            messages,
            (delta) => send('delta', { content: delta }),
            (msg) => send('progress', { message: msg }),
          );
        }

        // 3. Try GROQ (backup streaming)
        if (!result && !timedOut()) {
          console.log('[Marketing Kit] Trying GROQ provider...');
          result = await tryGroqStream(messages, (delta) => send('delta', { content: delta }));
          if (result) console.log('[Marketing Kit] ✅ GROQ succeeded');
        }

        // 4. Try Gemini (fallback, non-streaming)
        if (!result && !timedOut()) {
          console.log('[Marketing Kit] Trying Gemini provider (non-streaming)...');
          send('progress', { message: 'Trying backup AI provider...' });
          result = await tryGemini(messages);
          if (result) {
            console.log('[Marketing Kit] ✅ Gemini succeeded');
            send('delta', { content: result });
          }
        }

        if (!result) {
          send('error', { message: 'AI generation failed. Please try again in a moment. If this persists, check that OPENROUTER_API_KEY is set correctly in your deployment.' });
          return;
        }

        const elapsed = Date.now() - startTime;
        console.log(`[Marketing Kit] ✅ Done: ${result.length} chars, ${Math.round(elapsed / 1000)}s`);
        send('result', { content: result });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[Marketing Kit] Unexpected error:`, msg);
        send('error', { message: `Internal error: ${msg}` });
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
