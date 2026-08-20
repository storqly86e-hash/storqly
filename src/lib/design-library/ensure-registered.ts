// ========================================
// Ensure Design Library is Registered
// ========================================
//
// Provides a safe, one-time initialization gate so that the design
// library components are registered in the componentRegistry before
// any code tries to look them up.
//
// Usage:
//   import { ensureLibraryRegistered } from '@/lib/design-library/ensure-registered';
//   ensureLibraryRegistered(); // no-op on subsequent calls

import { registerLibraryComponents } from './loader'
import { componentRegistry } from '@/lib/component-registry'

// ── One-time guard ──────────────────────────────────────────

let registered = false

/**
 * Ensure the design library has been registered in the componentRegistry.
 * Safe to call multiple times — only the first call actually registers.
 * Returns true once registration is guaranteed.
 */
export function ensureLibraryRegistered(): boolean {
  if (registered) return true
  registerLibraryComponents()
  registered = true
  return true
}

// ── Verification helper ─────────────────────────────────────

export interface RegistryState {
  registered: boolean
  totalVariants: number
  families: string[]
}

/**
 * Return diagnostic info about the current registry state.
 * Useful for debugging and the /api/design-library/status endpoint.
 */
export function verifyRegistryState(): RegistryState {
  // Ensure library is loaded before reading state
  ensureLibraryRegistered()

  const all = componentRegistry.getAll()
  const familySet = new Set(all.map((e) => e.family))

  return {
    registered: true,
    totalVariants: all.length,
    families: Array.from(familySet).sort(),
  }
}
