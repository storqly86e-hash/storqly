// ========================================
// Design Library Status API
// ========================================
//
// GET /api/design-library/status
// Returns diagnostic information about the design library registry:
// whether it's loaded, how many variants are registered, which families
// exist, and a sample of entries.

import { NextResponse } from 'next/server'
import { ensureLibraryRegistered, verifyRegistryState } from '@/lib/design-library/ensure-registered'
import { componentRegistry } from '@/lib/component-registry'

export async function GET() {
  // 1. Ensure the library is registered before reading state
  ensureLibraryRegistered()

  // 2. Pull registry state
  const state = verifyRegistryState()
  const all = componentRegistry.getAll()

  // 3. Build sample entries (up to 5, sorted alphabetically by componentId)
  const sampleEntries = all
    .slice()
    .sort((a, b) => a.componentId.localeCompare(b.componentId))
    .slice(0, 5)
    .map((entry) => ({
      componentId: entry.componentId,
      family: entry.family,
      variant: entry.variant,
      sectionType: entry.sectionType,
    }))

  return NextResponse.json({
    registered: state.registered,
    totalVariants: state.totalVariants,
    families: state.families,
    sampleEntries,
  })
}
