/**
 * Settings in localStorage, as JSON under this player's own prefix: the web app and the one-file
 * build each have their own (every page opened from file:// shares one localStorage). The Winamp
 * equaliser is the exception: it lives under the player family's shared keys, so the curve set
 * on the vinyl player is the one the cassette deck plays with.
 */

const PREFIX = __PROFILE__ === 'html' ? 'cassette-deck-html.' : 'ultra-cassette-deck.';
/** Keys shared by the family of players, without a prefix. */
const SHARED: Readonly<Record<string, string>> = {
  eq: 'vinyl-eq',
  'eq-presets': 'vinyl-eq-presets',
};

function keyOf(key: string): string {
  return SHARED[key] ?? PREFIX + key;
}

/** Reads JSON from localStorage; null when missing, malformed or blocked (privacy modes). */
export function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(keyOf(key));
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Writes JSON to localStorage; silently does nothing when storage is unavailable. */
export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(keyOf(key), JSON.stringify(value));
  } catch {
    // Storage can be disabled or full; the app works without persistence.
  }
}
