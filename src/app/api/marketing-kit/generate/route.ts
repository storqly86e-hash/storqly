// ========================================
// Marketing Kit Generator API — Real Token Streaming
// ========================================
// Streams the AI response token-by-token to the client.
// This keeps data flowing continuously through the infrastructure
// proxy, preventing 502 timeouts regardless of generation length.
//
// No JSON schema, no repair pipeline, no connection to Store data.
// Uses z-ai-web-dev-sdk directly (bypasses the store orchestrator).

import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

const TIMEOUT_MS = 180_000; // 3min hard ceiling (streaming keeps proxy alive)
const MAX_RETRIES = 1;

const SYSTEM_PROMPT = `You are a world-class business strategist and direct-response copywriter. You produce comprehensive, actionable marketing and business documents.

OUTPUT RULES:
1. Use well-structured Markdown with clear headings (##, ###), bullet lists, numbered lists, and tables where appropriate.
2. Be specific and actionable — include real examples, exact copy, and concrete numbers.
3. Organize content into clearly labeled sections that the user can immediately use.
4. Use bold (**text**) for emphasis on key terms and actionable items.
5. When the user requests image prompts (e.g., for Midjourney, DALL-E), provide them as clearly labeled code blocks or quoted blocks.
6. If the user provides a role/perspective (e.g., "Act as a Master E-commerce Architect"), fully adopt that perspective.
7. Output ONLY the requested document content — no preamble like "Here is your document" or "Sure, I can help with that.".
8. The document should be production-ready: professional tone, zero fluff, maximum utility.`;

// ─── Singleton ZAI instance ─────────────────────────────────────
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

function resetZAI() {
  zaiInstance = null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── POST handler — Real token streaming via SSE ─────────────────
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* Stream already closed */ }
      };

      // Heartbeat: REAL SSE event (not a comment) so proxy counts it as activity
      const heartbeat = setInterval(() => {
        try { send('ping', { t: Date.now() }); }
        catch { clearInterval(heartbeat); }
      }, 3000);

      const startTime = Date.now();
      const timedOut = () => Date.now() - startTime > TIMEOUT_MS;

      try {
        const body = await req.json();
        const { prompt } = body as { prompt?: string };

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 20) {
          send('error', { message: 'Please provide a detailed prompt (at least 20 characters).' });
          return;
        }

        const userMessage = prompt.trim();
        console.log(`[Marketing Kit] Streaming content for ${userMessage.length} char prompt...`);
        send('progress', { message: 'AI is generating your marketing kit...' });

        let lastError = '';

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            const delay = 3000 * attempt;
            console.warn(`[Marketing Kit] Retry ${attempt} after ${delay}ms...`);
            send('progress', { message: `Retrying... (attempt ${attempt + 1})` });
            await sleep(delay);
          }

          if (timedOut()) {
            send('error', { message: 'Generation timed out. Please try again with a shorter prompt.' });
            return;
          }

          try {
            const zai = await getZAI();

            // ── Call AI with stream: true → returns ReadableStream<Uint8Array> ──
            const aiBody = await zai.chat.completions.create({
              messages: [
                { role: 'assistant', content: SYSTEM_PROMPT },
                { role: 'user', content: userMessage },
              ],
              temperature: 0.8,
              thinking: { type: 'disabled' },
              stream: true,
            });

            // SDK returns response.body (ReadableStream) when stream: true
            const aiStream = aiBody as ReadableStream<Uint8Array> | null;
            if (!aiStream) {
              throw new Error('Empty stream from AI');
            }

            const reader = aiStream.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';
            let tokenCount = 0;

            // Read the AI's SSE stream chunk by chunk
            while (true) {
              if (timedOut()) {
                reader.cancel();
                throw new Error('Timed out');
              }

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
                    tokenCount++;
                    // Forward EVERY token to client — keeps proxy alive
                    send('delta', { content: delta });
                  }
                } catch { /* skip malformed chunks */ }
              }
            }

            if (!fullContent.trim()) {
              throw new Error('Empty response from AI');
            }

            const elapsed = Date.now() - startTime;
            console.log(`[Marketing Kit] ✅ Streaming done: ${fullContent.length} chars, ${tokenCount} tokens, ${Math.round(elapsed / 1000)}s, attempt ${attempt + 1}`);

            // Send final event with complete content
            send('result', { content: fullContent.trim() });
            return;
          } catch (err: unknown) {
            lastError = err instanceof Error ? err.message : String(err);
            console.warn(`[Marketing Kit] Attempt ${attempt + 1} failed: ${lastError}`);

            // Reset ZAI on auth errors
            if (lastError.includes('401') || lastError.includes('unauthorized')) {
              resetZAI();
            }
          }
        }

        send('error', { message: `Generation failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}` });
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
