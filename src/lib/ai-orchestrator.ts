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
    timeout: 60_000,
    maxRetries: 2,
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

// ─── Safe repairs (cannot break valid JSON) ─────────────────────

function safeRepair(jsonStr: string): string {
  // Remove newlines/tabs inside quoted strings only.
  // Also strip stray backslashes outside strings (AI sometimes produces \\" 
  // at value-start positions like "alt:\\"Toddler" which should be "alt":"Toddler").
  const chars: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) { chars.push(ch); escaped = false; continue; }
    if (ch === '\\') {
      if (!inString) {
        // Backslash outside a string is ALWAYS invalid JSON.
        // Skip it — the next char (usually ") will be processed normally.
        continue;
      }
      // Inside a string, backslash starts an escape sequence — keep it
      chars.push(ch);
      escaped = true;
      continue;
    }
    if (ch === '"') { inString = !inString; chars.push(ch); continue; }
    if (inString && (ch === '\n' || ch === '\r' || ch === '\t')) { chars.push(' '); continue; }
    chars.push(ch);
  }
  let repaired = chars.join('');
  // Collapse multi-space
  repaired = repaired.replace(/  +/g, ' ');
  // Fix comma-instead-of-colon in objects: "key",value → "key":value
  // AI sometimes writes "visible",true instead of "visible":true
  // Only matches when value is not a string (true/false/null/digit) to avoid breaking arrays-of-strings
  repaired = repaired.replace(/"([^"]+)",\s*(true|false|null|\d)/g, '"$1":$2');
  // Remove control characters
  repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  // Remove trailing commas
  repaired = repaired.replace(/,\s*([}\]])/g, '$1');
  // Close unclosed brackets (truncation)
  repaired = closeUnclosedBrackets(repaired);
  return repaired;
}

function closeUnclosedBrackets(str: string): string {
  let openCurly = 0, openSquare = 0, inStr = false, esc = false;
  for (const ch of str) {
    if (esc) { esc = false; continue; }
    if (ch === '\\') {
      if (!inStr) continue; // Skip stray backslashes outside strings
      esc = true;
      continue;
    }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') openCurly++;
    if (ch === '}') openCurly--;
    if (ch === '[') openSquare++;
    if (ch === ']') openSquare--;
  }
  let repaired = str;
  if (inStr) repaired += '"';
  while (openSquare > 0) { repaired += ']'; openSquare--; }
  while (openCurly > 0) { repaired += '}'; openCurly--; }
  return repaired;
}

/**
 * Apply a single targeted repair based on the JSON parse error.
 * Returns the repaired string, or null if the error can't be auto-fixed.
 */
