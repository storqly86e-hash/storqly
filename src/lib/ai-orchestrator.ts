// ========================================
// Storqly AI Orchestrator
// ========================================
// Routing layer that sends requests to the correct AI model.
// v3: Multi-provider failover (z-ai → GROQ → Gemini).
// JSON repair/normalization is provider-agnostic.

import {
  getProviders,
  resetAllProviders,
  isRateLimitError,
  isTimeoutError,
  isAuthError,
  type AIProvider,
} from '@/lib/ai-providers';

// ─── Task Types ────────────────────────────────────────────────
export type AITaskType = 'store-generation' | 'chat-edit' | 'coding-task' | 'product-batch';

export interface AIMessage {
  role: 'assistant' | 'user';
  content: string;
}

interface TaskConfig {
  label: string;
  temperature?: number;
  timeout?: number;
  maxTokens?: number;
  /** Max retries PER PROVIDER before switching to next */
  retriesPerProvider?: number;
}

const TASK_CONFIGS: Record<AITaskType, TaskConfig> = {
  'store-generation': {
    label: 'Store Generation',
    temperature: 0.7,
    timeout: 60_000,
    maxTokens: 8000,
    retriesPerProvider: 2,
  },
  'chat-edit': {
    label: 'Chat Edit',
    temperature: 0.5,
    timeout: 45_000,
    maxTokens: 8192,
    retriesPerProvider: 1,
  },
  'coding-task': {
    label: 'Coding Task',
    temperature: 0.3,
    timeout: 45_000,
    maxTokens: 8000,
    retriesPerProvider: 1,
  },
  'product-batch': {
    label: 'Product Batch Generation',
    temperature: 0.7,
    timeout: 45_000,
    maxTokens: 8000,
    retriesPerProvider: 1,
  },
};

export interface AIOrchestratorResult {
  success: boolean;
  content: string | null;
  error?: string;
  attempts: number;
  taskType: AITaskType;
  provider?: string;
}

// ─── Global Rate Limiter ──────────────────────────────────────
// Prevents burst AI calls. Ensures minimum 1s between ALL AI calls.
let lastAICallTime = 0;
const MIN_AI_CALL_INTERVAL_MS = 1_000;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastAICallTime;
  if (elapsed < MIN_AI_CALL_INTERVAL_MS) {
    const waitMs = MIN_AI_CALL_INTERVAL_MS - elapsed;
    await new Promise(r => setTimeout(r, waitMs));
  }
}

/** Sleep helper */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

// ─── Core orchestrator with multi-provider failover ──────────────

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
    maxRetries?: number;
    responseFormat?: 'json_object';
    /** Force a specific provider (for testing: 'groq', 'gemini', 'z-ai') */
    forceProvider?: string;
  }
): Promise<AIOrchestratorResult> {
  const config = TASK_CONFIGS[taskType];
  const systemPrompt = options?.systemPrompt ?? '';
  const primaryTemp = options?.temperature ?? config.temperature ?? 0.7;
  const timeout = options?.timeout ?? config.timeout ?? 30_000;
  const useJsonMode = options?.responseFormat === 'json_object';
  const retriesPerProvider = config.retriesPerProvider ?? 2;

  // Build message array (system prompt as first 'assistant' message — z-ai convention)
  const buildMessages = (extraSystem?: string) => {
    const fullSystem = extraSystem ? systemPrompt + extraSystem : systemPrompt;
    const msgs: Array<{ role: 'assistant' | 'user'; content: string }> = [];
    if (fullSystem) msgs.push({ role: 'assistant', content: fullSystem });
    for (const m of messages) msgs.push(m);
    return msgs;
  };

  // Get provider chain (ordered: primary → backup1 → backup2)
  const allProviders = getProviders();
  const providers = options?.forceProvider
    ? allProviders.filter(p => p.name === options.forceProvider)
    : allProviders;

  if (providers.length === 0) {
    return {
      success: false,
      content: null,
      error: 'No AI providers configured',
      attempts: 0,
      taskType,
    };
  }

  let totalAttempts = 0;
  let lastError = 'Unknown error';

  for (let pi = 0; pi < providers.length; pi++) {
    const provider = providers[pi];
    const isPrimary = pi === 0;

    if (pi > 0) {
      console.log(`[AI Orchestrator] Switching to ${provider.name} (${isPrimary ? 'primary' : `backup ${pi}`}) for ${taskType}`);
      provider.reset(); // Fresh connection for new provider
    }

    for (let ri = 0; ri < retriesPerProvider; ri++) {
      totalAttempts++;
      const temp = totalAttempts === 1 ? primaryTemp : Math.max(0.2, primaryTemp - 0.1 * (totalAttempts - 1));
      const extraSystem = RETRY_EXTRA_INSTRUCTIONS[totalAttempts - 1] || '';

      // Backoff before retry (not on first attempt of each provider)
      if (ri > 0) {
        const delay = isRateLimitError(lastError) ? 3000 * ri : 1000 * ri;
        console.warn(`[AI Orchestrator] [${provider.name}] Waiting ${(delay / 1000).toFixed(1)}s before retry ${ri + 1}...`);
        await sleep(delay);
      }

      // On auth/rate-limit errors, reset provider before retry
      if (ri > 0 && (isAuthError(lastError) || isRateLimitError(lastError))) {
        provider.reset();
      }

      try {
        await waitForRateLimit();
        const msgs = buildMessages(extraSystem);
        const content = await provider.call({
          messages: msgs,
          temperature: temp,
          maxTokens: config.maxTokens,
          jsonMode: useJsonMode,
          timeout,
        });

        lastAICallTime = Date.now();
        if (!isPrimary) {
          console.log(`[AI Orchestrator] ✅ ${provider.name} succeeded for ${taskType} (fallback from ${providers[0].name})`);
        }
        return {
          success: true,
          content,
          attempts: totalAttempts,
          taskType,
          provider: provider.name,
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        const is429 = isRateLimitError(lastError);
        const isTimeout = isTimeoutError(lastError);

        console.warn(`[AI Orchestrator] [${provider.name}] Attempt ${ri + 1}/${retriesPerProvider} failed for ${taskType}: ${lastError.substring(0, 120)}`);

        // Track failed call for rate limiting
        lastAICallTime = Date.now();
        if (is429) lastAICallTime += 2_000;

        // On auth error: reset provider and retry (don't skip to next on first attempt)
        const isAuth = isAuthError(lastError);
        if (isAuth) {
          console.warn(`[AI Orchestrator] [${provider.name}] Auth error — resetting and retrying...`);
          provider.reset();
          if (ri === 0) continue; // Retry with fresh instance
        }

        // On rate limit or timeout: skip remaining retries on this provider, go to next
        if ((is429 || isTimeout) && ri === 0) {
          console.warn(`[AI Orchestrator] [${provider.name}] ${is429 ? 'Rate limited' : 'Timed out'} — skipping to next provider`);
          break; // Exit retry loop, move to next provider
        }
      }
    }
  }

  // All providers exhausted
  console.error(`[AI Orchestrator] ❌ All ${providers.length} providers failed for ${taskType}. Providers tried: ${providers.map(p => p.name).join(', ')}`);
  resetAllProviders();

  return {
    success: false,
    content: null,
    error: `All ${providers.length} providers failed for ${taskType}. Last: ${lastError}`,
    attempts: totalAttempts,
    taskType,
  };
}
