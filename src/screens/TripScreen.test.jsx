// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addDays, defaultData, newTemplate, newTrip, saveTrip } from '../model'
import { DEFAULT_PREFS, savePrefs } from '../prefs'
import { TripScreen } from './TripScreen'

const LINGER_MS = DEFAULT_PREFS.hideDelay
const SETTLE_MS = DEFAULT_PREFS.tapPause

const roots = []

function makeData({ checked = [], headingHome = false } = {}) {
  const templates = [
    newTemplate('pack', { id: 'shirt', text: 'Shirt', group: 'Main' }),
    newTemplate('pack', { id: 'socks', text: 'Socks', group: 'Main' }),
    newTemplate('pack', { id: 'tent', text: 'Tent', group: 'Camping' }),
    newTemplate('todo', { id: 'mail', text: 'Hold mail' }),
    newTemplate('todo', { id: 'plants', text: 'Water plants' }),
    newTemplate('todo', { id: 'bins', text: 'Bins out' }),
  ]
  const trip = {
    ...newTrip('2026-11-23'),
    id: 'trip',
    name: 'Test trip',
    headingHome,
    checked: Object.fromEntries(checked.map((id) => [`t:${id}`, true])),
  }
  return saveTrip({ ...defaultData(), templates, questions: [] }, trip)
}

function Harness({ initial, today }) {
  const [data, setData] = useState(initial)
  return <TripScreen data={data} setData={setData} go={() => {}} today={today} tripId="trip" />
}

async function render(data, today = '2026-11-23') {
  const node = document.body.appendChild(document.createElement('div'))
  const root = createRoot(node)
  roots.push({ node, root })
  await act(async () => { root.render(<Harness initial={data} today={today} />) })
  return node
}

