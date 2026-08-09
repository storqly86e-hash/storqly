// ========================================
// Storqly AI Orchestrator
// ========================================
// Routing layer that sends requests to the correct AI model based on task type.
// Uses z-ai-web-dev-sdk as the unified AI interface.
// Supports automatic failover with retry logic.

import ZAI from 'z-ai-web-dev-sdk';

// ─── Task Types ────────────────────────────────────────────────
export type AITaskType = 'store-generation' | 'chat-edit' | 'coding-task';

// ─── Message format ─────────────────────────────────────────────
export interface AIMessage {
  role: 'assistant' | 'user';
  content: string;
}

// ─── Task configuration ────────────────────────────────────────
interface TaskConfig {
  label: string;
  temperature?: number;
  timeout?: number;
}

const TASK_CONFIGS: Record<AITaskType, TaskConfig> = {
  'store-generation': {
    label: 'Store Generation',
    temperature: 0.7,
    timeout: 75_000,
  },
  'chat-edit': {
    label: 'Chat Edit',
    temperature: 0.5,
    timeout: 30_000,
  },
  'coding-task': {
    label: 'Coding Task',
    temperature: 0.3,
    timeout: 45_000,
  },
};

// ─── Response type ─────────────────────────────────────────────
export interface AIOrchestratorResult {
  success: boolean;
  content: string | null;
  error?: string;
  attempts: number;
  taskType: AITaskType;
}

// ─── Singleton ZAI instance ─────────────────────────────────────
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null;

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

/**
 * Extract JSON from AI response.
 * Tries: direct parse → markdown code block → brace extraction.
 */
export function extractJSON(raw: string): string {
  // Try direct parse first
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // not valid yet
  }

  // Try markdown code block
  const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    try { JSON.parse(extracted); return extracted; } catch { /* continue */ }
  }

  // Brace extraction — find outermost { … }
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = raw.substring(firstBrace, lastBrace + 1);
    try { JSON.parse(extracted); return extracted; } catch { /* continue */ }
    // Return best-effort even if parse failed (repairJSON may fix it)
    return extracted;
  }

  return raw;
}

/**
 * Repair common JSON issues from AI output.
 *
 * Key fix: only removes newlines that are INSIDE quoted strings,
 * leaving structural whitespace alone. This handles the #1 cause
 * of AI JSON parse failures (literal newlines in string values).
 */
export function repairJSON(jsonStr: string): string {
  // ── Pass 1: Remove newlines inside quoted strings ──
  const chars: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (escaped) {
      chars.push(ch);
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      chars.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      chars.push(ch);
      continue;
    }

    // Only strip newlines inside strings — structural ones are fine
    if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      chars.push(' ');
      continue;
    }

    chars.push(ch);
  }

  let repaired = chars.join('');

  // ── Pass 2: Collapse multi-space runs inside strings ──
  // (result of replacing newlines with spaces)
  repaired = repaired.replace(/  +/g, ' ');

  // ── Pass 3: Remove control characters ──
  repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // ── Pass 4: Remove trailing commas before } or ] ──
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  return repaired;
}

// ─── Core orchestrator function ──────────────────────────────────
export async function executeAI(
  taskType: AITaskType,
  messages: AIMessage[],
  options?: {
    systemPrompt?: string;
    temperature?: number;
    timeout?: number;
  }
): Promise<AIOrchestratorResult> {
  const config = TASK_CONFIGS[taskType];
  const systemPrompt = options?.systemPrompt ?? '';
  const primaryTemp = options?.temperature ?? config.temperature ?? 0.7;
  const timeout = options?.timeout ?? config.timeout ?? 30_000;

  const buildMessages = (extraSystem?: string): AIMessage[] => {
    const fullSystem = extraSystem
      ? systemPrompt + extraSystem
      : systemPrompt;
    const msgs: AIMessage[] = [];
    if (fullSystem) {
      msgs.push({ role: 'assistant', content: fullSystem });
    }
    for (const m of messages) {
      msgs.push(m);
    }
    return msgs;
  };

  const attempt = async (
    temp: number,
    extraSystem?: string
  ): Promise<{ content: string } | null> => {
    const zai = await getZAI();
    const msgs = buildMessages(extraSystem);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const completion = await zai.chat.completions.create({
        messages: msgs,
        temperature: temp,
        thinking: { type: 'disabled' },
      });

      const content = completion.choices[0]?.message?.content;

      if (!content || content.trim().length === 0) {
        throw new Error('Empty response from AI model');
      }

      return { content: content.trim() };
    } finally {
      clearTimeout(timer);
    }
  };

  // ── Attempt 1: Primary ────────────────────────────────────────
  try {
    const result = await attempt(primaryTemp);
    if (result) {
      return { success: true, content: result.content, attempts: 1, taskType };
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[AI Orchestrator] Primary attempt failed for ${taskType}: ${errMsg}`);
  }

  // ── Attempt 2: Failover — lower temp + stronger JSON instructions ──
  try {
    const result = await attempt(
      0.3,
      '\n\nCRITICAL: Respond with ONLY valid raw JSON. No markdown fences, no explanation. All string values must be on a single line — never use literal newlines inside strings. The output must parse with JSON.parse() with zero errors.'
    );
    if (result) {
      return { success: true, content: result.content, attempts: 2, taskType };
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AI Orchestrator] Failover attempt also failed for ${taskType}: ${errMsg}`);
  }

  return {
    success: false,
    content: null,
    error: `AI model failed after 2 attempts for task type: ${taskType}`,
    attempts: 2,
    taskType,
  };
}
