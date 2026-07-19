export type FloatingDisplayMode = 'compact' | 'pet'

export const DISPLAY_MODE_KEY = 'atg:display-mode:v1'
export const DEFAULT_DISPLAY_MODE: FloatingDisplayMode = 'compact'

export function normalizeDisplayMode(value: unknown): FloatingDisplayMode {
  return value === 'pet' ? 'pet' : DEFAULT_DISPLAY_MODE
}
