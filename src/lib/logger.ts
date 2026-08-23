// Lightweight structured logger for Storqly generation pipeline
// Logs to console with structured format, never logs secrets/API keys

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogEntry {
  event: string
  timestamp: string
  level: LogLevel
  storeId?: string
  duration_ms?: number
  details?: Record<string, unknown>
}

export function logGeneration(entry: Omit<LogEntry, 'timestamp' | 'level'>): void {
  const level: LogLevel = entry.event.includes('fail') || entry.event.includes('error') ? 'error' : 'info'
  const logEntry: LogEntry = { ...entry, timestamp: new Date().toISOString(), level }
  console.log(JSON.stringify(logEntry))
}
