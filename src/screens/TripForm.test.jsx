// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultData, newTrip, saveTrip, tripConditions } from '../model'
import { TripForm } from './TripForm'

const TODAY = '2026-06-20' // new trips start a week later, in summer
const roots = []
let latest

// Camping is Auto yes in summer.
const withCampingRule = (data, autoYesIf = ['auto:summer']) => ({
  ...data,
  questions: data.questions.map((q) => (q.id === 'camping' ? { ...q, autoYesIf } : q)),
})

function Harness({ initial, tripId }) {
  const [data, setData] = useState(initial)
  latest = data
  return <TripForm data={data} setData={setData} go={vi.fn()} today={TODAY} tripId={tripId} />
}

async function renderForm(data, tripId) {
  const node = document.body.appendChild(document.createElement('div'))
  const root = createRoot(node)
  roots.push({ node, root })
  await act(async () => { root.render(<Harness initial={data} tripId={tripId} />) })
  return node
}

async function saveForm(data, tripId) {
  const node = await renderForm(data, tripId)
  expect(node.textContent).not.toContain('Camping?')
  await act(async () => { node.querySelector('button[type=submit]').click() })
  return latest
}

// What the trip asks for once Camping's rule is removed.
const unansweredWithoutRule = (data) => {
  const plain = withCampingRule(data, [])
  const trip = plain.trips[0]
  const conditions = tripConditions(trip, plain.questions)
  return plain.questions.filter((q) => conditions.isAsked(q) && typeof trip.answers[q.id] !== 'boolean').map((q) => q.id)
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })

afterEach(async () => {
  for (const { node, root } of roots.splice(0)) {
    await act(async () => { root.unmount() })
    node.remove()
  }
  vi.unstubAllGlobals()
})

it('leaves an Auto yes question unanswered, so removing the rule asks for it', async () => {
  const saved = await saveForm(withCampingRule(defaultData()))
  expect(saved.trips).toHaveLength(1)
  expect(saved.trips[0].answers).not.toHaveProperty('camping')
  expect(saved.trips[0].answers).toMatchObject({ max: false, harrison: false, fly: false, swim: false })
  expect(unansweredWithoutRule(saved)).toEqual(['camping'])
})

it('keeps an earlier answer to a question that is now Auto yes', async () => {
  const trip = { ...newTrip(TODAY), id: 'trip', answers: { max: false, harrison: false, camping: false, fly: false, swim: false } }
  const saved = await saveForm(withCampingRule(saveTrip(defaultData(), trip)), 'trip')
  expect(saved.trips[0].answers.camping).toBe(false)
  expect(unansweredWithoutRule(saved)).toEqual([])
})

it('keeps Auto yes questions hidden while the trip dates are being corrected', async () => {
  const trip = { ...newTrip(TODAY), id: 'trip', answers: { harrison: true } }
  const node = await renderForm(withCampingRule(saveTrip(defaultData(), trip)), trip.id)
  const back = node.querySelectorAll('input[type=date]')[1]
  await act(async () => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setValue.call(back, '')
    back.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(node.querySelector('button[type=submit]').disabled).toBe(true)
  expect(node.textContent).toContain('Going to Harrison?')
  expect(node.textContent).not.toContain('Swimming?')
  expect(node.textContent).not.toContain('Camping?')
})
