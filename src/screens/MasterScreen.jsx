import { useState } from 'react'
import { ConditionPicker, ConfirmSheet, RequirePicker, Sheet, Toggle, TopBar } from '../components'
import { CATEGORIES, PACK_GROUPS, conditionLabel, deleteQuestion, groupPackItems, newId } from '../model'

const TABS = [...CATEGORIES, { id: 'questions', label: 'Questions' }]

function TemplateSheet({ data, template, onSave, onDelete, onClose }) {
  const [t, setT] = useState(template)
  const set = (p) => setT((x) => ({ ...x, ...p }))
  const isNew = !data.templates.some((x) => x.id === t.id)
  return (
    <Sheet title={isNew ? 'New item' : 'Edit item'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (t.text.trim()) onSave({ ...t, text: t.text.trim() }) }}>
        <label className="field">
          <span>Item</span>
          <input value={t.text} onChange={(e) => set({ text: e.target.value })} autoFocus={isNew} required />
        </label>
        <label className="field">
          <span>Section</span>
          <select value={t.category} onChange={(e) => set({ category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <ConditionPicker questions={data.questions} value={t.when} onChange={(when) => set({ when })} />
        <RequirePicker questions={data.questions} value={t.requires} onChange={(requires) => set({ requires })} />
        {t.category === 'pack' && (
          <label className="field">
            <span>Heading</span>
            <select value={t.group || 'Main'} onChange={(e) => set({ group: e.target.value })}>
              {PACK_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </label>
        )}
        {t.category === 'pack' && (
          <Toggle label="One per day" hint="Shows a count: nights + 1" checked={t.perDay} onChange={(perDay) => set({ perDay })} />
        )}
        <div className="sheet-actions">
          {!isNew && <button type="button" className="btn danger-text" onClick={onDelete}>Delete</button>}
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Sheet>
  )
}

function QuestionSheet({ question, questions, isNew, onSave, onDelete, onClose }) {
  const [q, setQ] = useState(question)
  return (
    <Sheet title={isNew ? 'New question' : 'Edit question'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (q.text.trim()) onSave({ ...q, text: q.text.trim(), short: q.short.trim() || q.text.trim() }) }}>
        <label className="field">
          <span>Question (yes / no)</span>
          <input value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Going skiing?" autoFocus={isNew} required />
        </label>
        <label className="field">
          <span>Short label</span>
          <input value={q.short} onChange={(e) => setQ({ ...q, short: e.target.value })} placeholder="Skiing" />
        </label>
        <ConditionPicker
          questions={questions.filter((x) => x.id !== q.id)}
          value={[].concat(q.askIf ?? [])}
          onChange={(askIf) => setQ({ ...q, askIf })}
          legend="Only ask when…"
          emptyText="Nothing selected: asked on every trip."
          anyText="Asked when any selected is true."
        />
        <div className="sheet-actions">
          {!isNew && <button type="button" className="btn danger-text" onClick={onDelete}>Delete</button>}
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Sheet>
  )
}

export function MasterScreen({ data, setData, go }) {
  const [tab, setTab] = useState('pack')
  const [editing, setEditing] = useState(null)
  const [editingQ, setEditingQ] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const saveTemplate = (t) => {
    setData((d) => ({
      ...d,
      masterEdited: true,
      templates: d.templates.some((x) => x.id === t.id)
        ? d.templates.map((x) => (x.id === t.id ? t : x))
        : [...d.templates, t],
    }))
    setTab(t.category)
    setEditing(null)
  }
  const saveQuestion = (q) => {
    setData((d) => ({
      ...d,
      masterEdited: true,
      questions: d.questions.some((x) => x.id === q.id)
        ? d.questions.map((x) => (x.id === q.id ? q : x))
        : [...d.questions, q],
    }))
    setEditingQ(null)
  }

  const templates = data.templates.filter((t) => t.category === tab)

  return (
    <main>
      <TopBar title="Master list" onBack={() => go({ name: 'trips' })} backLabel="Trips" />
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {tab === 'questions' ? (
        <section>
          <p className="muted small pad-x">Asked when you plan a trip. Items can depend on the answers.</p>
          <div className="card list">
            {data.questions.map((q) => {
              const uses = data.templates.filter((t) => t.when.includes(q.id) || t.requires === q.id).length
              return (
                <button key={q.id} className="list-row" onClick={() => setEditingQ({ q, isNew: false })}>
                  <span>
                    {q.text}
                    {[].concat(q.askIf ?? []).length > 0 && (
                      <small className="muted block">
                        Only asked: {[].concat(q.askIf).map((c) => conditionLabel(c, data.questions)).join(' or ')}
                      </small>
                    )}
                  </span>
                  <span className="muted small">{uses} item{uses === 1 ? '' : 's'} ›</span>
                </button>
              )
            })}
          </div>
          <button className="btn wide add-btn" onClick={() => setEditingQ({ q: { id: newId(), text: '', short: '' }, isNew: true })}>
            + Add question
          </button>
        </section>
      ) : (
        <section>
          {(tab === 'pack' ? groupPackItems(templates) : [{ group: null, items: templates }]).map(({ group, items }) => (
            <div key={group ?? 'all'} className="group">
              {group && <h3 className="group-title">{group}</h3>}
              <div className="card list">
                {items.map((t) => (
                  <button key={t.id} className="list-row template-row" onClick={() => setEditing(t)}>
                    <span>
                      {t.text}
                      {t.perDay && <span className="qty">per day</span>}
                    </span>
                    <span className="chips small">
                      {t.requires && <span className="chip ghost strong">Only if {conditionLabel(t.requires, data.questions)}</span>}
                      {t.when.length === 0
                        ? !t.requires && <span className="chip ghost">Always</span>
                        : t.when.map((c) => <span key={c} className="chip ghost">{conditionLabel(c, data.questions)}</span>)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {templates.length === 0 && <div className="card"><p className="muted pad small">Nothing here yet.</p></div>}
          <button
            className="btn wide add-btn"
            onClick={() => setEditing({ id: newId(), category: tab, text: '', when: [], requires: null, group: tab === 'pack' ? 'Main' : null, perDay: false })}
          >
            + Add item
          </button>
        </section>
      )}

      {editing && (
        <TemplateSheet
          data={data}
          template={editing}
          onSave={saveTemplate}
          onClose={() => setEditing(null)}
          onDelete={() => {
            const t = editing
            setEditing(null)
            setConfirm({
              title: 'Delete item?',
              message: `“${t.text}” will be removed from the master list and from every trip.`,
              confirmLabel: 'Delete',
              onConfirm: () => setData((d) => ({ ...d, masterEdited: true, templates: d.templates.filter((x) => x.id !== t.id) })),
            })
          }}
        />
      )}

      {editingQ && (
        <QuestionSheet
          question={editingQ.q}
          questions={data.questions}
          isNew={editingQ.isNew}
          onSave={saveQuestion}
          onClose={() => setEditingQ(null)}
          onDelete={() => {
            const q = editingQ.q
            setEditingQ(null)
            setConfirm({
              title: 'Delete question?',
              message: `Items that depended on “${q.text}” will show on every trip unless they have other conditions.`,
              confirmLabel: 'Delete',
              onConfirm: () => setData((d) => deleteQuestion(d, q.id)),
            })
          }}
        />
      )}

      {confirm && <ConfirmSheet {...confirm} onClose={() => setConfirm(null)} />}
    </main>
  )
}