function targetedRepair(jsonStr: string, errMsg: string): string | null {
  const posMatch = errMsg.match(/position (\d+)/);
  if (!posMatch) return null;
  const pos = parseInt(posMatch[1], 10);
  if (pos < 0 || pos >= jsonStr.length) return null;

  const ch = jsonStr[pos];

  // Case 1: "Expected ',' or '}'" — missing comma between object properties
  if (errMsg.includes("Expected ',' or '}'")) {
    if (ch === '"') {
      // Next property starts with " — insert comma before it
      return jsonStr.substring(0, pos) + ',' + jsonStr.substring(pos);
    }
    if (ch === ':') {
      // AI used : instead of , between properties — replace : with ,
      return jsonStr.substring(0, pos) + ',' + jsonStr.substring(pos + 1);
    }
    // Case 1b: Alphanumeric char where a comma or } is expected.
    // This often means the opening quote of a string value is missing, e.g.
    // "label":120ml  →  "label":"120ml"
    // Look backwards to find the preceding ":" pattern
    if (/[a-zA-Z0-9]/.test(ch)) {
      // Find ":" before this position (the key-value separator)
      const before = jsonStr.substring(Math.max(0, pos - 30), pos);
      const colonIdx = before.lastIndexOf(':');
      if (colonIdx !== -1) {
        const absColonPos = Math.max(0, pos - 30) + colonIdx;
        // Check that after the colon there's just whitespace until pos
        const between = jsonStr.substring(absColonPos + 1, pos).trim();
        if (between === '' || between.length <= 1) {
          // Insert opening quote after the colon
          const valueStart = absColonPos + 1;
          // Find where this value ends (comma, closing brace, or bracket)
          let valueEnd = pos;
          while (valueEnd < jsonStr.length) {
            const vc = jsonStr[valueEnd];
            if (vc === ',' || vc === '}' || vc === ']') break;
            valueEnd++;
          }
          const value = jsonStr.substring(pos, valueEnd);
          return jsonStr.substring(0, valueStart) + '"' + value + '"' + jsonStr.substring(valueEnd);
        }
      }
    }
  }

  // Case 2: "Expected ',' or ']'" — missing comma in array
  if (errMsg.includes("Expected ',' or ']'")) {
    if (ch === '"') {
      return jsonStr.substring(0, pos) + ',' + jsonStr.substring(pos);
    }
    if (ch === ':') {
      return jsonStr.substring(0, pos) + ',' + jsonStr.substring(pos + 1);
    }
  }

  // Case 3: "Expected ':' after property name" — missing colon or missing value
  if (errMsg.includes("Expected ':'")) {
    if (ch === '"' || ch === ',') {
      // Key has no value — insert empty string value
      return jsonStr.substring(0, pos) + ':""' + jsonStr.substring(pos);
    }
  }

  // Case 4: "Unexpected non-whitespace character after JSON" — truncate
  if (errMsg.includes('Unexpected non-whitespace character after JSON')) {
    // Try truncating at the error position
    const truncated = jsonStr.substring(0, pos).trimEnd();
    return closeUnclosedBrackets(truncated);
  }

  // Case 5: "Expected double-quoted property name" — malformed key
  if (errMsg.includes('Expected double-quoted property name')) {
    if (ch !== '"' && ch !== ',' && ch !== '}' && ch !== ']') {
      // Some garbage character where a key should be — skip it
      return jsonStr.substring(0, pos) + jsonStr.substring(pos + 1);
    }
  }

  return null;
}

/**
 * Strategy B: fix unescaped quotes inside string values.
 * Uses lookahead: a `"` inside a string is only a terminator if
 * the next non-whitespace char is one of: `: , } ]`.
 * IMPORTANT: Only used as a fallback strategy, not the primary repair.
 */
function fixUnescapedQuotes(jsonStr: string): string {
  const VALID_TERMINATORS = new Set([':', ',', '}', ']']);
  const result: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escaped) { result.push(ch); escaped = false; continue; }
    if (ch === '\\') {
      if (!inString) continue; // Skip stray backslashes outside strings
      result.push(ch);
      escaped = true;
      continue;
    }    if (ch === '"') {
      if (!inString) { inString = true; result.push(ch); }
      else {
        let j = i + 1;
        while (j < jsonStr.length && (jsonStr[j] === ' ' || jsonStr[j] === '\t' || jsonStr[j] === '\n' || jsonStr[j] === '\r')) j++;
        const nextNonWS = j < jsonStr.length ? jsonStr[j] : null;
        if (nextNonWS !== null && VALID_TERMINATORS.has(nextNonWS)) {
          inString = false; result.push(ch);
        } else if (j >= jsonStr.length) {
          inString = false; result.push(ch);
        } else {
          result.push('\\', '"');
        }
      }
      continue;
    }
    result.push(ch);
  }
  return result.join('');
}

/**
 * Main repair entry point. Tries multiple strategies in order of safety.
 */
export function repairJSON(jsonStr: string): string {
  return safeRepair(jsonStr);
}

/**
 * Aggressive repair: tries quote-escaping as a second strategy.
 */
export function aggressiveRepair(jsonStr: string): string {
  let repaired = fixUnescapedQuotes(jsonStr);
  // Re-apply safe repairs after quote fix
  repaired = safeRepair(repaired);
  return repaired;
}

/**
 * Iterative position-based repair: parses, gets error, applies targeted fix, retries.
 * Up to 10 iterations of parse → fix → retry.
 */
export function iterativeRepair(jsonStr: string): string {
  let current = jsonStr;
  for (let i = 0; i < 10; i++) {
    try {
      JSON.parse(current);
      return current; // Parsed successfully
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const fix = targetedRepair(current, msg);
      if (!fix) return current; // Can't fix this error
      current = fix;
    }
  }
  return current;
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
      const baseDelay = isRateLimitError(lastError) ? 15000 : 3000;
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
