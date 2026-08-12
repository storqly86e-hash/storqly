// Sanitizes user prompts for store generation to prevent the AI
// from attempting to generate more content than the safe output caps.
//
// Strategy:
//   1. Strip count requests exceeding caps (>4 sections, >3 products)
//   2. Collapse long colon-delimited lists (5+ items)
//   3. Drop orphaned demand sentences that lost their meaning

export function sanitizePrompt(prompt: string): string {
  let s = prompt;

  // Step 1: Strip section/product count requests that exceed safe caps.
  //         Only strip numbers > our caps. Keep within-cap counts (they're harmless).
  s = s.replace(/\b(\d+)\s*sections?\b/gi, (match) => {
    const num = parseInt(match, 10);
    return num > 4 ? '' : match;
  });
  s = s.replace(/\b(\d+)\s*products?\b/gi, (match) => {
    const num = parseInt(match, 10);
    return num > 3 ? '' : match;
  });
  // Always strip "N product categories" (the enumeration is not useful)
  s = s.replace(/\b\d+\s*product\s*categor(y|ies)\b/gi, '');

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
  //         These are sentences that now just say "I want with various themed content."
  //         or "Include categories with various themed content." - no useful info.
  const orphanRegex = new RegExp(
    '\\\s*[^.]*\\b(?:I want|Include|I need|Add|Also include)\\b[^.]*with various themed content\\.\\\\s*',
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
