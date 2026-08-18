// ========================================
// Marketing Kit Generator API — Streaming
// ========================================
// Streams the AI response token-by-token to the client.
// Supports auto-continue: if the proxy kills the connection mid-stream,
// the client sends continueFrom=<partial> and the AI picks up where it left off.
//
// Provider priority: z-ai (sandbox) → GROQ (production primary) → Gemini (fallback)
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

// ─── GROQ streaming (production primary) ─────────────────────
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

        // Try providers in order: z-ai → GROQ → Gemini
        let result: string | null = null;

        // 1. Try z-ai (sandbox streaming)
        if (!result && !timedOut()) {
          console.log('[Marketing Kit] Trying z-ai provider...');
          result = await tryZAIStream(messages, (delta) => send('delta', { content: delta }));
          if (result) console.log('[Marketing Kit] ✅ z-ai succeeded');
        }

        // 2. Try GROQ (production streaming)
        if (!result && !timedOut()) {
          console.log('[Marketing Kit] Trying GROQ provider...');
          result = await tryGroqStream(messages, (delta) => send('delta', { content: delta }));
          if (result) console.log('[Marketing Kit] ✅ GROQ succeeded');
        }

        // 3. Try Gemini (fallback, non-streaming)
        if (!result && !timedOut()) {
          console.log('[Marketing Kit] Trying Gemini provider (non-streaming)...');
          send('progress', { message: 'Trying backup AI provider...' });
          result = await tryGemini(messages);
          if (result) {
            console.log('[Marketing Kit] ✅ Gemini succeeded');
            // Send the complete result as one chunk since Gemini doesn't stream
            send('delta', { content: result });
          }
        }

        if (!result) {
          send('error', { message: 'All AI providers failed. Please check your API keys (GROQ_API_KEY, GOOGLE_AI_API_KEY).' });
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
