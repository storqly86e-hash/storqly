// ========================================
// Marketing Kit Generator API — SSE Streaming
// ========================================
// Standalone content-generation tool. Returns free-form markdown via SSE.
// No JSON schema, no repair pipeline, no connection to Store data.
// Uses z-ai-web-dev-sdk directly (bypasses the store orchestrator).
//
// SSE with heartbeats keeps the proxy connection alive during long
// generations (45-60s+). Same pattern as /api/store/generate.

import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

const TIMEOUT_MS = 120_000;
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

// ─── POST handler — SSE stream ──────────────────────────────────
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { /* Stream already closed */ }
      };

      // Heartbeat: send keepalive every 4s to prevent proxy timeouts
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(': heartbeat\n\n')); }
        catch { clearInterval(heartbeat); }
      }, 4000);

      try {
        const body = await req.json();
        const { prompt } = body as { prompt?: string };

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 20) {
          send('error', { message: 'Please provide a detailed prompt (at least 20 characters).' });
          return;
        }

        const userMessage = prompt.trim();
        console.log(`[Marketing Kit] Generating content for ${userMessage.length} char prompt...`);
        send('progress', { message: 'AI is generating your marketing kit...' });

        let lastError = '';

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          if (attempt > 0) {
            const delay = 3000 * attempt;
            console.warn(`[Marketing Kit] Retry ${attempt} after ${delay}ms...`);
            send('progress', { message: `Retrying... (attempt ${attempt + 1})` });
            await sleep(delay);
          }

          try {
            const zai = await getZAI();
            const completion = await Promise.race([
              zai.chat.completions.create({
                messages: [
                  { role: 'assistant', content: SYSTEM_PROMPT },
                  { role: 'user', content: userMessage },
                ],
                temperature: 0.8,
                thinking: { type: 'disabled' },
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Timed out')), TIMEOUT_MS)
              ),
            ]);

            const content = completion.choices[0]?.message?.content;
            if (!content || content.trim().length === 0) {
              throw new Error('Empty response from AI');
            }

            console.log(`[Marketing Kit] Success: ${content.length} chars in ${attempt + 1} attempt(s)`);
            send('result', { content: content.trim() });
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
