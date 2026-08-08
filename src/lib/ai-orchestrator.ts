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
  /** Human-readable label */
  label: string;
  /** Default system prompt template (may be overridden per call) */
  defaultSystemPrompt?: string;
  /** Temperature for the primary call */
  temperature?: number;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Max tokens */
  maxTokens?: number;
}

// Primary configuration per task type.
// All tasks currently route through GLM via z-ai-web-dev-sdk.
const TASK_CONFIGS: Record<AITaskType, TaskConfig> = {
  'store-generation': {
    label: 'Store Generation (GLM)',
    temperature: 0.7,
    timeout: 60_000,
  },
  'chat-edit': {
    label: 'Chat Edit (GLM)',
    temperature: 0.5,
    timeout: 30_000,
  },
  'coding-task': {
    label: 'Coding Task (GLM)',
    temperature: 0.3,
    timeout: 45_000,
  },
};

// Failover configuration — when primary attempt fails, retry with these adjustments.
const FAILOVER_ADJUSTMENTS = {
  temperature: 0.4,
  // We prepend additional instructions to the system prompt on failover
  extraSystemInstruction:
    '\n\nIMPORTANT: You MUST respond with valid JSON only. Do NOT include any markdown, explanation, or text outside the JSON block. Return raw JSON that can be parsed directly with JSON.parse().',
};

// ─── Response type ─────────────────────────────────────────────
export interface AIOrchestratorResult {
  success: boolean;
  content: string | null;
  error?: string;
  /** Number of attempts made (1 = primary only, 2 = primary + failover) */
  attempts: number;
  /** Which task config was used */
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

// ─── Helper: extract JSON from AI response ──────────────────────
export function extractJSON(raw: string): string {
  // Try direct parse first
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // Try to extract from markdown code block
    const codeBlockMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    // Try to find the first { and last }
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return raw.substring(firstBrace, lastBrace + 1);
    }
    return raw;
  }
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
  const systemPrompt = options?.systemPrompt ?? config.defaultSystemPrompt ?? '';
  const primaryTemp = options?.temperature ?? config.temperature ?? 0.7;
  const timeout = options?.timeout ?? config.timeout ?? 30_000;

  // Build message array — system prompt goes as 'assistant' role per SDK convention
  const buildMessages = (extraSystem?: string): AIMessage[] => {
    const fullSystem = extraSystem
      ? systemPrompt + extraSystem
      : systemPrompt;
    const msgs: AIMessage[] = [];
    if (fullSystem) {
      msgs.push({ role: 'assistant', content: fullSystem });
    }
    // Add non-system messages
    for (const m of messages) {
      msgs.push(m);
    }
    return msgs;
  };

  // Attempt helper — wraps a single SDK call with timeout
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
      return {
        success: true,
        content: result.content,
        attempts: 1,
        taskType,
      };
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[AI Orchestrator] Primary attempt failed for ${taskType}: ${errMsg}`);
  }

  // ── Attempt 2: Failover with adjusted params ──────────────────
  try {
    const result = await attempt(FAILOVER_ADJUSTMENTS.temperature, FAILOVER_ADJUSTMENTS.extraSystemInstruction);
    if (result) {
      return {
        success: true,
        content: result.content,
        attempts: 2,
        taskType,
      };
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
