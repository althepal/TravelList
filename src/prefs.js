// Per-device checklist preferences. They're about how the app feels on this
// phone, not part of the list, so they live in localStorage instead of the
// synced data. Lost or unreadable values fall back to the defaults.

const KEY = 'travellist-prefs'

// How long a newly checked item stays on screen, crossed out, before Hide
// completed removes it (or its finished section collapses).
export const HIDE_DELAYS = [0, 250, 500, 750, 1000, 1500, 2000, 3000, 5000]
// After rows appear or disappear, taps are ignored this long so a tap aimed at
// one row can't land on whatever just slid under the finger.
export const TAP_PAUSES = [0, 100, 200, 300, 400, 500, 750, 1000, 1500]

export const DEFAULT_PREFS = { hideDelay: 500, tapPause: 500 }

export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return {
      hideDelay: HIDE_DELAYS.includes(raw?.hideDelay) ? raw.hideDelay : DEFAULT_PREFS.hideDelay,
      tapPause: TAP_PAUSES.includes(raw?.tapPause) ? raw.tapPause : DEFAULT_PREFS.tapPause,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Storage unavailable: the choice lasts until the app reloads.
  }
}

export const secondsLabel = (ms, zero) => (ms === 0 ? zero : `${ms / 1000}s`)
