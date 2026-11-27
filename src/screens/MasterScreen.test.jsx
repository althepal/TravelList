// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { defaultData, deleteQuestion } from '../model'
import { MasterScreen } from './MasterScreen'

const roots = []
let latest
let setLatest

function Harness() {
  const [data, setData] = useState(defaultData)
  latest = data
  setLatest = setData
  return <MasterScreen data={data} setData={setData} go={vi.fn()} />
}

async function render() {
  const node = document.body.appendChild(document.createElement('div'))
  const root = createRoot(node)
  roots.push({ node, root })
  await act(async () => { root.render(<Harness />) })
  const find = (selector, text) => [...node.querySelectorAll(selector)].find((el) => el.textContent.includes(text))
  const click = (el) => act(async () => { el.click() })
  // Another device deletes a question while the editor is open.
  const syncDeletion = (id) => act(async () => { setLatest((d) => deleteQuestion(d, id)) })
  return { node, find, click, syncDeletion }
}

beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true) })

afterEach(async () => {
  for (const { node, root } of roots.splice(0)) {
    await act(async () => { root.unmount() })
    node.remove()
  }
  vi.unstubAllGlobals()
})

it('keeps a question deleted by sync out of an open question draft', async () => {
  const { node, find, click, syncDeletion } = await render()
  await click(find('.tabs button', 'Questions'))
  await click(find('.list-row', 'Swimming?'))
  const autoYes = find('fieldset', 'Auto yes when')
  await click([...autoYes.querySelectorAll('button')].find((el) => el.textContent === 'Camping?'))
  await syncDeletion('harrison')
  await click(find('.sheet-actions button', 'Save'))

  const swim = latest.questions.find((q) => q.id === 'swim')
  expect(swim.autoYesIf).toEqual(['camping'])
  expect(swim.askIf).toEqual(['auto:summer', 'fly'])
  expect(find('.list-row', 'Swimming?').textContent).toContain('Auto yes: Camping')
  expect(find('.list-row', 'Swimming?').textContent).not.toMatch(/: \?|or \?/)
})

it('keeps a question deleted by sync out of an open item draft', async () => {
  const { node, find, click, syncDeletion } = await render()
  await click(find('.list-row', "Max's baseball mitt"))
  await click(find('[role=dialog] button', 'Add alternative'))
  const second = node.querySelectorAll('.condition-group')[1]
  await click([...second.querySelectorAll('button')].find((el) => el.textContent === 'Camping'))
  await syncDeletion('harrison')
  await click(find('.sheet-actions button', 'Save'))

  const mitt = latest.templates.find((t) => t.text === "Max's baseball mitt")
  expect(mitt.conditionGroups).toEqual([{ all: ['camping'] }])
})
