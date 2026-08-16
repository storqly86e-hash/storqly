// ═══════════════════════════════════════════════════════════════════
// Connection Status Banner
// ═══════════════════════════════════════════════════════════════════
// Shows a non-intrusive banner when the server connection is lost.
// Provides a "Retry" button and auto-recovery. This replaces the
// raw CLIENT_FETCH_ERROR console crashes with a graceful UX.

'use client'

import { useConnectionHealth } from '@/lib/connection-health'
import { WifiOff, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'

export default function ConnectionBanner() {
  const { status, retryNow } = useConnectionHealth()

  return (
    <AnimatePresence>
      {(status === 'disconnected' || status === 'degraded') && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-3 border-b px-4 py-2"
          style={{
            backgroundColor: status === 'disconnected' ? '#7f1d1d' : '#78350f',
            borderColor: status === 'disconnected' ? '#991b1b' : '#92400e',
          }}
        >
          <WifiOff className="h-4 w-4 shrink-0 text-white/80" />
          <p className="text-sm text-white/90">
            {status === 'disconnected'
              ? 'Connection lost — the server may be restarting. Your work is saved locally.'
              : 'Intermittent connection issues detected.'}
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 rounded-lg px-3 text-xs font-medium text-white/90 hover:bg-white/10"
            onClick={retryNow}
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
