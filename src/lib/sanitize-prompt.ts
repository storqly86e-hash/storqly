// Sanitizes user prompts for store generation.
//
// Strategy:
//   1. Collapse long colon-delimited lists (5+ items) to prevent token bloat
//   2. Drop orphaned demand sentences that lost their meaning
//
// NOTE: We NO LONGER strip product/section count requests.
// The route now supports user-specified product counts via batched generation.

// ─── Product count extraction ─────────────────────────────────────
// Parses the user prompt to determine how many products they want.

const WORD_NUMBERS: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'dozen': 12,
};

/**
 * Extract the requested product count from a user prompt.
 * Returns a number between 1 and 100. Default: 3 (backward compatible).
 */
export function extractProductCount(prompt: string): number {
  const text = prompt.toLowerCase();
  let count = 3; // default

  // Pattern: "20 products", "20 items", "20 different products"
  const simpleMatch = text.match(/(\d{1,3})\s+(?:different\s+)?(?:products?|items?|pieces?|goods|listings?)/);
  if (simpleMatch) {
    count = parseInt(simpleMatch[1], 10);
  }

  // Pattern: "collection of 15 watches", "set of 10 items"
  const collectionMatch = text.match(/(?:collection|set|line|range|series)\s+of\s+(\d{1,3})/);
  if (collectionMatch) {
    const v = parseInt(collectionMatch[1], 10);
    if (v > count) count = v;
  }

  // Pattern: "with 10 items", "with 50 products"
  const withMatch = text.match(/with\s+(\d{1,3})\s+(?:different\s+)?(?:products?|items?)/);
  if (withMatch) {
    const v = parseInt(withMatch[1], 10);
    if (v > count) count = v;
  }

  // Pattern: "about 20" products, "around 30" items, "approximately 15"
  const aboutMatch = text.match(/(?:about|around|approximately|roughly|~)\s+(\d{1,3})/);
  if (aboutMatch) {
    const v = parseInt(aboutMatch[1], 10);
    if (v > count) count = v;
  }

  // Pattern: "a dozen products" (12)
  const dozenMatch = text.match(/a\s+dozen\b/);
  if (dozenMatch) {
    if (12 > count) count = 12;
  }

  // Pattern: word numbers: "five products", "ten items"
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    const wordMatch = text.match(new RegExp(`\\b${word}\\s+(?:different\\s+)?(?:products?|items?|pieces?)\\b`));
    if (wordMatch && num > count) {
      count = num;
    }
  }

  // Clamp to 1-100
  return Math.max(1, Math.min(100, count));
}

// ─── Prompt sanitization ─────────────────────────────────────────

export function sanitizePrompt(prompt: string): string {
  let s = prompt;

  // Step 1: Strip section count requests that exceed the 4-section cap.
  //         (We no longer strip product counts — those are handled by batched generation.)
  s = s.replace(/\b(\d+)\s*sections?\b/gi, (match) => {
    const num = parseInt(match, 10);
    return num > 4 ? '' : match;
  });

  // Step 2: Collapse any colon-delimited list with 5+ comma-separated items.
  //         (5+ because our cap is 4 - only collapse lists that exceed it.)
  // Handle lists ending with ". " or at end of string.
  const colonListRegex = /:([^:]*?)\.(?:\s|$)/g;
  s = s.replace(colonListRegex, (_match, afterColon) => {
    const items = splitListItems(afterColon);
    return items.length >= 5
      ? ' with various themed content.'
      : ':' + afterColon + '.';
  });

  // Handle colon-lists at end of string with no trailing period
  const endListRegex = new RegExp(':([^:]+)$', 'g');
  s = s.replace(endListRegex, (_match, afterColon) => {
    const items = splitListItems(afterColon);
    return items.length >= 5
      ? ' with various themed content.'
      : ':' + afterColon;
  });

  // Step 3: Clean up grammar artifacts
  s = s.replace(/\s{2,}/g, ' ');
  s = s.replace(/\s+:/g, ':');
  s = s.replace(/:\s*\./g, '.');

  // Step 4: Drop orphaned demand sentences that lost their meaning after stripping.
  const orphanRegex = new RegExp(
    '\\s*[^.]*\\b(?:I want|Include|I need|Add|Also include)\\b[^.]*with various themed content\\.\\\\s*',
    'gi'
  );
  s = s.replace(orphanRegex, ' ');

  // Final cleanup
  s = s.replace(/\.{2,}/g, '.');
  s = s.replace(/\s+/g, ' ').trim();
  if (s && !/[.!?]$/.test(s)) s += '.';

  return s;
}

function splitListItems(text: string): string[] {
  const normalized = text
    .replace(/\s+and\s+/gi, ', ')
    .replace(/\s+&\s+/gi, ', ');
  return normalized
    .split(',')
    .map(i => i.trim())
    .filter(i => i.length > 1);
}
