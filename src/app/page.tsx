'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useStoreEditor } from '@/lib/store'
import { StoreRenderer } from '@/components/store-renderer'
import ChatPanel from '@/components/chat-panel'
import VisualEditor from '@/components/visual-editor'
import type { Store } from '@/lib/store-schema'
import MarketingKit from '@/components/marketing-kit'
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
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { motion, AnimatePresence } from 'framer-motion'
import { toast, Toaster } from '@/components/ui/sonner'
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
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

// ─── Progress Messages (fallback when no SSE progress received) ──

const progressMessages = [
  'Analyzing your store vision...',
  'Generating store layout...',
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

  const {
    isGenerating,
    setIsGenerating,
    setStore,
    setStoreWithFallback,
  } = useStoreEditor()

  // Local UI state (not in Zustand — this is view-level)
  const [generationStatus, setGenerationStatus] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const clearTimers = useCallback(() => {
    if (progressTimerRef.current) { clearTimeout(progressTimerRef.current); progressTimerRef.current = null }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
  }, [])

  // ── Fetch user's stores on login ──
  useEffect(() => {
    if (!session?.user?.id) {
      setMyStores([])
      return
    }
    let cancelled = false
    setStoresLoading(true)
    fetch('/api/store/list')
      .then((r) => { if (!r.ok) throw new Error(); return r.json() })
      .then((data) => { if (!cancelled) setMyStores(data.stores ?? []) })
      .catch(() => { if (!cancelled) setMyStores([]) })
      .finally(() => { if (!cancelled) setStoresLoading(false) })
    return () => { cancelled = true }
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
    abortRef.current?.abort()
    clearTimers()
    setIsGenerating(false)
    setGenerationStatus('')
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

    // Auth gate — block generation for logged-out users (show modal instead)
    if (!session?.user?.id) {
      setAuthOpen(true)
      return
    }

    // Reset state
    setError(null)
    setIsGenerating(true)
    setGenerationStatus('Starting generation...')
    setElapsedSeconds(0)

    // Create abort controller for this request
    const controller = new AbortController()
    abortRef.current = controller

    // Elapsed time counter
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    // Fallback progress cycling (used only if SSE progress events stop)
    let fallbackIdx = 0
    let receivedSSEProgress = false
    progressTimerRef.current = setInterval(() => {
      if (!receivedSSEProgress) {
        fallbackIdx = (fallbackIdx + 1) % progressMessages.length
        setGenerationStatus(progressMessages[fallbackIdx])
      }
    }, 3000)

    // ── Helper: clean up on any error path (no throw, no crash overlay) ──
    const finishWithError = (message: string) => {
      clearTimers()
      setError(message)
      setIsGenerating(false)
      setGenerationStatus('')
      setElapsedSeconds(0)
      toast.error('Store generation failed', { description: message })
    }

    const finishOk = () => {
      clearTimers()
      setIsGenerating(false)
      setGenerationStatus('')
      setElapsedSeconds(0)
    }

    try {
      console.log('[Storqly] Starting SSE store generation for prompt:', trimmed)

      // ── Fetch with auto-retry for transient gateway errors (502/503/504) ──
      const RETRYABLE_STATUSES = [502, 503, 504]
      let res: Response | undefined
      let retryCount = 0
      const maxRetries = 2

      while (retryCount <= maxRetries) {
        try {
          res = await fetch('/api/store/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: trimmed }),
            signal: controller.signal,
          })

          // If the status is retryable, wait and loop again
          if (!res.ok && RETRYABLE_STATUSES.includes(res.status) && retryCount < maxRetries) {
            retryCount++
            console.warn(`[Storqly] Gateway error ${res.status}, retrying (${retryCount}/${maxRetries}) in 3s...`)
            setGenerationStatus('Connection issue — retrying...')
            await new Promise(r => setTimeout(r, 3000))
            continue
          }
          break // Success or non-retryable error — exit loop
        } catch (fetchErr: unknown) {
          // Network-level error (DNS failure, connection refused, etc.)
          if (fetchErr instanceof TypeError && retryCount < maxRetries) {
            retryCount++
            console.warn(`[Storqly] Network error, retrying (${retryCount}/${maxRetries}) in 3s...`)
            setGenerationStatus('Connection issue — retrying...')
            await new Promise(r => setTimeout(r, 3000))
            continue
          }
          // Out of retries or not a network error — handle gracefully
          const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          if (controller.signal.aborted) {
            finishWithError('Generation was cancelled.')
          } else {
            console.warn('[Storqly] Network error after retries:', msg)
            finishWithError('Could not connect to the server. Please check your connection and try again.')
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
        console.warn('[Storqly] HTTP error:', errorMsg)
        finishWithError(errorMsg)
        return
      }

      // ── Consume SSE stream ──
      const reader = res.body?.getReader()
      if (!reader) {
        finishWithError('No response stream received from server.')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let resolved = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let currentEvent = ''
        for (const line of lines) {
          if (line.startsWith(':')) continue
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)

            if (currentEvent === 'progress') {
              receivedSSEProgress = true
              try {
                const data = JSON.parse(dataStr)
                setGenerationStatus(data.message || 'Processing...')
              } catch { /* ignore */ }
            } else if (currentEvent === 'result') {
              try {
                const data = JSON.parse(dataStr)
                if (!data.store) {
                  console.warn('[Storqly] Result event missing store data')
                  finishWithError('The AI response was missing store data.')
                  return
                }
                console.log('[Storqly] Store generated via SSE. isFallback:', data._isFallback, 'name:', data.store.name)
                resolved = true

                if (data._isFallback) {
                  toast.warning('AI service unavailable — showing starter template. Try again in a moment.', { duration: 6000 })
                  setStoreWithFallback(data.store, true, data._fallbackReason || 'AI generation failed')
                } else {
                  setStore(data.store)
                }

                // Soft cap toast
                if (data._productCapHit) {
                  toast.info(
                    `Generated ${data._generatedCount} products — for larger catalogs, you can add more via the chat editor.`,
                    { duration: 8000 }
                  )
                }

                finishOk()
                return
              } catch (parseErr) {
                const msg = parseErr instanceof Error ? parseErr.message : String(parseErr)
                console.warn('[Storqly] Failed to parse result event:', msg)
                finishWithError(msg)
                return
              }
            } else if (currentEvent === 'error') {
              try {
                const data = JSON.parse(dataStr)
                const serverMsg = data.message || 'Generation failed'
                console.warn('[Storqly] Server error event:', serverMsg)
                finishWithError(serverMsg)
                return
              } catch {
                finishWithError('Generation failed')
                return
              }
            }
            currentEvent = ''
          }
        }
      }

      if (!resolved) {
        console.warn('[Storqly] Stream ended without a result event')
        finishWithError('Stream ended without a result. The server may have disconnected.')
      }
    } catch (err: unknown) {
      // Last-resort safety net — should rarely be reached now
      clearTimers()
      let message = 'Something went wrong. Please try again.'
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          message = 'Generation was cancelled.'
        } else {
          console.warn('[Storqly] Unexpected error (caught by safety net):', err.message)
          message = err.message
        }
      }
      setError(message)
      setIsGenerating(false)
      setGenerationStatus('')
      setElapsedSeconds(0)
      toast.error('Store generation failed', { description: message })
    }
  }, [promptText, session, setIsGenerating, setStore, setStoreWithFallback, clearTimers, setAuthOpen])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers()
      abortRef.current?.abort()
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
            <div className="mt-4 min-h-[48px]">
              <AnimatePresence mode="wait">
                {isGenerating && !error && (
                  <motion.div
                    key="progress"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="flex flex-col items-center gap-1"
                  >
                    <p className="flex items-center gap-2 text-sm text-zinc-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a855f7]" />
                      {generationStatus}
                    </p>
                    <p className="text-xs text-zinc-600">
                      Elapsed: {formatElapsed(elapsedSeconds)} · AI is building your store, this may take up to 2 minutes
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
                            onClick={() => { window.location.href = `/?store=${s.slug}` }}
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

      {/* ── Business Tools Link ── */}
      <div className="px-5 pb-6">
        <div className="mx-auto flex max-w-5xl justify-center">
          <button
            onClick={() => setMkOpen(true)}
            className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 py-2 text-xs font-medium text-zinc-400 transition-all duration-200 hover:border-[#a855f7]/30 hover:bg-[#a855f7]/5 hover:text-[#c084fc]"
          >
            <FileText className="h-3.5 w-3.5" />
            Business Tools
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
              <div className="mt-4 flex items-center gap-1 text-sm font-medium text-zinc-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                Learn more <ArrowRight className="h-3.5 w-3.5" />
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

// ─── Resize Handle ────────────────────────────────────────────────────

function ResizeHandle({ direction }: { direction: 'left' | 'right' }) {
  return (
    <PanelResizeHandle
      className={`group relative flex w-1.5 items-center justify-center bg-zinc-900 transition-colors hover:bg-zinc-800 data-[resize-handle-active]:bg-[#a855f7]/30 ${
        direction === 'left' ? 'border-l border-zinc-800' : 'border-r border-zinc-800'
      }`}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
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

  if (!store) return null

  return (
    <div className="h-full overflow-auto bg-zinc-100">
      <StoreRenderer
        store={store}
        selectedSectionId={selectedSectionId}
        onSelectSection={setSelectedSectionId}
        externalCurrentPageId={editorCurrentPageId}
        onPageChange={setEditorCurrentPageId}
      />
    </div>
  )
}

// ─── Editor View ─────────────────────────────────────────────────────

function EditorView() {
  const store = useStoreEditor((s) => s.store)
  const isFallbackStore = useStoreEditor((s) => s.isFallbackStore)
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)

  if (!store) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-950">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#a855f7]" />
          <p className="mt-3 text-sm text-zinc-500">Loading editor…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-950">
      <EditorToolbar onToggleLeft={setShowLeft} onToggleRight={setShowRight} showLeft={showLeft} showRight={showRight} />

      {isFallbackStore && <FallbackBanner />}

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="storqly-editor-layout">
          <AnimatePresence mode="wait">
            {showLeft && (
              <Panel id="left" order={1} defaultSize={18} minSize={12} maxSize={28}>
                <VisualEditor />
              </Panel>
            )}
          </AnimatePresence>

          {showLeft && showRight && <ResizeHandle direction="left" />}

          <Panel id="center" order={2} defaultSize={showLeft && showRight ? 48 : showLeft || showRight ? 72 : 100} minSize={30}>
            <PreviewPanel />
          </Panel>

          {showLeft && showRight && <ResizeHandle direction="right" />}

          <AnimatePresence mode="wait">
            {showRight && (
              <Panel id="right" order={3} defaultSize={22} minSize={16} maxSize={32}>
                <ChatPanel />
              </Panel>
            )}
          </AnimatePresence>
        </PanelGroup>
      </div>
    </div>
  )
}

// ─── Fallback Banner ──────────────────────────────────────────────

function FallbackBanner() {
  const reset = useStoreEditor((s) => s.reset)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  return (
    <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
      <p className="flex-1 text-sm text-amber-200">
        AI couldn't generate a custom store — you're viewing a starter template.
        <span className="hidden sm:inline"> Edit it manually or try regenerating.</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-7 gap-1.5 rounded-lg bg-amber-500/20 px-3 text-xs font-medium text-amber-200 hover:bg-amber-500/30"
          onClick={() => {
            reset()
          }}
        >
          <RotateCcw className="h-3 w-3" />
          Regenerate with AI
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
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
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      toast.success(`Draft saved — ID: ${data.id}`, {
        description: `Slug: ${data.slug}`,
        duration: 5000,
      })
    } catch {
      toast.error('Failed to save store')
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
      if (!res.ok) throw new Error('Publish failed')
      const data = await res.json()
      const slug = data.slug
      setIsPublished(true)
      // Build a real viewable URL using the current origin
      const baseUrl = window.location.origin
      const viewUrl = `${baseUrl}/?store=${slug}`
      setPublishedUrl(viewUrl)
      toast.success('Store published successfully!')
    } catch {
      toast.error('Failed to publish store')
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
        if (!cancelled) setStore(data.store)
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
          onClick={() => window.location.href = '/'}
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

export default function Home() {
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
              <p className="text-xs text-zinc-800 font-mono" id="build-id">build:2026-08-11-072515Z-279ad2e</p>
            </div>
          </footer>
        )}
      </main>
      <Toaster />
    </>
  )
}