const itemButton = (node, id) => node.querySelector(`[data-item="t:${id}"]`)
const toggle = (node, key) => node.querySelector(`[data-toggle="${key}"]`)
// A keyboard-activated click has detail 0, the way Space/Enter on a button reports it.
const keyboardClick = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })) })
const wait = (ms) => act(async () => { vi.advanceTimersByTime(ms) })
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })) })

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})
afterEach(async () => {
  for (const { node, root } of roots.splice(0)) {
    await act(async () => { root.unmount() })
    node.remove()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it("puts Heading home early and I'm home in the trip footer", async () => {
  const data = makeData()
  const node = await render(data, data.trips[0].start)
  const footer = node.querySelector('.trip-footer')
  const [headingHome, imHome] = footer.querySelectorAll('button')
  expect(headingHome.textContent).toBe('Heading home early')
  expect(imHome.textContent).toBe("I'm home")

  await click(headingHome)
  expect(node.querySelector('.banner.home strong').textContent).toBe('Coming home')
  expect(footer.textContent).not.toContain('Heading home early')
  const undo = node.querySelector('.banner.home button')
  expect(undo.textContent).toBe('Not yet')
  await click(undo)
  expect(node.querySelector('.banner.home')).toBeNull()
  expect(footer.querySelector('button').textContent).toBe('Heading home early')

  await click(imHome)
  expect(footer.querySelector('button').textContent).toBe('Reopen trip')
})

it.each([0, 1])('hides Not yet %i days after the scheduled return date', async (daysAfterReturn) => {
  const data = makeData({ headingHome: true })
  const node = await render(data, addDays(data.trips[0].end, daysAfterReturn))
  const banner = node.querySelector('.banner.home')
  expect(banner.querySelector('strong').textContent).toBe('Coming home')
  expect(banner.querySelector('button')).toBeNull()
})

it('starts with completed items hidden', async () => {
  const node = await render(makeData({ checked: ['mail'] }))
  expect(node.querySelector('.hide-completed input').checked).toBe(true)
  expect(itemButton(node, 'mail')).toBeNull()
  expect(itemButton(node, 'plants')).not.toBeNull()
})

it('opening a finished category shows its checked items even while hiding completed', async () => {
  const node = await render(makeData({ checked: ['mail', 'plants', 'bins'] }))
  expect(itemButton(node, 'mail')).toBeNull()
  const heading = toggle(node, 'cat:todo')
  expect(heading.getAttribute('aria-expanded')).toBe('false')

  await click(heading)

  expect(toggle(node, 'cat:todo').getAttribute('aria-expanded')).toBe('true')
  for (const id of ['mail', 'plants', 'bins']) {
    expect(itemButton(node, id).getAttribute('aria-checked')).toBe('true')
  }
})

it('keeps a finished pack group heading visible and opens it to show its items', async () => {
  const node = await render(makeData({ checked: ['shirt', 'socks'] }))
  const heading = toggle(node, 'group:Main')
  expect(heading).not.toBeNull()
  expect(itemButton(node, 'shirt')).toBeNull()
  expect(itemButton(node, 'tent')).not.toBeNull()

  await click(heading)

  expect(itemButton(node, 'shirt').getAttribute('aria-checked')).toBe('true')
  expect(itemButton(node, 'socks').getAttribute('aria-checked')).toBe('true')
})

it('moves keyboard focus to the next unchecked item when a checked row disappears', async () => {
  const node = await render(makeData())
  itemButton(node, 'mail').focus()

  await keyboardClick(itemButton(node, 'mail'))
  await wait(LINGER_MS)

  expect(itemButton(node, 'mail')).toBeNull()
  expect(document.activeElement).toBe(itemButton(node, 'plants'))
})

it('moves keyboard focus to the collapsed heading when checking the last item', async () => {
  const node = await render(makeData({ checked: ['shirt'] }))
  itemButton(node, 'socks').focus()

  await keyboardClick(itemButton(node, 'socks'))
  await wait(LINGER_MS)

  expect(document.activeElement).toBe(toggle(node, 'group:Main'))
})

it('moves focus to the category heading when the last item finishes the whole category', async () => {
  const node = await render(makeData({ checked: ['mail', 'plants'] }))
  itemButton(node, 'bins').focus()

  await keyboardClick(itemButton(node, 'bins'))
  await wait(LINGER_MS)

  expect(document.activeElement).toBe(toggle(node, 'cat:todo'))
})

it('keeps a checked item on screen, crossed out, before hiding it', async () => {
  const node = await render(makeData())

  await click(itemButton(node, 'mail'))

  expect(itemButton(node, 'mail').getAttribute('aria-checked')).toBe('true')
  await wait(LINGER_MS - 1)
  expect(itemButton(node, 'mail')).not.toBeNull()
  await wait(1)
  expect(itemButton(node, 'mail')).toBeNull()
})

it('waits for the last item to linger before collapsing its section', async () => {
  const node = await render(makeData({ checked: ['mail', 'plants'] }))

  await click(itemButton(node, 'bins'))

  expect(toggle(node, 'cat:todo')).toBeNull()
  expect(itemButton(node, 'bins')).not.toBeNull()
  await wait(LINGER_MS)
  expect(toggle(node, 'cat:todo').getAttribute('aria-expanded')).toBe('false')
})

it('unchecking a lingering item keeps it on screen', async () => {
  const node = await render(makeData())
  await click(itemButton(node, 'mail'))
  await click(itemButton(node, 'mail'))
  await wait(LINGER_MS)
  expect(itemButton(node, 'mail').getAttribute('aria-checked')).toBe('false')
})

it('ignores taps right after the list changes', async () => {
  const node = await render(makeData())
  await click(itemButton(node, 'mail'))
  await wait(LINGER_MS) // "Hold mail" disappears; "Water plants" slides up

  await click(itemButton(node, 'plants'))
  expect(itemButton(node, 'plants').getAttribute('aria-checked')).toBe('false')

  await wait(SETTLE_MS)
  await click(itemButton(node, 'plants'))
  expect(itemButton(node, 'plants').getAttribute('aria-checked')).toBe('true')
})

it('with the hide delay set to Now, a checked item goes at once and focus moves on', async () => {
  savePrefs({ ...DEFAULT_PREFS, hideDelay: 0 })
  const node = await render(makeData())
  itemButton(node, 'mail').focus()

  await keyboardClick(itemButton(node, 'mail'))

  expect(itemButton(node, 'mail')).toBeNull()
  expect(document.activeElement).toBe(itemButton(node, 'plants'))
})

it('with the tap pause off, taps right after the list moves still count', async () => {
  savePrefs({ ...DEFAULT_PREFS, tapPause: 0 })
  const node = await render(makeData())
  await click(itemButton(node, 'mail'))
  await wait(LINGER_MS)

  await click(itemButton(node, 'plants'))

  expect(itemButton(node, 'plants').getAttribute('aria-checked')).toBe('true')
})
