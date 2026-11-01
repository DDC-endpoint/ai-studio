// The general caption's hash (039 D4): the first 16 hex characters of the
// SHA-256 of its trimmed text, stored on a curated row written from it. Server
// only (node:crypto); undo.ts stays client-safe.
import { createHash } from 'node:crypto'

export function generalHashOf(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex').slice(0, 16)
}
