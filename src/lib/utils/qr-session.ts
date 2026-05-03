import { v4 as uuidv4 } from 'uuid'

/**
 * Generates a cryptographically random session token for QR pairing.
 */
export function generateSessionToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Builds the mobile mic URL with session parameters.
 */
export function buildMicUrl(sessionId: string, token: string, baseUrl: string): string {
  const params = new URLSearchParams({ session: sessionId, token })
  return `${baseUrl}/mic?${params.toString()}`
}

/**
 * Validates that a session token has the correct format.
 */
export function isValidToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token)
}
