'use client'

import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useSession } from 'next-auth/react'
import { useStoreEditor } from '@/lib/store'
import type { Store } from '@/lib/store-schema'
import { createDefaultSection } from '@/lib/section-meta'

// Lazy-load heavy editor components to avoid 7.5s first-compile in iframes
const StoreRenderer = dynamic(() => import('@/components/store-renderer').then(m => ({ default: m.StoreRenderer })), { ssr: false })
const ChatPanel = dynamic(() => import('@/components/chat-panel'), { ssr: false, loading: () => <ChatPanelSkeleton /> })
const VisualEditor = dynamic(() => import('@/components/visual-editor'), { ssr: false, loading: () => <PanelSkeleton label="Sections" /> })
const MarketingKit = dynamic(() => import('@/components/marketing-kit'), { ssr: false })


// Inline skeleton components for lazy-loaded panels
function PanelSkeleton({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="h-4 w-20 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="flex-1 p-4 space-y-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800/60" />
        ))}
      </div>
    </div>
  )
}
function ChatPanelSkeleton() {
  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="h-4 w-24 animate-pulse rounded bg-zinc-800" />
        <div className="h-6 w-6 animate-pulse rounded bg-zinc-800" />
      </div>
      <div className="flex-1 p-4 space-y-3">
        {[1,2,3].map(i => (
          <div key={i} className={i === 3 ? 'h-8 w-3/4 animate-pulse rounded-lg bg-zinc-800/40 ml-8' : 'h-16 w-full animate-pulse rounded-xl bg-zinc-800/40'} />
        ))}
      </div>
      <div className="border-t border-zinc-800 p-3">
        <div className="h-10 animate-pulse rounded-lg bg-zinc-800/60" />
      </div>
    </div>
  )
}
import {
  Sparkles,
  Layers,
  Rocket,
  ArrowRight,
  Loader2,
  ArrowLeft,
  Globe,
  Save,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Eye,
  AlertCircle,
  AlertTriangle,
  X,
  RotateCcw,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Pencil,
  Clock,
  Store as StoreIcon,
} from 'lucide-react'
import AuthModal, { AuthButton } from '@/components/auth-modal'
import { createDemoStore } from '@/lib/store-schema'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { motion, AnimatePresence } from 'framer-motion'
import { toast, Toaster } from '@/components/ui/sonner'
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from 'react-resizable-panels'

// ─── Animation Variants ───────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.12, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
}

// ─── Background Image Enrichment (lazy, non-blocking) ─────
// Triggered after store generation completes. Fetches real product
// images sequentially without blocking the user or exhausting rate limits.

function triggerBackgroundImageEnrichment(store: Store) {
  if (!store.products || store.products.length === 0) return

  // Only enrich products that still have AI-hallucinated Unsplash URLs
  // (Real enriched URLs from the image search service will have different patterns)
  const needsEnrichment = store.products.filter(p =>
    p.images.length > 0 && p.images[0].includes('unsplash.com/photo-')
  )

  // Scan homepage sections for backgroundImage URLs and heroImages that need enrichment
  const homepage = store.pages.find(p => p.isHomepage)
  const sectionBackgrounds: { sectionId: string; query: string; currentUrl: string }[] = []
  const heroImageQueries: { index: number; query: string; currentSrc: string }[] = []
  if (homepage) {
    for (const section of homepage.sections) {
      const bgUrl = section.style?.backgroundImage
      if (bgUrl && bgUrl.includes('unsplash.com/photo-')) {
        const query = `${store.name} ${section.type} lifestyle setting photo`
        sectionBackgrounds.push({ sectionId: section.id, query, currentUrl: bgUrl })
      }
      // Enrich heroImages (content.heroImages array)
      if (section.type === 'hero') {
        const heroImages = section.content?.heroImages as Array<{ src: string; alt?: string }> | undefined
        if (heroImages && Array.isArray(heroImages)) {
          for (let i = 0; i < heroImages.length; i++) {
            const src = heroImages[i]?.src
            if (src && src.includes('unsplash.com/photo-')) {
              const alt = heroImages[i].alt || ''
              const query = `${store.name} ${alt || 'hero campaign'} visual ${i + 1}`
              heroImageQueries.push({ index: i, query, currentSrc: src })
            }
          }
        }
      }
    }
  }

  // Skip if nothing needs enrichment
  if (needsEnrichment.length === 0 && sectionBackgrounds.length === 0 && heroImageQueries.length === 0) return

  console.log(`[Storqly] Background image enrichment: ${needsEnrichment.length}/${store.products.length} products, ${sectionBackgrounds.length} section backgrounds, ${heroImageQueries.length} hero images`)

  fetch('/api/store/enrich-images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      products: needsEnrichment.map(p => ({
        id: p.id,
        name: p.name,
        images: [...p.images],
        category: p.category,
        description: p.description,
      })),
      storeName: store.name,
      sectionBackgrounds: sectionBackgrounds.length > 0 ? sectionBackgrounds : undefined,
      heroImageQueries: heroImageQueries.length > 0 ? heroImageQueries : undefined,
    }),
  })
    .then(res => res.json())
    .then(data => {
      const hasProductEnrichment = data.enriched > 0
      const hasSectionEnrichment = data.sectionBackgrounds && data.sectionBackgrounds.length > 0
      const hasHeroEnrichment = data.heroImages && data.heroImages.length > 0

      if (hasProductEnrichment || hasSectionEnrichment || hasHeroEnrichment) {
        console.log(`[Storqly] Background enrichment complete: ${data.enriched} enriched, ${data.kept} kept, ${data.failed} failed in ${data.latencyMs}ms`)
        import('@/lib/store').then(({ useStoreEditor }) => {
          const currentStore = useStoreEditor.getState().store
          if (currentStore) {
            // Update product images
            let updatedProducts = currentStore.products
            if (hasProductEnrichment) {
              updatedProducts = currentStore.products.map(prod => {
                const enriched = data.products?.find((ep: { id: string; images: string[] }) => ep.id === prod.id)
                if (enriched && enriched.images[0] !== prod.images[0]) {
                  return { ...prod, images: enriched.images }
                }
                return prod
              })
            }

            // Update section background images
            let updatedPages = currentStore.pages
            if (hasSectionEnrichment) {
              const bgMap = new Map(data.sectionBackgrounds.map((sb: { sectionId: string; url: string }) => [sb.sectionId, sb.url]))
              updatedPages = currentStore.pages.map(page => ({
                ...page,
                sections: page.sections.map(section => {
                  const newBg = bgMap.get(section.id)
                  if (newBg && section.style?.backgroundImage !== newBg) {
                    return { ...section, style: { ...section.style, backgroundImage: newBg } }
                  }
                  return section
                }),
              }))
            }

            // Update hero images in hero sections
            if (hasHeroEnrichment) {
              const heroMap = new Map(data.heroImages.map((hi: { index: number; src: string }) => [hi.index, hi.src]))
              updatedPages = updatedPages.map(page => ({
                ...page,
                sections: page.sections.map(section => {
                  if (section.type !== 'hero') return section
                  const currentHeroImages = section.content?.heroImages as Array<{ src: string; alt?: string }> | undefined
                  if (!currentHeroImages || !Array.isArray(currentHeroImages) || heroMap.size === 0) return section
                  let changed = false
                  const newHeroImages = currentHeroImages.map((img, idx) => {
                    const newSrc = heroMap.get(idx)
                    if (newSrc && newSrc !== img.src) {
                      changed = true
                      return { ...img, src: newSrc }
                    }
                    return img
                  })
                  return changed ? { ...section, content: { ...section.content, heroImages: newHeroImages } } : section
                }),
              }))
            }

            useStoreEditor.getState().setStore({ ...currentStore, products: updatedProducts, pages: updatedPages })
          }
        })
      }
    })
    .catch(err => {
      console.warn('[Storqly] Background enrichment failed (non-fatal):', err)
    })
}

