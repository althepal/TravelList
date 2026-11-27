import { useState } from 'react'
import { ItemConditionPicker, Sheet, Toggle } from '../components'
import { CATEGORIES, PACK_GROUPS } from '../model'

// The one editor for a master list item: used for new items, edits, and
// one-offs being added to the master list from a trip.
export function TemplateSheet({ data, template, title, onSave, onDelete, onClose, pinned }) {
  const [t, setT] = useState(template)
  const set = (p) => setT((x) => ({ ...x, ...p }))
  const isNew = !data.templates.some((x) => x.id === t.id)
  const setCategory = (category) =>
    set({ category, group: category === 'pack' ? (t.group ?? 'Main') : null })
  const submit = (event) => {
    event.preventDefault()
    if (!t.text.trim()) return
    const conditionGroups = t.conditionGroups.filter(({ all }) => all.length > 0)
    onSave({ ...t, text: t.text.trim(), conditionGroups })
  }
  return (
    <Sheet title={title ?? (isNew ? 'New item' : 'Edit item')} onClose={onClose} pinned={pinned}>
      <form onSubmit={submit}>
        <div className="sheet-fields">
          <label className="field">
            <span>Item</span>
            <input value={t.text} onChange={(e) => set({ text: e.target.value })} autoFocus={isNew && !t.text} required />
          </label>
          <label className="field">
            <span>Section</span>
            <select value={t.category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <ItemConditionPicker
            questions={data.questions} value={t.conditionGroups} onChange={(conditionGroups) => set({ conditionGroups })}
          />
          {t.category === 'pack' && (
            <label className="field">
              <span>Heading</span>
              <select value={t.group} onChange={(e) => set({ group: e.target.value })}>
                {PACK_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          )}
          {t.category === 'pack' && (
            <Toggle label="One per day" hint="Shows a count: nights + 1" checked={t.perDay} onChange={(perDay) => set({ perDay })} />
          )}
        </div>
        <div className="sheet-actions">
          {onDelete && !isNew && <button type="button" className="btn danger-text" onClick={onDelete}>Delete</button>}
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Sheet>
  )
}
