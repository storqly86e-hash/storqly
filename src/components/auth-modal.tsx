'use client'

import { useState, useCallback } from 'react'
import { signIn, signOut } from 'next-auth/react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { Loader2, LogOut, User } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ─── Props ──────────────────────────────────────────────────────────

interface AuthModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-select a tab: 'login' or 'register' */
  defaultTab?: 'login' | 'register'
}

// ─── Component ──────────────────────────────────────────────────────

export default function AuthModal({ open, onOpenChange, defaultTab = 'login' }: AuthModalProps) {
  const [tab, setTab] = useState(defaultTab)

  // Reset tab when modal opens
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      setTab(defaultTab)
    }
    onOpenChange(newOpen)
  }, [defaultTab, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px] rounded-2xl border-zinc-800 bg-zinc-950 p-0 gap-0 overflow-hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
          <div className="border-b border-zinc-800 px-6 pt-6 pb-0">
            <TabsList className="w-full h-11 rounded-lg bg-zinc-900 p-1">
              <TabsTrigger
                value="login"
                className="flex-1 h-9 rounded-md text-sm font-medium data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none text-zinc-400"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="flex-1 h-9 rounded-md text-sm font-medium data-[state=active]:bg-zinc-800 data-[state=active]:text-white data-[state=active]:shadow-none text-zinc-400"
              >
                Create Account
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="login" className="mt-0">
            <SignInForm onSuccess={() => onOpenChange(false)} />
          </TabsContent>

          <TabsContent value="register" className="mt-0">
            <RegisterForm onSuccess={() => setTab('login')} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sign In Form ───────────────────────────────────────────────────

function SignInForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const result = await signIn('credentials', {
        email: email.toLowerCase(),
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password.')
      } else {
        toast.success('Signed in successfully')
        onSuccess()
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5">
      <DialogHeader className="mb-5 text-left">
        <DialogTitle className="text-xl font-semibold text-white">Welcome back</DialogTitle>
        <DialogDescription className="text-sm text-zinc-400">
          Sign in to save and manage your stores.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email" className="text-sm font-medium text-zinc-300">
            Email
          </Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            disabled={isLoading}
            required
            className="h-10 rounded-lg border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:ring-[#a855f7]/40 focus-visible:border-[#a855f7]/40"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="login-password" className="text-sm font-medium text-zinc-300">
            Password
          </Label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null) }}
            disabled={isLoading}
            required
            className="h-10 rounded-lg border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:ring-[#a855f7]/40 focus-visible:border-[#a855f7]/40"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <Button
          type="submit"
          disabled={isLoading || !email.trim() || !password}
          className="w-full h-10 rounded-lg bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f43f5e] text-sm font-semibold text-white shadow-lg shadow-[#a855f7]/20 hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in…
            </span>
          ) : (
            'Sign In'
          )}
        </Button>
      </div>
    </form>
  )
}

// ─── Register Form ─────────────────────────────────────────────────

function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed.')
        return
      }

      toast.success('Account created! Please sign in.')
      onSuccess()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 pb-6 pt-5">
      <DialogHeader className="mb-5 text-left">
        <DialogTitle className="text-xl font-semibold text-white">Create your account</DialogTitle>
        <DialogDescription className="text-sm text-zinc-400">
          Save stores and manage your projects.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="register-name" className="text-sm font-medium text-zinc-300">
            Name
          </Label>
          <Input
            id="register-name"
            type="text"
            autoComplete="name"
            placeholder="Your name"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null) }}
            disabled={isLoading}
            required
            className="h-10 rounded-lg border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:ring-[#a855f7]/40 focus-visible:border-[#a855f7]/40"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-email" className="text-sm font-medium text-zinc-300">
            Email
          </Label>
          <Input
            id="register-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null) }}
            disabled={isLoading}
            required
            className="h-10 rounded-lg border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:ring-[#a855f7]/40 focus-visible:border-[#a855f7]/40"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-password" className="text-sm font-medium text-zinc-300">
            Password
          </Label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null) }}
            disabled={isLoading}
            required
            minLength={8}
            className="h-10 rounded-lg border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600 focus-visible:ring-[#a855f7]/40 focus-visible:border-[#a855f7]/40"
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <Button
          type="submit"
          disabled={isLoading || !name.trim() || !email.trim() || password.length < 8}
          className="w-full h-10 rounded-lg bg-gradient-to-r from-[#a855f7] via-[#ec4899] to-[#f43f5e] text-sm font-semibold text-white shadow-lg shadow-[#a855f7]/20 hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating account…
            </span>
          ) : (
            'Create Account'
          )}
        </Button>
      </div>
    </form>
  )
}

// ─── Auth Button (for nav bars) ────────────────────────────────────
// Shows "Sign In" when logged out, or user name + sign out when logged in.

export function AuthButton({
  onSignIn,
  className,
}: {
  onSignIn: () => void
  className?: string
}) {
  const { data: session, status } = useSession()

  // Don't flash unauthenticated state while session loads
  if (status === 'loading') {
    return <div className={`h-8 w-20 rounded-lg bg-zinc-800/50 ${className || ''}`} />
  }

  if (session?.user) {
    return (
      <div className={`flex items-center gap-2 ${className || ''}`}>
        <div className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#a855f7]/30 to-[#ec4899]/30">
            <User className="h-3.5 w-3.5 text-[#c084fc]" />
          </div>
          <span className="text-sm font-medium text-zinc-200 max-w-[120px] truncate">
            {session.user.name || session.user.email}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          onClick={async () => {
            // Use redirect:false to prevent NextAuth from constructing an
            // absolute URL using NEXTAUTH_URL (which breaks on proxy domains).
            // We handle the redirect ourselves using a relative path.
            await signOut({ redirect: false })
            window.location.href = '/'
          }}
          aria-label="Sign out"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="ghost"
      onClick={onSignIn}
      className={`h-8 gap-1.5 rounded-lg px-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 ${className || ''}`}
    >
      Sign In
    </Button>
  )
}