// ─── Features Data ────────────────────────────────────────────────────

const features = [
  {
    icon: Sparkles,
    title: 'AI-Powered Generation',
    description: 'Describe your vision and watch it come to life',
  },
  {
    icon: Layers,
    title: 'Dual Editor Interface',
    description: 'Edit with chat or visual drag-and-drop — always in sync',
  },
  {
    icon: Rocket,
    title: 'Instant Publish',
    description: 'Go live on your own subdomain in one click',
  },
]

// ─── Generation Stage Machine ──────────────────────────────────────
// Ordered stages that correspond to SSE progress events from the server.
// The client advances through these as SSE events arrive.
// Fallback cycling only kicks in if no SSE progress events are received.

type GenerationStage = {
  id: string
  label: string
  icon: string // lucide icon name used for visual indicator
}

const GENERATION_STAGES: GenerationStage[] = [
  { id: 'analyzing', label: 'Analyzing your vision', icon: 'search' },
  { id: 'design-direction', label: 'Creating design direction', icon: 'palette' },
  { id: 'building-store', label: 'Building store with AI', icon: 'wand-2' },
  { id: 'processing', label: 'Processing AI response', icon: 'cpu' },
  { id: 'applying-design', label: 'Applying design system', icon: 'brush' },
  { id: 'quality-check', label: 'Running quality checks', icon: 'shield-check' },
  { id: 'finalizing', label: 'Finalizing your store', icon: 'check-circle-2' },
]

const STAGE_INDEX_MAP = new Map(GENERATION_STAGES.map((s, i) => [s.id, i]))

// Fallback messages used ONLY when SSE progress events stop arriving
const fallbackMessages = [
  'Analyzing your store vision...',
  'Building store layout...',
  'Creating product catalog...',
  'Applying design theme...',
  'Adding sections and content...',
  'Polishing the final details...',
  'Almost there...',
]

// ─── Landing Page ─────────────────────────────────────────────────────

type StoreListItem = {
  id: string
  name: string
  slug: string
  description: string
  published: boolean
  createdAt: string
  updatedAt: string
  thumbnail: string | null
}

