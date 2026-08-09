'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useStoreEditor } from '@/lib/store'
import { StoreRenderer } from '@/components/store-renderer'
import ChatPanel from '@/components/chat-panel'
import VisualEditor from '@/components/visual-editor'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
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

// ─── Progress Messages (looping) ──────────────────────────────────────

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

function LandingPage() {
  const [promptText, setPromptText] = useState('')
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

    // Reset state
    setError(null)
    setIsGenerating(true)
    setGenerationStatus(progressMessages[0])
    setElapsedSeconds(0)

    // Create abort controller for this request
    const controller = new AbortController()
    abortRef.current = controller

    // Cycle through progress messages (looping every ~17.5s)
    let idx = 0
    progressTimerRef.current = setInterval(() => {
      idx = (idx + 1) % progressMessages.length
      setGenerationStatus(progressMessages[idx])
    }, 2500)

    // Elapsed time counter
    elapsedTimerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    try {
      console.log('[Storqly] Starting store generation for prompt:', trimmed)

      const res = await fetch('/api/store/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
        signal: controller.signal,
      })

      if (!res.ok) {
        let errorMsg = `Server error (${res.status})`
        try {
          const errorData = await res.json()
          errorMsg = errorData.error || errorMsg
        } catch { /* ignore parse error */ }
        throw new Error(errorMsg)
      }

      const data = await res.json()

      if (!data.store) {
        throw new Error('The AI response was missing store data. Please try again.')
      }

      console.log('[Storqly] Store generated. isFallback:', data._isFallback, 'name:', data.store.name)
      clearTimers()

      if (data._isFallback) {
        setStoreWithFallback(data.store, true, data._fallbackReason || 'AI generation failed')
      } else {
        setStore(data.store)
      }
    } catch (err: unknown) {
      clearTimers()

      let message = 'Something went wrong. Please try again.'
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          // AbortError is expected when user cancels — don't log as error
          message = 'Generation was cancelled.'
        } else {
          console.error('[Storqly] Generation error:', err)
          message = err.message
        }
      }

      setError(message)
      setIsGenerating(false)
      setGenerationStatus('')
      setElapsedSeconds(0)
      toast.error('Store generation failed', { description: message })
    }
  }, [promptText, setIsGenerating, setStore, setStoreWithFallback, clearTimers])

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
          <span className="hidden text-sm text-zinc-500 sm:block">
            AI-Powered Store Builder
          </span>
        </nav>
      </header>

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

// ─── Editor View ─────────────────────────────────────────────────────

function EditorView() {
  const store = useStoreEditor((s) => s.store)
  const selectedSectionId = useStoreEditor((s) => s.selectedSectionId)
  const setSelectedSectionId = useStoreEditor((s) => s.setSelectedSectionId)
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
            <div className="h-full overflow-auto bg-zinc-100">
              <StoreRenderer
                store={store}
                selectedSectionId={selectedSectionId}
                onSelectSection={setSelectedSectionId}
              />
            </div>
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
      toast.success('Store saved')
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
      setIsPublished(true)
      toast.success(`Published! Live at ${data.slug}.storqly.com`)
    } catch {
      toast.error('Failed to publish store')
    } finally {
      setIsPublishing(false)
    }
  }

  return (
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
  )
}

// ─── Page Root ────────────────────────────────────────────────────────

export default function Home() {
  const view = useStoreEditor((s) => s.view)

  return (
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
  )
}
