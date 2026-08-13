'use server';

// ========================================
// Marketing Kit Generator API
// ========================================
// Standalone content-generation tool. Returns free-form markdown.
// No JSON schema, no repair pipeline, no connection to Store data.
// Uses z-ai-web-dev-sdk directly (bypasses the store orchestrator).

import { NextRequest } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

const TIMEOUT_MS = 120_000; // Long-form content needs more time than JSON store generation
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── POST handler ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 20) {
      return Response.json(
        { error: 'Please provide a detailed prompt (at least 20 characters) describing your business and what you need.' },
        { status: 400 }
      );
    }

    const userMessage = prompt.trim();
    console.log(`[Marketing Kit] Generating content for ${userMessage.length} char prompt...`);

    let lastError = '';

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = 3000 * attempt;
        console.warn(`[Marketing Kit] Retry ${attempt} after ${delay}ms...`);
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
        return Response.json({ content: content.trim() });
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[Marketing Kit] Attempt ${attempt + 1} failed: ${lastError}`);

        // Reset ZAI on auth errors
        if (lastError.includes('401') || lastError.includes('unauthorized')) {
          zaiInstance = null;
        }
      }
    }

    return Response.json(
      { error: `Generation failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError}` },
      { status: 500 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Marketing Kit] Unexpected error:`, msg);
    return Response.json(
      { error: `Internal error: ${msg}` },
      { status: 500 }
    );
  }
}