function LandingPage() {
  const { data: session } = useSession()
  const [promptText, setPromptText] = useState('')
  const [mkOpen, setMkOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [myStores, setMyStores] = useState<StoreListItem[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // Ref to track elapsed seconds in the catch block (state may be stale due to closure)
  const elapsedSecondsRef = useRef(0)
  // Tracks whether the USER explicitly clicked Cancel (vs. programmatic abort from unmount/timeout)
  const userCancelledRef = useRef(false)
  // Tracks whether a generation is actively in progress (between start and finishOk/finishWithError)
  const generationActiveRef = useRef(false)
  // Stores the jobId from the server for stream-drop recovery
  const jobIdRef = useRef<string | null>(null)

  const {
    isGenerating,
    setIsGenerating,
    setStore,
  } = useStoreEditor()

  // Local UI state (not in Zustand — this is view-level)
  const [generationStatus, setGenerationStatus] = useState('')
  const [generationStage, setGenerationStage] = useState<string | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [aiStatus, setAiStatus] = useState<{ anyWorking: boolean; providers: Array<{ name: string; ok: boolean; error?: string }> } | null>(null)
  const [dbAvailable, setDbAvailable] = useState(true)

  // Check AI provider status and DB health once on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/ai-status').then(r => r.json()).catch(() => null),
      fetch('/api/health').then(r => r.json()).catch(() => null),
    ]).then(([aiData, healthData]) => {
      if (aiData) setAiStatus(aiData)
      if (healthData && typeof healthData.database?.ok === 'boolean') {
        setDbAvailable(healthData.database.ok)
      }
    })
  }, [])

  const clearTimers = useCallback(() => {
    if (progressTimerRef.current) { clearTimeout(progressTimerRef.current); progressTimerRef.current = null }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
  }, [])

  // ── Fetch user's stores on login ──
  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false
    // Defer loading state to next frame to avoid synchronous setState in effect
    const rafId = requestAnimationFrame(() => { if (!cancelled) setStoresLoading(true) })
    fetch('/api/store/list')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((data) => { if (!cancelled) setMyStores(data.stores ?? []) })
      .catch(() => { if (!cancelled) setMyStores([]) })
      .finally(() => { cancelAnimationFrame(rafId); if (!cancelled) setStoresLoading(false) })
    return () => { cancelled = true; cancelAnimationFrame(rafId) }
  }, [session?.user?.id])

  // ── Edit store: fetch full data via lookup, then load into editor ──
  const handleEditStore = useCallback(async (slug: string) => {
    setEditingSlug(slug)
    try {
      const res = await fetch(`/api/store/lookup?slug=${encodeURIComponent(slug)}`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setStore(data.store)
    } catch {
      toast.error('Failed to load store. It may have been deleted.')
    } finally {
      setEditingSlug(null)
    }
  }, [setStore])

  // Format relative time
  const formatTimeAgo = useCallback((iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return new Date(iso).toLocaleDateString()
  }, [])

  const handleCancel = useCallback(() => {
    console.warn('[GENERATE:CLIENT] User clicked Cancel — aborting generation')
    userCancelledRef.current = true
    generationActiveRef.current = false
    abortRef.current?.abort()
    clearTimers()
    setIsGenerating(false)
    setGenerationStatus('')
    setGenerationStage(null)
    setElapsedSeconds(0)
    setError(null)
  }, [clearTimers, setIsGenerating])

  const handleGenerate = useCallback(async () => {
    const trimmed = promptText.trim()
    if (!trimmed) {
      setError('Please describe your store to get started.')
      textareaRef.current?.focus()
      return
    }

    // Auth gate disabled — backend allows anonymous generation
    // TODO: re-enable when user accounts are set up
    // if (!session?.user?.id && dbAvailable) {
    //   setAuthOpen(true)
    //   return
    // }

    // Reset state
    setError(null)
    setIsGenerating(true)
    setGenerationStatus('Starting generation...')
    setElapsedSeconds(0)
    userCancelledRef.current = false
    generationActiveRef.current = true
    jobIdRef.current = null

    // Create abort controller for this request
    const controller = new AbortController()
    abortRef.current = controller

    // Generate a unique request ID for end-to-end tracing
    const requestId = `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    console.log(`[GENERATE:CLIENT][${requestId}] CLICK → Request started. Prompt: "${trimmed.slice(0, 80)}..."`)

    // Hard timeout: 330 seconds — must exceed server's 300s total time budget + safety margin.
    const HARD_TIMEOUT_MS = 330_000
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      console.warn(`[GENERATE:CLIENT][${requestId}] Hard timeout (${HARD_TIMEOUT_MS / 1000}s) reached — aborting. elapsed=${elapsedSecondsRef.current}s`)
      controller.abort()
    }, HARD_TIMEOUT_MS)

    // Elapsed time counter
    elapsedSecondsRef.current = 0
    elapsedTimerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    // Fallback progress cycling (used only if SSE progress events stop)
    let fallbackIdx = 0
    let receivedSSEProgress = false
    progressTimerRef.current = setInterval(() => {
      if (!receivedSSEProgress) {
        fallbackIdx = (fallbackIdx + 1) % fallbackMessages.length
        setGenerationStatus(fallbackMessages[fallbackIdx])
      }
    }, 3000)

    // ── Error classification helper ──
    type ErrorReason = 'user_cancel' | 'timeout' | 'network_disconnect' | 'server_error' | 'ai_error' | 'stream_dropped' | 'parse_error' | 'unknown'
    const classifyAndShowError = (reason: ErrorReason, context?: string) => {
      const elapsed = elapsedSecondsRef.current
      let message: string
      let description: string

      switch (reason) {
        case 'user_cancel':
          message = 'Generation was cancelled.'
          description = 'You cancelled the generation.'
          break
        case 'timeout':
          message = 'Generation timed out.'
          description = `The AI was still working after ${Math.round(elapsed / 60)} minutes. The server may be overloaded — please try again.`
          break
        case 'network_disconnect':
          message = 'Connection lost.'
          description = `Connection to the server was lost after ${elapsed}s. ${context || 'Please check your connection and try again.'}`
          break
        case 'server_error':
          message = 'Server error.'
          description = context || 'The server encountered an error. Please try again.'
          break
        case 'ai_error':
          message = 'AI generation failed.'
          description = context || 'The AI provider failed to generate a response. Please try again.'
          break
        case 'stream_dropped':
          message = 'Connection interrupted.'
          description = context || 'The connection was lost before the result arrived. Attempting recovery...'
          break
        case 'parse_error':
          message = 'Failed to process response.'
          description = context || 'The server sent an invalid response. Please try again.'
          break
        default:
          message = 'Generation failed.'
          description = context || 'Something went wrong. Please try again.'
      }

      console.warn(`[GENERATE:CLIENT][${requestId}] ERROR: reason=${reason}, message="${message}", elapsed=${elapsed}s, userCancelled=${userCancelledRef.current}`)
      clearTimeout(timeoutId)
      clearTimers()
      generationActiveRef.current = false
      setError(message)
      setIsGenerating(false)
      setGenerationStatus('')
      setGenerationStage(null)
      setElapsedSeconds(0)
      toast.error('Store generation failed', { description })
    }

    // ── Recovery helper: try to fetch result from server cache ──
    const attemptRecovery = async (): Promise<boolean> => {
      const jobId = jobIdRef.current
      if (!jobId) {
        console.log(`[GENERATE:CLIENT][${requestId}] No jobId available for recovery`)
        return false
      }
      console.log(`[GENERATE:CLIENT][${requestId}] Attempting recovery via jobId=${jobId}...`)
      setGenerationStatus('Recovering your store...')
      try {
        const res = await fetch(`/api/store/generate/recover?jobId=${encodeURIComponent(jobId)}`)
        if (!res.ok) return false
        const data = await res.json()
        if (data.success && data.store) {
          console.log(`[GENERATE:CLIENT][${requestId}] Recovery SUCCESS: store="${data.store.name}"`)
          // CRITICAL: Mark generation complete BEFORE setStore to prevent unmount abort
          generationActiveRef.current = false
          clearTimeout(timeoutId)
          clearTimers()
          setIsGenerating(false)
          setGenerationStatus('')
          setGenerationStage(null)
          setElapsedSeconds(0)
          setError(null)
          setStore(data.store)
          triggerBackgroundImageEnrichment(data.store)
          if (data.meta?._productCapHit) {
            toast.info(`Recovered store: ${data.store.name}. Generated ${data.meta._generatedCount} products.`, { duration: 8000 })
          } else {
            toast.success(`Recovered: ${data.store.name}`, { description: 'Your store was generated successfully but the connection was briefly interrupted.' })
          }
          return true
        }
        if (data.error) {
          console.log(`[GENERATE:CLIENT][${requestId}] Recovery found cached error: ${data.error.slice(0, 100)}`)
        }
        return false
      } catch (recoveryErr) {
        console.warn(`[GENERATE:CLIENT][${requestId}] Recovery failed: ${recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr)}`)
        return false
      }
    }

    // ── Helper: clean up on success ──
    const finishOk = () => {
      console.log(`[GENERATE:CLIENT][${requestId}] SUCCESS: generation completed. elapsed=${elapsedSecondsRef.current}s`)
      clearTimeout(timeoutId)
      clearTimers()
      generationActiveRef.current = false
      setIsGenerating(false)
      setGenerationStatus('')
      setGenerationStage(null)
      setElapsedSeconds(0)
    }

    try {
      console.log(`[GENERATE:CLIENT][${requestId}] FETCH_START`)

      // ── Fetch with auto-retry for transient gateway errors (502/503/504) ──
      const RETRYABLE_STATUSES = [502, 503, 504]
      let res: Response | undefined
      let retryCount = 0
      const maxRetries = 2

      while (retryCount <= maxRetries) {
        try {
          res = await fetch('/api/store/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
            body: JSON.stringify({ prompt: trimmed }),
            signal: controller.signal,
          })

          console.log(`[GENERATE:CLIENT][${requestId}] FETCH_RESPONSE: status=${res.status}, ok=${res.ok}`)

          if (!res.ok && RETRYABLE_STATUSES.includes(res.status) && retryCount < maxRetries) {
            retryCount++
            console.warn(`[GENERATE:CLIENT][${requestId}] Gateway error ${res.status}, retrying (${retryCount}/${maxRetries}) in 3s...`)
            setGenerationStatus('Connection issue — retrying...')
            await new Promise(r => setTimeout(r, 3000))
            continue
          }
          break
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof TypeError && retryCount < maxRetries) {
            retryCount++
            console.warn(`[GENERATE:CLIENT][${requestId}] Network error, retrying (${retryCount}/${maxRetries}) in 3s...`)
            setGenerationStatus('Connection issue — retrying...')
            await new Promise(r => setTimeout(r, 3000))
            continue
          }
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          const errName = fetchErr instanceof Error ? fetchErr.name : 'Unknown'
          console.warn(`[GENERATE:CLIENT][${requestId}] FETCH_FAILED: name=${errName}, msg="${msg}", aborted=${controller.signal.aborted}, userCancelled=${userCancelledRef.current}, elapsed=${elapsedSecondsRef.current}s`)
          if (controller.signal.aborted) {
            if (userCancelledRef.current) {
              classifyAndShowError('user_cancel')
            } else {
              classifyAndShowError('network_disconnect', 'The request was aborted unexpectedly. The page may have reloaded or the connection was lost.')
            }
          } else {
            classifyAndShowError('network_disconnect', 'Could not connect to the server. Please check your connection and try again.')
          }
          return
        }
      }

      if (!res!.ok) {
        let errorMsg = `Server error (${res!.status})`
        try {
          const errorData = await res!.json()
          errorMsg = errorData.error || errorMsg
        } catch { /* ignore parse error */ }
        console.warn(`[GENERATE:CLIENT][${requestId}] HTTP_ERROR: ${errorMsg}`)
        classifyAndShowError('server_error', errorMsg)
        return
      }

      // ── Consume SSE stream ──
      console.log(`[GENERATE:CLIENT][${requestId}] STREAM_OPEN: SSE stream opened, starting reader loop...`)
      const reader = res.body?.getReader()
      if (!reader) {
        classifyAndShowError('server_error', 'No response stream received from server.')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let resolved = false
      let doneReceived = false
      let currentEvent = '' // Persists across chunks — event: and data: lines can arrive in separate TCP segments
      let eventCount = 0

      // Listen for abort events (diagnostics only)
      const onAbort = () => {
        console.warn(`[GENERATE:CLIENT][${requestId}] ABORT_CALLED: reason=${controller.signal.reason}, userCancelled=${userCancelledRef.current}, elapsed=${elapsedSecondsRef.current}s, resolved=${resolved}`)
      }
      controller.signal.addEventListener('abort', onAbort, { once: true })

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log(`[GENERATE:CLIENT][${requestId}] STREAM_DONE: reader done. resolved=${resolved}, doneReceived=${doneReceived}, events=${eventCount}, elapsed=${elapsedSecondsRef.current}s`)
          break
        }

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith(':')) continue // heartbeat comment
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)

            if (currentEvent === 'progress') {
              receivedSSEProgress = true
              eventCount++
              try {
                const data = JSON.parse(dataStr)
                // Capture jobId from the first progress event
                if (data.jobId && !jobIdRef.current) {
                  jobIdRef.current = data.jobId
                  console.log(`[GENERATE:CLIENT][${requestId}] jobId received: ${data.jobId}`)
                }
                setGenerationStatus(data.message || 'Processing...')
                if (data.stage && STAGE_INDEX_MAP.has(data.stage)) {
                  setGenerationStage(data.stage)
                }
              } catch { /* ignore */ }
            } else if (currentEvent === 'result') {
              eventCount++
              console.log(`[GENERATE:CLIENT][${requestId}] RESULT_EVENT: received. events=${eventCount}, elapsed=${elapsedSecondsRef.current}s`)
              try {
                const data = JSON.parse(dataStr)
                if (!data.store) {
                  console.warn(`[GENERATE:CLIENT][${requestId}] RESULT_EVENT: missing store data`)
                  classifyAndShowError('parse_error', 'The AI response was missing store data.')
                  return
                }
                console.log(`[GENERATE:CLIENT][${requestId}] RESULT_EVENT: store="${data.store.name}", products=${data.store.products?.length ?? 0}`)
                resolved = true

                // IMPORTANT: Call finishOk BEFORE setStore, because setStore changes
                // the Zustand view to 'editor', which unmounts LandingPage and triggers
                // the cleanup effect. We must mark generation as complete BEFORE that.
                finishOk()
                setStore(data.store)
                triggerBackgroundImageEnrichment(data.store)

                if (data._productCapHit) {
                  toast.info(
                    `Generated ${data._generatedCount} products — for larger catalogs, you can add more via the chat editor.`,
                    { duration: 8000 }
                  )
                }

                return
              } catch (parseErr) {
                const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
                console.warn(`[GENERATE:CLIENT][${requestId}] RESULT_EVENT: parse failed: ${msg}`)
                classifyAndShowError('parse_error', msg)
                return
              }
            } else if (currentEvent === 'done') {
              eventCount++
              doneReceived = true
              console.log(`[GENERATE:CLIENT][${requestId}] DONE_EVENT: received. events=${eventCount}, elapsed=${elapsedSecondsRef.current}s`)
              // The done event is a sentinel — the result should have already been processed.
              // If we get here without resolved=true, the result event was missed.
            } else if (currentEvent === 'error') {
              eventCount++
              try {
                const data = JSON.parse(dataStr)
                const serverMsg = data.message || 'Generation failed'
                console.warn(`[GENERATE:CLIENT][${requestId}] ERROR_EVENT: "${serverMsg.slice(0, 200)}"`)
                // Classify based on error message content
                if (serverMsg.includes('AI generation failed') || serverMsg.includes('provider error')) {
                  classifyAndShowError('ai_error', serverMsg.slice(0, 300))
                } else {
                  classifyAndShowError('server_error', serverMsg.slice(0, 300))
                }
                return
              } catch {
                classifyAndShowError('parse_error', 'Generation failed — could not parse server error.')
                return
              }
            }
            currentEvent = ''
          }
        }
      }

      // ── Stream ended without result ──
      // Three possible scenarios:
      // 1. doneReceived=true, resolved=false → result event was missed (network corruption)
      // 2. doneReceived=false, resolved=false → stream dropped mid-generation
      // 3. doneReceived=true, resolved=true → should not reach here (returned above)

      if (!resolved) {
        console.warn(`[GENERATE:CLIENT][${requestId}] STREAM_ENDED_NO_RESULT: doneReceived=${doneReceived}, events=${eventCount}, elapsed=${elapsedSecondsRef.current}s, jobId=${jobIdRef.current}`)

        // Attempt recovery from server cache
        const recovered = await attemptRecovery()
        if (recovered) return

        // Recovery failed — show appropriate error
        if (doneReceived) {
          // Server completed generation but result event was lost in transit
          classifyAndShowError('stream_dropped', 'The server generated your store but the response was lost in transit. Please try again — the server-side cache may help recover it.')
        } else if (eventCount > 3 && elapsedSecondsRef.current > 10) {
          // Received some events then connection dropped — likely network issue
          classifyAndShowError('network_disconnect', `Connection was lost after receiving ${eventCount} events over ${elapsedSecondsRef.current}s. The AI may have still completed your store — please try again.`)
        } else if (eventCount === 0) {
          // No events received at all — connection failed immediately
          classifyAndShowError('network_disconnect', 'No data was received from the server. The connection may have been blocked or the server is unreachable.')
        } else {
          classifyAndShowError('stream_dropped', `Stream ended without a result after ${eventCount} events and ${elapsedSecondsRef.current}s.`)
        }
      }
    } catch (err: unknown) {
      // Last-resort safety net — reader.read() or JSON.parse threw
      clearTimeout(timeoutId)
      clearTimers()
      generationActiveRef.current = false
      let reason: ErrorReason = 'unknown'
      let context = ''

      if (err instanceof Error) {
        const errName = err.name
        const errMsg = err.message
        if (errName === 'AbortError') {
          if (timedOut) {
            reason = 'timeout'
          } else if (userCancelledRef.current) {
            reason = 'user_cancel'
          } else if (elapsedSecondsRef.current > 10 && !resolved) {
            reason = 'network_disconnect'
            context = `Connection lost after ${elapsedSecondsRef.current}s while the AI was still working. Please try again.`
          } else {
            reason = 'network_disconnect'
            context = 'The request was interrupted unexpectedly. Please try again.'
          }
        } else {
          reason = 'unknown'
          context = errMsg
        }
        console.warn(`[GENERATE:CLIENT][${requestId}] CAUGHT: name=${errName}, reason=${reason}, message="${context}", elapsed=${elapsedSecondsRef.current}s, timedOut=${timedOut}, resolved=${resolved}, userCancelled=${userCancelledRef.current}, events=${eventCount}`)
      } else {
        console.warn(`[GENERATE:CLIENT][${requestId}] CAUGHT non-Error: ${String(err)}`)
      }

      // Attempt recovery for network-related failures (NOT for user cancel — handleCancel already cleaned up)
      if ((reason === 'network_disconnect' || reason === 'stream_dropped') && !resolved) {
        const recovered = await attemptRecovery()
        if (recovered) return
      }

      // If user explicitly cancelled, handleCancel() already cleaned up state.
      // Don't overwrite with error state or show another toast.
      if (reason === 'user_cancel') {
        console.log(`[GENERATE:CLIENT][${requestId}] User cancel confirmed in catch block — state already cleaned up by handleCancel`)
        return
      }

      setError(reason === 'timeout' ? 'Generation timed out.' : 'Generation failed.')
      setIsGenerating(false)
      setGenerationStatus('')
      setGenerationStage(null)
      setElapsedSeconds(0)
      toast.error('Store generation failed', { description: context || 'Something went wrong. Please try again.' })
    }
  }, [promptText, session, setIsGenerating, setStore, clearTimers, setAuthOpen, dbAvailable])

  // Cleanup on unmount — abort ONLY if generation is still actively in progress.
  // This prevents aborting a just-completed generation when setStore() triggers
  // the view change to 'editor' and unmounts LandingPage.
  useEffect(() => {
    return () => {
      clearTimers()
      if (generationActiveRef.current && abortRef.current) {
        console.warn('[GENERATE:CLIENT] Component unmounting while generation active — aborting')
        abortRef.current.abort()
      }
    }
  }, [clearTimers])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleGenerate()
    }
  }

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <>
      {/* ── Fixed Nav ── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#09090b]/80 backdrop-blur-xl">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <span className="text-2xl font-bold tracking-tight bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f43f5e] bg-clip-text text-transparent">
            Storqly
          </span>
          <div className="hidden sm:flex items-center gap-4">
            <span className="text-sm text-zinc-500">
              AI-Powered Store Builder
            </span>
            <AuthButton onSignIn={() => setAuthOpen(true)} />
          </div>
          <div className="flex sm:hidden">
            <AuthButton onSignIn={() => setAuthOpen(true)} />
          </div>
        </nav>
      </header>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />

      {/* ── Hero Section ── */}
      <section className="relative flex flex-1 flex-col items-center justify-center px-5 pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-gradient-to-br from-[#a855f7]/15 via-[#ec4899]/10 to-transparent blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-3xl text-center">
          <motion.h1
            custom={0}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
          >
            Build Your Store{' '}
            <span className="bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f43f5e] bg-clip-text text-transparent">
              in Seconds
            </span>
          </motion.h1>

          <motion.p
            custom={1}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-6 text-lg text-zinc-400 sm:text-xl"
          >
            Describe your store. AI builds it. You customize and publish.
          </motion.p>

          <motion.div
            custom={2}
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="mt-10"
          >
            <div className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-2xl shadow-black/40 transition-all duration-300 focus-within:border-[#a855f7]/40 focus-within:shadow-[0_0_40px_-8px_rgba(168,85,247,0.25)]">
              <Textarea
                ref={textareaRef}
                value={promptText}
                onChange={(e) => { setPromptText(e.target.value); setError(null) }}
                onKeyDown={handleKeyDown}
                disabled={isGenerating}
                placeholder='Describe the store you want to build... (e.g. "A modern minimalist jewelry brand with gold accents, selling handcrafted rings, necklaces, and bracelets")'
                className="min-h-[120px] resize-none rounded-2xl border-0 bg-transparent px-5 py-5 text-base text-white placeholder:text-zinc-600 focus-visible:ring-0 focus-visible:border-0 sm:text-lg md:min-h-[140px]"
              />

              <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3">
                <span className="text-xs text-zinc-600">
                  Press{' '}
                  <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                    ⌘↵
                  </kbd>{' '}
                  to generate
                </span>

                {aiStatus && !aiStatus.anyWorking && !isGenerating && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    AI unavailable
                  </span>
                )}

                <div className="flex items-center gap-2">
                  {isGenerating && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancel}
                      className="h-8 gap-1.5 rounded-lg px-3 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                    >
                      <X className="h-3.5 w-3.5" />
                      Cancel
                    </Button>
                  )}
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !promptText.trim()}
                    className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f43f5e] px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#a855f7]/20 transition-all duration-300 hover:scale-105 hover:shadow-[#a855f7]/30 disabled:opacity-50 disabled:hover:scale-100"
                  >
                    {isGenerating ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        Generate Store
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {/* Status feedback area */}
            <div className="mt-4 min-h-[72px]">
              <AnimatePresence mode="wait">
                {isGenerating && !error && (
                  <motion.div
                    key="progress"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col items-center gap-2.5"
                  >
                    {/* Stage progress indicator */}
                    {generationStage && (
                      <div className="flex items-center gap-1">
                        {GENERATION_STAGES.map((stage, i) => {
                          const stageIdx = STAGE_INDEX_MAP.get(generationStage) ?? 0
                          const isActive = stage.id === generationStage
                          const isDone = i < stageIdx
                          return (
                            <div key={stage.id} className="flex items-center gap-1">
                              <div
                                className={cn(
                                  'flex items-center justify-center rounded-full transition-all duration-500',
                                  isActive
                                    ? 'h-6 w-6 bg-[#a855f7] shadow-lg shadow-[#a855f7]/30'
                                    : isDone
                                      ? 'h-5 w-5 bg-[#a855f7]/60'
                                      : 'h-5 w-5 bg-zinc-800'
                                )}
                                title={stage.label}
                              >
                                {isDone ? (
                                  <Check className="h-3 w-3 text-white" />
                                ) : isActive ? (
                                  <Loader2 className="h-3 w-3 animate-spin text-white" />
                                ) : null}
                              </div>
                              {i < GENERATION_STAGES.length - 1 && (
                                <div className={cn(
                                  'h-0.5 w-3 rounded-full transition-colors duration-500',
                                  i < stageIdx ? 'bg-[#a855f7]/60' : 'bg-zinc-800'
                                )} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <p className="flex items-center gap-2 text-sm text-zinc-400">
                      {!generationStage && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a855f7]" />}
                      {generationStatus}
                    </p>
                    <p className="text-xs text-zinc-600">
                      Elapsed: {formatElapsed(elapsedSeconds)}
                    </p>
                  </motion.div>
                )}

                {error && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col items-center gap-2"
                  >
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-left max-w-lg">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-red-300">Generation failed</p>
                        <p className="mt-1 text-xs text-red-400/80 leading-relaxed">{error}</p>
                      </div>
                      <button
                        onClick={() => setError(null)}
                        className="shrink-0 text-zinc-500 hover:text-zinc-300"
                        aria-label="Dismiss error"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerate}
                      className="mt-1 gap-1.5 text-xs border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Try Again
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── My Stores ── */}
      {session?.user?.id && (storesLoading || myStores.length > 0) && (
        <section className="px-5 pb-10">
          <div className="mx-auto max-w-5xl">
            <div className="mb-5 flex items-center gap-3">
              <StoreIcon className="h-5 w-5 text-zinc-400" />
              <h2 className="text-lg font-semibold text-white">My Stores</h2>
              {!storesLoading && (
                <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                  {myStores.length}
                </span>
              )}
            </div>

            {storesLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="mb-3 h-24 rounded-lg bg-zinc-800" />
                    <div className="mb-2 h-4 w-3/4 rounded bg-zinc-800" />
                    <div className="h-3 w-1/2 rounded bg-zinc-800/60" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myStores.map((s) => (
                  <div
                    key={s.id}
                    className="group relative rounded-xl border border-white/[0.06] bg-white/[0.02] transition-all duration-200 hover:border-white/[0.12] hover:bg-white/[0.04]"
                  >
                    {/* Thumbnail area */}
                    <div className="flex h-28 items-center justify-center rounded-t-xl bg-gradient-to-br from-zinc-800 to-zinc-900">
                      {s.thumbnail ? (
                        <img
                          src={s.thumbnail}
                          alt={s.name}
                          className="h-full w-full rounded-t-xl object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span className="text-3xl font-bold text-zinc-700">
                          {s.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>

                    <div className="p-4">
                      {/* Name + status badge */}
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <h3 className="truncate text-sm font-semibold text-white">
                          {s.name}
                        </h3>
                        <span
                          className={s.published
                            ? 'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400'
                            : 'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-400'}
                        >
                          {s.published ? 'Published' : 'Draft'}
                        </span>
                      </div>

                      {/* Timestamp */}
                      <p className="mb-3 flex items-center gap-1 text-xs text-zinc-500">
                        <Clock className="h-3 w-3" />
                        {formatTimeAgo(s.updatedAt)}
                      </p>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleEditStore(s.slug)}
                          disabled={editingSlug === s.slug}
                          className="h-7 gap-1.5 rounded-lg bg-white/[0.06] px-3 text-xs font-medium text-zinc-300 hover:bg-white/[0.1] hover:text-white"
                        >
                          {editingSlug === s.slug ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Pencil className="h-3 w-3" />
                          )}
                          Edit
                        </Button>
                        {s.published && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { window.location.replace(`/?store=${s.slug}`) }}
                            className="h-7 gap-1.5 rounded-lg px-3 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Quick Actions ── */}
      <div className="px-5 pb-6">
        <div className="mx-auto flex max-w-5xl justify-center gap-3">
          <button
            onClick={() => setMkOpen(true)}
            className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs font-medium text-zinc-400 transition-all duration-200 hover:border-[#a855f7]/30 hover:bg-[#a855f7]/5 hover:text-[#c084fc]"
          >
            <FileText className="h-3.5 w-3.5" />
            Business Tools
            <ArrowRight className="h-3 w-3 opacity-50" />
          </button>
          <button
            onClick={() => {
              const demo = createDemoStore()
              setStore(demo)
              toast.success('Demo store loaded — explore the editor!')
            }}
            className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs font-medium text-emerald-400 transition-all duration-200 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <Eye className="h-3.5 w-3.5" />
            Try Demo Store
            <ArrowRight className="h-3 w-3 opacity-50" />
          </button>
        </div>
      </div>

      {/* ── Features Section ── */}
      <section className="px-5 pb-24 sm:pb-32">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
        >
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              variants={fadeUp}
              className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04] sm:p-8"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#a855f7]/20 to-[#ec4899]/20">
                <feature.icon className="h-5 w-5 text-[#c084fc]" />
              </div>
              <h3 className="text-base font-semibold text-white sm:text-lg">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-500">
                {feature.description}
              </p>
              <div className={cn(
                'mt-4 flex items-center gap-1 text-sm font-medium text-zinc-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                i === 0 && 'text-[#c084fc]',
                i === 1 && 'text-[#f472b6]',
                i === 2 && 'text-[#fb7185]',
              )}>
                Explore
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* ── Marketing Kit Overlay ── */}
      <MarketingKit isOpen={mkOpen} onClose={() => setMkOpen(false)} />
    </>
  )
}

// ─── Preview Panel (direct Zustand subscription for reliable re-renders) ──
// This component subscribes to Zustand independently so the preview always
// re-renders when the store changes, regardless of PanelGroup/Panel
// internal render behavior.

function PreviewPanel() {
  const store = useStoreEditor((s) => s.store)
  const selectedSectionId = useStoreEditor((s) => s.selectedSectionId)
  const setSelectedSectionId = useStoreEditor((s) => s.setSelectedSectionId)
  const editorCurrentPageId = useStoreEditor((s) => s.editorCurrentPageId)
  const setEditorCurrentPageId = useStoreEditor((s) => s.setEditorCurrentPageId)
  const addSection = useStoreEditor((s) => s.addSection)

  // Handler for the center "+" button on empty custom pages — now accepts a section type
  const handleAddSectionClick = useCallback((type: import('@/lib/store-schema').SectionType) => {
    if (!editorCurrentPageId) return
    const newSection = createDefaultSection(type)
    addSection(editorCurrentPageId, newSection)
  }, [editorCurrentPageId, addSection])

  if (!store) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-100">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-200">
            <Eye className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="text-sm font-medium text-zinc-500">No store to preview</p>
          <p className="mt-1 text-xs text-zinc-400">Generate a store to see it here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-zinc-100">
      <div className="flex h-8 shrink-0 items-center justify-center border-b border-zinc-200 bg-white">
        <Eye className="mr-1.5 h-3 w-3 text-zinc-400" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">Preview</span>
      </div>
      <div className="flex-1 overflow-auto">
        <StoreRenderer
          store={store}
          selectedSectionId={selectedSectionId}
          onSelectSection={setSelectedSectionId}
          externalCurrentPageId={editorCurrentPageId}
          onPageChange={setEditorCurrentPageId}
          onAddSectionClick={handleAddSectionClick}
        />
      </div>
    </div>
  )
}

// ─── Editor View ─────────────────────────────────────────────────────

function EditorView() {
  const store = useStoreEditor((s) => s.store)
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)
  const leftPanelRef = useRef<ImperativePanelHandle>(null)
  const rightPanelRef = useRef<ImperativePanelHandle>(null)

  // Clear stale panel layout data that may cause 0-width panels in iframes
  useEffect(() => {
    try {
      localStorage.removeItem('react-resizable-panels:storqly-editor-layout')
    } catch { /* localStorage may be blocked in some iframe contexts */ }
  }, [])

  // Collapse/expand panels programmatically — never unmount them
  useEffect(() => {
    if (showLeft) {
      leftPanelRef.current?.expand()
    } else {
      leftPanelRef.current?.collapse()
    }
  }, [showLeft])

  useEffect(() => {
    if (showRight) {
      rightPanelRef.current?.expand()
    } else {
      rightPanelRef.current?.collapse()
    }
  }, [showRight])

  // If no store is loaded (e.g. page refresh lost Zustand state),
  // redirect back to landing after a brief moment
  const reset = useStoreEditor((s) => s.reset)
  useEffect(() => {
    if (!store) {
      const t = setTimeout(() => { reset() }, 800)
      return () => clearTimeout(t)
    }
  }, [store, reset])

  if (!store) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#a855f7]" />
          <p className="mt-3 text-sm text-zinc-500">Redirecting…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <EditorToolbar onToggleLeft={setShowLeft} onToggleRight={setShowRight} showLeft={showLeft} showRight={showRight} />

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" id="storqly-editor-layout">
          <Panel
            id="left"
            order={1}
            defaultSize={18}
            minSize={12}
            maxSize={28}
            collapsible={true}
            collapsedSize={0}
            ref={leftPanelRef}
          >
            <div className="h-full overflow-hidden">
              <VisualEditor />
            </div>
          </Panel>

          <PanelResizeHandle className="group relative flex w-1.5 items-center justify-center bg-zinc-900 transition-colors hover:bg-zinc-800 data-[resize-handle-active]:bg-[#a855f7]/30 border-l border-zinc-800">
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </PanelResizeHandle>

          <Panel
            id="center"
            order={2}
            defaultSize={48}
            minSize={35}
          >
            <PreviewPanel />
          </Panel>

          <PanelResizeHandle className="group relative flex w-1.5 items-center justify-center bg-zinc-900 transition-colors hover:bg-zinc-800 data-[resize-handle-active]:bg-[#a855f7]/30 border-r border-zinc-800">
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </PanelResizeHandle>

          <Panel
            id="right"
            order={3}
            defaultSize={22}
            minSize={16}
            maxSize={32}
            collapsible={true}
            collapsedSize={0}
            ref={rightPanelRef}
          >
            <div className="h-full overflow-hidden">
              <ChatPanel />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}

// ─── Editor Toolbar ──────────────────────────────────────────────────

function EditorToolbar({
  onToggleLeft,
  onToggleRight,
  showLeft,
  showRight,
}: {
  onToggleLeft: (v: boolean | ((prev: boolean) => boolean)) => void
  onToggleRight: (v: boolean | ((prev: boolean) => boolean)) => void
  showLeft: boolean
  showRight: boolean
}) {
  const store = useStoreEditor((s) => s.store)
  const reset = useStoreEditor((s) => s.reset)
  const isPublishing = useStoreEditor((s) => s.isPublishing)
  const setIsPublishing = useStoreEditor((s) => s.setIsPublishing)
  const isPublished = useStoreEditor((s) => s.isPublished)
  const setIsPublished = useStoreEditor((s) => s.setIsPublished)
  const [isSaving, setIsSaving] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)

  const handleBack = () => {
    reset()
  }

  const handleSave = async () => {
    if (!store || isSaving) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/store/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      const data = await res.json()
      toast.success(`Draft saved — ID: ${data.id}`, {
        description: `Slug: ${data.slug}`,
        duration: 5000,
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
        toast.error('Connection lost while saving', {
          description: 'Your work is still in the editor. Please check your connection and try again.',
          duration: 6000,
        })
      } else {
        toast.error('Failed to save store', {
          description: msg || 'An unexpected error occurred. Please try again.',
          duration: 5000,
        })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!store || isPublishing) return
    setIsPublishing(true)
    try {
      const res = await fetch('/api/store/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store }),
      })
      if (!res.ok) {
        // Try to get server error details
        let serverMsg = ''
        try {
          const errorData = await res.json()
          serverMsg = errorData.error || ''
        } catch { /* ignore */ }

        if (res.status === 401) {
          throw new Error('AUTH_REQUIRED')
        } else if (res.status === 502 || res.status === 503 || res.status === 504) {
          throw new Error('GATEWAY_ERROR')
        } else {
          throw new Error(serverMsg || `Server error (${res.status})`)
        }
      }
      const data = await res.json()
      const slug = data.slug
      setIsPublished(true)
      // Build a real viewable URL using the current origin
      const baseUrl = window.location.origin
      const viewUrl = `${baseUrl}/?store=${slug}`
      setPublishedUrl(viewUrl)
      toast.success('Store published successfully!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''

      if (msg === 'AUTH_REQUIRED') {
        toast.error('Please sign in to publish', {
          description: 'You need to be signed in before publishing your store.',
          duration: 6000,
        })
        setAuthOpen(true)
      } else if (msg === 'GATEWAY_ERROR') {
        toast.error('Server temporarily unavailable', {
          description: 'The server seems to be restarting. Please wait a moment and try again.',
          duration: 6000,
        })
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch') || msg.includes('Load failed')) {
        toast.error('Connection lost while publishing', {
          description: 'Your store data is safe. Please check your connection and try again.',
          duration: 6000,
        })
      } else {
        toast.error('Failed to publish store', {
          description: msg || 'An unexpected error occurred. Please try again.',
          duration: 5000,
        })
      }
    } finally {
      setIsPublishing(false)
    }
  }

  const handleCopyUrl = useCallback(async () => {
    if (!publishedUrl) return
    try {
      await navigator.clipboard.writeText(publishedUrl)
      setCopied(true)
      toast.success('URL copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = publishedUrl
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      toast.success('URL copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }
  }, [publishedUrl])

  return (
    <>
      <div className="flex h-12 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={handleBack}
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="h-5 w-px bg-zinc-800" />
          <Button
            variant={showLeft ? 'secondary' : 'ghost'}
            size="sm"
            className={`h-8 gap-1.5 ${showLeft ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
            onClick={() => onToggleLeft((v) => !v)}
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sections</span>
          </Button>
          <Button
            variant={showRight ? 'secondary' : 'ghost'}
            size="sm"
            className={`h-8 gap-1.5 ${showRight ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
            onClick={() => onToggleRight((v) => !v)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Chat</span>
          </Button>
        </div>

        <div className="flex items-center gap-1.5">
          {publishedUrl && (
            <div className="mr-2 hidden sm:flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1">
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="max-w-[180px] truncate text-xs font-medium text-emerald-300">
                {publishedUrl}
              </span>
              <button
                onClick={handleCopyUrl}
                className="ml-1 rounded p-0.5 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                aria-label="Copy URL"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
              <a
                href={publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded p-0.5 text-emerald-400 hover:text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                aria-label="Open published store"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          <AuthButton onSignIn={() => setAuthOpen(true)} />
          <div className="h-5 w-px bg-zinc-800" />
          <span className="mr-2 text-xs font-medium text-zinc-500 hidden md:inline truncate max-w-[200px]">
            {store?.name || 'Untitled Store'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className={`h-3.5 w-3.5 ${isSaving ? 'animate-pulse' : ''}`} />
            <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f43f5e] text-white shadow-none hover:opacity-90"
            onClick={handlePublish}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isPublished ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">{isPublishing ? 'Publishing...' : isPublished ? 'Published' : 'Publish'}</span>
          </Button>
        </div>
      </div>

      {/* Publish Success Dialog */}
      <AnimatePresence>
        {publishedUrl && !isPublishing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setPublishedUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mx-4 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Success icon */}
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
                <Check className="h-7 w-7 text-emerald-400" />
              </div>

              <h3 className="mb-1 text-center text-lg font-semibold text-zinc-100">
                Store Published!
              </h3>
              <p className="mb-5 text-center text-sm text-zinc-400">
                Your store is now live and ready to share.
              </p>

              {/* URL Display */}
              <div className="mb-5 rounded-xl border border-zinc-700/60 bg-zinc-800/60 p-3">
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500">Live URL</p>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate rounded-lg bg-zinc-900 px-3 py-2 font-mono text-sm text-emerald-300">
                    {publishedUrl}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    onClick={handleCopyUrl}
                    aria-label="Copy URL"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  className="flex-1 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                  onClick={() => setPublishedUrl(null)}
                >
                  Close
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f43f5e] text-white shadow-none hover:opacity-90"
                  onClick={() => {
                    window.open(publishedUrl, '_blank')
                  }}
                >
                  <ExternalLink className="h-4 w-4" />
                  View Live Store
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  )
}

// ─── Published Store Viewer (read-only, shown via ?store=slug) ────────

function PublishedStoreViewer({ slug }: { slug: string }) {
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/store/lookup?slug=${encodeURIComponent(slug)}`)
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `Store not found (${res.status})`)
        }
        const data = await res.json()
        // Normalize the store so the renderer never crashes on missing fields
        const raw = data.store as Record<string, unknown>
        const normalized: Store = {
          id: String(raw.id || ''),
          name: String(raw.name || 'Untitled Store'),
          slug: String(raw.slug || slug),
          description: raw.description != null ? String(raw.description) : undefined,
          announcementText: raw.announcementText != null ? String(raw.announcementText) : undefined,
          theme: (raw.theme as Store['theme']) || {
            colors: { primary: '#000000', secondary: '#333333', accent: '#666666', background: '#ffffff', surface: '#f5f5f5', text: '#111111', textMuted: '#666666', border: '#e5e5e5' },
            fonts: { heading: 'Inter', body: 'Inter' },
            spacing: 'normal',
            borderRadius: 'md',
          },
          pages: Array.isArray(raw.pages) ? raw.pages as Store['pages'] : [],
          products: Array.isArray(raw.products) ? raw.products as Store['products'] : [],
          published: true,
          publishedAt: raw.publishedAt != null ? String(raw.publishedAt) : undefined,
          createdAt: String(raw.createdAt || new Date().toISOString()),
          updatedAt: String(raw.updatedAt || new Date().toISOString()),
          // Preserve design library metadata if present
          ...(raw.designLibrary ? { designLibrary: raw.designLibrary as Store['designLibrary'] } : {}),
        } as Store
        if (!cancelled) setStore(normalized)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load store')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [slug])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#a855f7]" />
          <p className="mt-3 text-sm text-gray-500">Loading store…</p>
        </div>
      </div>
    )
  }

  if (error || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
          <AlertCircle className="h-8 w-8 text-red-400" />
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Store Not Found</h2>
        <p className="mb-6 max-w-sm text-center text-sm text-gray-500">
          {error || 'This store could not be found or has not been published.'}
        </p>
        <Button
          variant="outline"
          onClick={() => window.location.replace('/')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Storqly
        </Button>
      </div>
    )
  }

  return (
    <>
      <StoreRenderer store={store} />
      <Toaster />
      {/* Minimal footer for published stores */}
      <div className="fixed bottom-3 right-3 z-40">
        <a
          href="/"
          className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm backdrop-blur transition-colors hover:border-gray-300 hover:text-gray-700"
        >
          <Sparkles className="h-3 w-3" />
          Built with Storqly
        </a>
      </div>
    </>
  )
}

