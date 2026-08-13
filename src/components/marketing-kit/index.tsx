'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  FileText,
  Copy,
  Download,
  Loader2,
  Sparkles,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────

type Phase = 'input' | 'loading' | 'output';

// ─── Animation ─────────────────────────────────────────────────────

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.2 } },
};

// ─── Component ─────────────────────────────────────────────────────

export default function MarketingKit({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('input');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const handleGenerate = useCallback(async () => {
    if (prompt.trim().length < 20) {
      toast.error('Please provide at least 20 characters of context.');
      return;
    }

    setPhase('loading');
    setError(null);
    setResult('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/marketing-kit/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`Server error (${res.status}). Please try again.`);
      }

      if (!res.body) {
        throw new Error('No response stream. Please try again.');
      }

      // Consume SSE stream — real token-by-token streaming
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let settled = false;
      let currentEvent = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (controller.signal.aborted) return;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }
          if (line.startsWith(':')) continue; // SSE comment
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              // Progressive streaming: each token chunk
              if (currentEvent === 'delta' && data.content) {
                accumulated += data.content;
                setResult(accumulated);
                // Switch from loading spinner to output on first token
                if (!settled) {
                  setPhase('output');
                  settled = true;
                }
                continue;
              }

              // Final complete content (replaces accumulated for consistency)
              if (currentEvent === 'result' && data.content !== undefined) {
                if (!data.content || data.content.length === 0) {
                  throw new Error('AI returned empty content. Try a more detailed prompt.');
                }
                setResult(data.content);
                setPhase('output');
                settled = true;
                return;
              }

              // Server-side error
              if (currentEvent === 'error' && data.message) {
                throw new Error(data.message);
              }

              // Ignore ping/progress/unknown events
            } catch (parseErr: unknown) {
              // Re-throw only our intentional errors, swallow JSON parse on non-JSON lines
              if (
                parseErr instanceof SyntaxError ||
                (parseErr instanceof Error && parseErr.message.startsWith('JSON'))
              ) continue;
              throw parseErr;
            }
          }
        }
      }

      if (!settled) {
        throw new Error('Generation ended unexpectedly. Please try again.');
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const msg = err instanceof Error ? err.message : 'Generation failed';
 setError(msg);
      setPhase('input');
      toast.error(msg);
    }
  }, [prompt]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(result);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  }, [result]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([result], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marketing-kit.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Downloaded as marketing-kit.md');
  }, [result]);

  const handleReset = useCallback(() => {
    setPhase('input');
    setResult('');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current?.abort();
    setPhase('input');
    setResult('');
    setError(null);
    onClose();
  }, [onClose]);

  // Scroll to top of result when entering output phase
  const handleOutputEnter = useCallback(() => {
    setTimeout(() => resultRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 100);
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Card */}
          <motion.div
            className="relative z-10 flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f11] shadow-2xl"
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#a855f7]/15">
                  <FileText className="h-4.5 w-4.5 text-[#a855f7]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Marketing Kit Generator</h2>
                  <p className="text-xs text-zinc-500">AI-powered business content generation</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden">
              {/* ── INPUT PHASE ── */}
              {phase === 'input' && (
                <div className="flex h-full flex-col">
                  <div className="flex-1 overflow-y-auto px-6 py-6">
                    {error && (
                      <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                        <p className="text-sm text-red-300">{error}</p>
                      </div>
                    )}

                    <label
                      htmlFor="mk-prompt"
                      className="mb-2 block text-sm font-medium text-zinc-300"
                    >
                      Describe your business and what you need
                    </label>
                    <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                      Paste a detailed prompt describing your business, target audience, and the marketing content you need. For example: website wireframe breakdown, AI image prompts, product descriptions, ad copy variations, social media calendar, email sequences, brand guidelines, etc.
                    </p>

                    <textarea
                      id="mk-prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={
                        'Act as a Master E-commerce Architect and Direct Response Copywriter. I\'m launching a premium organic skincare brand called "GlowRoot" targeting women 25-45. I need:\n\n1. A complete website wireframe breakdown (homepage sections, product pages, about page)\n2. 5 AI image generation prompts for product photography (Midjourney/DALL-E format)\n3. Product description templates for 3 hero products\n4. 3 ad copy variations for Facebook/Instagram\n5. A 30-day social media launch calendar\n6. Welcome email sequence (3 emails)'
                      }
                      className="h-full min-h-[280px] w-full resize-none rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 outline-none transition-colors focus:border-[#a855f7]/40 focus:ring-1 focus:ring-[#a855f7]/20"
                      autoFocus
                    />
                  </div>

                  <div className="border-t border-white/[0.06] px-6 py-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-600">
                        {prompt.length < 20
                          ? `${20 - prompt.length} more characters needed`
                          : `${prompt.length} characters`}
                      </span>
                      <button
                        onClick={handleGenerate}
                        disabled={prompt.trim().length < 20}
                        className="flex items-center gap-2 rounded-lg bg-[#a855f7] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#9333ea] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Sparkles className="h-4 w-4" />
                        Generate Kit
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── LOADING PHASE ── */}
              {phase === 'loading' && (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
                  <div className="relative">
                    <div className="h-12 w-12 rounded-full border-2 border-[#a855f7]/20" />
                    <Loader2 className="absolute inset-0 h-12 w-12 animate-spin text-[#a855f7]" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-200">
                      Generating your marketing kit...
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Detailed requests may take 30–90 seconds
                    </p>
                  </div>
                  <button
                    onClick={() => abortRef.current?.abort()}
                    className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Cancel
                  </button>
                </div>
              )}

              {/* ── OUTPUT PHASE ── */}
              {phase === 'output' && (
                <div
                  className="h-full overflow-y-auto"
                  ref={resultRef}
                  onAnimationStart={handleOutputEnter}
                >
                  {/* Action bar */}
                  <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-[#0f0f11]/90 px-6 py-3 backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download .md
                      </button>
                    </div>
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#a855f7] transition-colors hover:bg-[#a855f7]/10"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Generate Another
                      </button>
                  </div>

                  {/* Markdown content */}
                  <div className="mx-auto max-w-3xl px-6 py-8">
                    <div className="prose-mk">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => (
                            <h1 className="mb-6 mt-8 text-2xl font-bold text-white first:mt-0">
                              {children}
                            </h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="mb-4 mt-8 border-b border-white/[0.06] pb-3 text-xl font-semibold text-white">
                              {children}
                            </h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="mb-3 mt-6 text-lg font-semibold text-zinc-100">
                              {children}
                            </h3>
                          ),
                          p: ({ children }) => (
                            <p className="mb-4 leading-relaxed text-zinc-300">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="mb-4 ml-6 list-disc space-y-1.5 text-zinc-300 marker:text-[#a855f7]">
                              {children}
                            </ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="mb-4 ml-6 list-decimal space-y-1.5 text-zinc-300 marker:text-[#a855f7]">
                              {children}
                            </ol>
                          ),
                          li: ({ children }) => (
                            <li className="leading-relaxed">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-white">{children}</strong>
                          ),
                          em: ({ children }) => (
                            <em className="text-zinc-200">{children}</em>
                          ),
                          code: ({ className, children }) => {
                            const isBlock = className?.includes('language-');
                            if (isBlock) {
                              return (
                                <div className="my-4 overflow-hidden rounded-lg border border-white/[0.08] bg-black/40">
                                  <pre className="overflow-x-auto p-4 text-sm leading-relaxed text-zinc-300">
                                    <code>{children}</code>
                                  </pre>
                                </div>
                              );
                            }
                            return (
                              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-sm text-[#a855f7]">
                                {children}
                              </code>
                            );
                          },
                          pre: ({ children }) => <>{children}</>,
                          blockquote: ({ children }) => (
                            <blockquote className="my-4 border-l-2 border-[#a855f7]/40 pl-4 text-zinc-400 italic">
                              {children}
                            </blockquote>
                          ),
                          table: ({ children }) => (
                            <div className="my-4 overflow-x-auto rounded-lg border border-white/[0.08]">
                              <table className="w-full text-sm">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="border-b border-white/[0.08] bg-white/[0.02]">
                              {children}
                            </thead>
                          ),
                          th: ({ children }) => (
                            <th className="px-4 py-2.5 text-left font-semibold text-zinc-200">
                              {children}
                            </th>
                          ),
                          td: ({ children }) => (
                            <td className="border-t border-white/[0.04] px-4 py-2.5 text-zinc-300">
                              {children}
                            </td>
                          ),
                          hr: () => (
                            <hr className="my-8 border-white/[0.06]" />
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#a855f7] underline decoration-[#a855f7]/30 transition-colors hover:decoration-[#a855f7]"
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {result}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
