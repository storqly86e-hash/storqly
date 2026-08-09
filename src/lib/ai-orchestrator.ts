// ========================================
// Storqly AI Orchestrator
// ========================================
// Routing layer that sends requests to the correct AI model.
// Uses z-ai-web-dev-sdk. Supports retry with exponential backoff.

import ZAI from 'z-ai-web-dev-sdk';

// ─── Task Types ────────────────────────────────────────────────
export type AITaskType = 'store-generation' | 'chat-edit' | 'coding-task';

export interface AIMessage {
  role: 'assistant' | 'user';
  content: string;
}

interface TaskConfig {
  label: string;
  temperature?: number;
  timeout?: number;
  maxRetries?: number;
}

const TASK_CONFIGS: Record<AITaskType, TaskConfig> = {
  'store-generation': {
    label: 'Store Generation',
    temperature: 0.7,
    timeout: 75_000,
    maxRetries: 3,
  },
  'chat-edit': {
    label: 'Chat Edit',
    temperature: 0.5,
    timeout: 30_000,
    maxRetries: 2,
  },
  'coding-task': {
    label: 'Coding Task',
    temperature: 0.3,
    timeout: 45_000,
    maxRetries: 2,
  },
};

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

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Check if an error is a rate limit (429) */
function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('429') || msg.includes('Too many requests') || msg.includes('rate limit');
}

// ─── JSON extraction & repair ──────────────────────────────────

export function extractJSON(raw: string): string {
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

  // Brace extraction
  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = raw.substring(firstBrace, lastBrace + 1);
    try { JSON.parse(extracted); return extracted; } catch { /* continue */ }
    return extracted;
  }

  return raw;
}

export function repairJSON(jsonStr: string): string {
  // Pass 1: Remove newlines/tabs inside quoted strings only
  const chars: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) { chars.push(ch); escaped = false; continue; }
    if (ch === '\\') { chars.push(ch); escaped = true; continue; }
    if (ch === '"') { inString = !inString; chars.push(ch); continue; }
    if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) {
      chars.push(' ');
      continue;
    }
    chars.push(ch);
  }

  let repaired = chars.join('');
  // Pass 2: Collapse multi-space
  repaired = repaired.replace(/  +/g, ' ');
  // Pass 3: Remove control characters
  repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  // Pass 4: Remove trailing commas
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');

  return repaired;
}

// ─── Core orchestrator ──────────────────────────────────────────

const RETRY_EXTRA_INSTRUCTIONS = [
  '',
  '\n\nCRITICAL: Return ONLY valid raw JSON. No markdown. Every string on ONE line. No literal newlines in values.',
  '\n\nYou MUST return valid JSON. No markdown. Single-line strings only. Compact format.',
];

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
  const maxRetries = config.maxRetries ?? 2;

  const buildMessages = (extraSystem?: string): AIMessage[] => {
    const fullSystem = extraSystem ? systemPrompt + extraSystem : systemPrompt;
    const msgs: AIMessage[] = [];
    if (fullSystem) msgs.push({ role: 'assistant', content: fullSystem });
    for (const m of messages) msgs.push(m);
    return msgs;
  };

  const attempt = async (temp: number, extraSystem?: string): Promise<{ content: string } | null> => {
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
      if (!content || content.trim().length === 0) throw new Error('Empty response');
      return { content: content.trim() };
    } finally {
      clearTimeout(timer);
    }
  };

  let lastError = 'Unknown error';

  for (let i = 0; i < maxRetries; i++) {
    // Exponential backoff: 0s, 3s, 8s (longer on rate limits)
    if (i > 0) {
      const baseDelay = isRateLimitError(lastError) ? 5000 : 2000;
      const delay = baseDelay * Math.pow(1.5, i - 1);
      console.warn(`[AI Orchestrator] Waiting ${(delay / 1000).toFixed(1)}s before retry ${i + 1} for ${taskType}...`);
      await sleep(delay);
    }

    const temp = i === 0 ? primaryTemp : Math.max(0.2, primaryTemp - 0.2 * i);
    const extraSystem = RETRY_EXTRA_INSTRUCTIONS[i] || '';

    try {
      const result = await attempt(temp, extraSystem);
      if (result) {
        return { success: true, content: result.content, attempts: i + 1, taskType };
      }
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Orchestrator] Attempt ${i + 1} failed for ${taskType}: ${lastError}`);
    }
  }

  return {
    success: false,
    content: null,
    error: `AI failed after ${maxRetries} attempts for ${taskType}. Last: ${lastError}`,
    attempts: maxRetries,
    taskType,
  };
}