// ─── Page Root ────────────────────────────────────────────────────────

function HomePage() {
  const view = useStoreEditor((s) => s.view)
  const searchParams = useSearchParams()
  const storeSlug = searchParams.get('store')
  // If ?store=slug is present, show the published store viewer (read-only)
  if (storeSlug) {
    return (
      <main className="min-h-screen bg-white">
        <PublishedStoreViewer slug={storeSlug} />
      </main>
    )
  }

  return (
    <>
      <main className={view === 'editor' ? 'h-screen w-screen overflow-hidden' : 'min-h-screen flex flex-col bg-[#09090b] text-white'}>
        {view === 'landing' ? <LandingPage /> : <EditorView />}

        {view === 'landing' && (
          <footer className="mt-auto border-t border-white/[0.05] px-5 py-6">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 sm:flex-row">
              <p className="text-sm text-zinc-600">© 2025 Storqly. AI-first commerce.</p>
              <p className="text-xs text-zinc-700">
                Build, customize, and launch — powered by AI.
              </p>
            </div>
          </footer>
        )}
      </main>
      <Toaster />
    </>
  )
}

// ─── Exported Page Root (wrapped in Suspense for useSearchParams) ────
// useSearchParams() must be within a <Suspense> boundary to avoid
// hydration mismatches. See: https://nextjs.org/docs/app/api-reference/functions/use-search-params

export default function Home() {
  return (
    <div suppressHydrationWarning>
      <Suspense fallback={<HomePageSkeleton />}>
        <HomePage />
      </Suspense>
    </div>
  )
}
/** Minimal skeleton shown while searchParams are resolving */
function HomePageSkeleton() {
  return (
    <main className="min-h-screen flex flex-col bg-[#09090b] text-white" suppressHydrationWarning>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    </main>
  )
}
