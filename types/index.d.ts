export type Cache = { read: number; created: number; model: string }
export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Measure = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: Limit[]
}

declare module 'claude-code' {
  interface PluginState {
    statusbar: {
      dir: string
      branch: string
      cache: Cache | null
      measure: Measure | null
      ttlLeft: number | null
    }
  }
}
