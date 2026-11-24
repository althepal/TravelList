// @vitest-environment jsdom
import { beforeEach, expect, it } from 'vitest'
import { DEFAULT_PREFS, loadPrefs, savePrefs } from './prefs'

beforeEach(() => localStorage.clear())

it('uses the defaults when nothing is saved', () => {
  expect(loadPrefs()).toEqual(DEFAULT_PREFS)
})

it('reads back what was saved', () => {
  savePrefs({ hideDelay: 2000, tapPause: 0 })
  expect(loadPrefs()).toEqual({ hideDelay: 2000, tapPause: 0 })
})

it('falls back per field for unknown or unreadable values', () => {
  localStorage.setItem('travellist-prefs', JSON.stringify({ hideDelay: 1234, tapPause: 300 }))
  expect(loadPrefs()).toEqual({ hideDelay: DEFAULT_PREFS.hideDelay, tapPause: 300 })
  localStorage.setItem('travellist-prefs', '{not json')
  expect(loadPrefs()).toEqual(DEFAULT_PREFS)
})
