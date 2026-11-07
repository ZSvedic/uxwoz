// The three screen models and the background model that files, with their call settings, as
// measured in spec/ui-generation.md.

export type ModelId = 'claude-haiku-5.5' | 'gpt-6-luna-fast' | 'gpt-6.1-sol-ultrafast' | 'gpt-6.1-terra'

export interface ModelConfig {
  id: ModelId
  label: string
  provider: 'openrouter' | 'openai'
  model: string
  /** OpenRouter only: the one upstream we allow, no fallbacks. */
  providerOrder?: string[]
  /** OpenAI only. */
  serviceTier?: string
  reasoning: Record<string, unknown>
  /** USD per 1M tokens, for providers that do not report billed cost. */
  pricePerMTok?: { input: number; cachedInput: number; output: number }
  /** True when the cost shown is our estimate rather than the billed amount. */
  costEstimated: boolean
  /** Runs in the background (filing); never offered as a screen model. */
  background?: true
}

export const MODELS: Record<ModelId, ModelConfig> = {
  'claude-haiku-5.5': {
    id: 'claude-haiku-5.5',
    label: 'Claude Haiku 5.5',
    provider: 'openrouter',
    model: 'anthropic/claude-haiku-5.5',
    providerOrder: ['anthropic'],
    reasoning: { enabled: false },
    costEstimated: false,
  },
  'gpt-6-luna-fast': {
    id: 'gpt-6-luna-fast',
    label: 'GPT-6 Luna (fast)',
    provider: 'openai',
    model: 'gpt-6-luna',
    serviceTier: 'fast',
    reasoning: { effort: 'none' },
    // 2x the $0.10 / $0.01 / $0.50 standard price (unconfirmed).
    pricePerMTok: { input: 0.2, cachedInput: 0.02, output: 1.0 },
    costEstimated: true,
  },
  'gpt-6.1-sol-ultrafast': {
    id: 'gpt-6.1-sol-ultrafast',
    label: 'GPT-6.1 Sol Ultrafast',
    provider: 'openai',
    model: 'gpt-6.1-sol',
    serviceTier: 'ultrafast',
    reasoning: { effort: 'low' },
    // 6x the $2 / $0.10 / $10 standard price.
    pricePerMTok: { input: 12.0, cachedInput: 0.6, output: 60.0 },
    costEstimated: true,
  },
  'gpt-6.1-terra': {
    id: 'gpt-6.1-terra',
    label: 'GPT-6.1 Terra',
    provider: 'openai',
    model: 'gpt-6.1-terra',
    serviceTier: 'default',
    reasoning: { effort: 'low' },
    pricePerMTok: { input: 1.0, cachedInput: 0.05, output: 5.0 },
    costEstimated: true,
    background: true,
  },
}

/** The model that files each decision into the boxes (the paper test's only pass). */
export const FILING_MODEL: ModelId = 'gpt-6.1-terra'

export const DEFAULT_MODEL: ModelId = 'claude-haiku-5.5'

/** A model the user may pick for screens. */
export const isModelId = (v: unknown): v is ModelId => typeof v === 'string' && Object.hasOwn(MODELS, v) && !MODELS[v as ModelId].background
