// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultData, newTemplate, newTrip, saveTrip } from '../model'
import { TripScreen } from './TripScreen'

const roots = []

function makeData({ checked = [] } = {}) {
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
    checked: Object.fromEntries(checked.map((id) => [`t:${id}`, true])),
  }
  return saveTrip({ ...defaultData(), templates, questions: [] }, trip)
}

function Harness({ initial }) {
  const [data, setData] = useState(initial)
  return <TripScreen data={data} setData={setData} go={() => {}} today="2026-11-23" tripId="trip" />
}

async function render(data) {
  const node = document.body.appendChild(document.createElement('div'))
  const root = createRoot(node)
  roots.push({ node, root })
  await act(async () => { root.render(<Harness initial={data} />) })
  return node
}

const itemButton = (node, id) => node.querySelector(`[data-item="t:${id}"]`)
const toggle = (node, key) => node.querySelector(`[data-toggle="${key}"]`)
// A keyboard-activated click has detail 0, the way Space/Enter on a button reports it.
const keyboardClick = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })) })
const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })) })

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })
afterEach(async () => {
  for (const { node, root } of roots.splice(0)) {
    await act(async () => { root.unmount() })
    node.remove()
  }
  vi.unstubAllGlobals()
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

  expect(itemButton(node, 'mail')).toBeNull()
  expect(document.activeElement).toBe(itemButton(node, 'plants'))
})

it('moves keyboard focus to the collapsed heading when checking the last item', async () => {
  const node = await render(makeData({ checked: ['shirt'] }))
  itemButton(node, 'socks').focus()

  await keyboardClick(itemButton(node, 'socks'))

  expect(document.activeElement).toBe(toggle(node, 'group:Main'))
})

it('moves focus to the category heading when the last item finishes the whole category', async () => {
  const node = await render(makeData({ checked: ['mail', 'plants'] }))
  itemButton(node, 'bins').focus()

  await keyboardClick(itemButton(node, 'bins'))

  expect(document.activeElement).toBe(toggle(node, 'cat:todo'))
})
