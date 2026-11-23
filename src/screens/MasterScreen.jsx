import { useState } from 'react'
import { ConditionPicker, ConfirmSheet, Sheet, TopBar } from '../components'
import {
  CATEGORIES, conditionLabel, deleteQuestion, deleteTemplate, groupPackItems, newQuestion, newTemplate,
  questionDependencyCycle, saveQuestion, saveTemplate,
} from '../model'
import { TemplateSheet } from './TemplateSheet'

const TABS = [...CATEGORIES, { id: 'questions', label: 'Questions' }]

function QuestionSheet({ question, questions, isNew, onSave, onDelete, onClose }) {
  const [q, setQ] = useState(question)
  const [validationError, setValidationError] = useState('')
  const submit = (event) => {
    event.preventDefault()
    if (!q.text.trim()) return
    const saved = { ...q, text: q.text.trim(), short: (q.short || '').trim() || q.text.trim() }
    const nextQuestions = isNew ? [...questions, saved] : questions.map((item) => item.id === saved.id ? saved : item)
    const cycle = questionDependencyCycle(nextQuestions, saved.id)
    if (cycle) {
      const names = cycle.map((id) => nextQuestions.find((item) => item.id === id)?.text || 'Unnamed question')
      setValidationError(`These questions depend on each other in a loop: ${names.join(' → ')}. Change their follow-up conditions before saving.`)
      return
    }
    onSave(saved)
  }
  return (
    <Sheet title={isNew ? 'New question' : 'Edit question'} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="field">
          <span>Question (yes / no)</span>
          <input value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Going skiing?" autoFocus={isNew} required />
        </label>
        <label className="field">
          <span>Short label</span>
          <input value={q.short ?? ''} onChange={(e) => setQ({ ...q, short: e.target.value })} placeholder="Skiing" />
        </label>
        <ConditionPicker
          questions={questions.filter((x) => x.id !== q.id)}
          value={q.askIf}
          onChange={(askIf) => { setQ({ ...q, askIf }); setValidationError('') }}
          legend="Only ask when…"
          emptyText="Nothing selected: asked on every trip."
          anyText="Asked when any selected is true."
        />
        {validationError && <p className="error-text small" role="alert">{validationError}</p>}
        <div className="sheet-actions">
          {!isNew && <button type="button" className="btn danger-text" onClick={onDelete}>Delete</button>}
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Sheet>
  )
}

export function MasterScreen({ data, setData, go, itemId, returnTo }) {
  const requestedTemplate = data.templates.find((item) => item.id === itemId)
  const [tab, setTab] = useState(requestedTemplate?.category || 'pack')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(requestedTemplate ?? null)
  const [editingQ, setEditingQ] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const onSaveTemplate = (t) => {
    setData((d) => saveTemplate(d, t))
    setTab(t.category)
    setSearch('')
    setEditing(null)
  }
  const onSaveQuestion = (q) => {
    setData((d) => saveQuestion(d, q))
    setSearch('')
    setEditingQ(null)
  }

  const query = search.trim().toLocaleLowerCase()
  const tabLabel = TABS.find((item) => item.id === tab)?.label ?? tab
  const templates = data.templates.filter((t) => t.category === tab)
  const filteredTemplates = templates.filter((t) => {
    const conditions = [...t.when, ...(t.requires ? [t.requires] : [])]
      .map((condition) => conditionLabel(condition, data.questions))
      .join(' ')
    return !query || `${t.text} ${t.group || ''} ${conditions}`.toLocaleLowerCase().includes(query)
  })
  const filteredQuestions = data.questions.filter((q) =>
    !query || `${q.text} ${q.short || ''}`.toLocaleLowerCase().includes(query),
  )

  return (
    <main>
      <TopBar title="Master list" onBack={() => go(returnTo ?? { name: 'trips' })} backLabel={returnTo?.label ?? 'Trips'} />
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => { setTab(t.id); setSearch('') }}>{t.label}</button>
        ))}
      </nav>

      <div className="search-field">
        <label className="sr-only" htmlFor="master-list-search">Search {tabLabel}{tab === 'questions' ? '' : ' items'}</label>
        <input
          id="master-list-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${tabLabel.toLocaleLowerCase()}…`}
        />
        {search && <button type="button" className="link" onClick={() => setSearch('')}>Clear</button>}
      </div>

      {tab === 'questions' ? (
        <section>
          <p className="muted small pad-x">Asked when you plan a trip. Items can depend on the answers.</p>
          <div className="card list">
            {filteredQuestions.map((q) => {
              const uses = data.templates.filter((t) => t.when.includes(q.id) || t.requires === q.id).length
              return (
                <button key={q.id} className="list-row" onClick={() => setEditingQ({ q, isNew: false })}>
                  <span>
                    {q.text}
                    {q.askIf.length > 0 && (
                      <small className="muted block">
                        Only asked: {q.askIf.map((c) => conditionLabel(c, data.questions)).join(' or ')}
                      </small>
                    )}
                  </span>
                  <span className="muted small">{uses} item{uses === 1 ? '' : 's'} ›</span>
                </button>
              )
            })}
            {filteredQuestions.length === 0 && <p className="muted pad small">{query ? 'No matching questions.' : 'No questions yet.'}</p>}
          </div>
          <button className="btn wide add-btn" onClick={() => setEditingQ({ q: newQuestion(), isNew: true })}>
            + Add question
          </button>
        </section>
      ) : (
        <section>
          {(tab === 'pack' ? groupPackItems(filteredTemplates) : [{ group: null, items: filteredTemplates }]).map(({ group, items }) => (
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
          {filteredTemplates.length === 0 && <div className="card"><p className="muted pad small">{query ? 'No matching items.' : 'Nothing here yet.'}</p></div>}
          <button
            className="btn wide add-btn"
            onClick={() => setEditing(newTemplate(tab))}
          >
            + Add item
          </button>
        </section>
      )}

      {editing && (
        <TemplateSheet
          data={data}
          template={editing}
          onSave={onSaveTemplate}
          onClose={() => setEditing(null)}
          onDelete={() => {
            const t = editing
            setEditing(null)
            setConfirm({
              title: 'Delete item?',
              message: `“${t.text}” will be removed from the master list and from every trip.`,
              confirmLabel: 'Delete',
              onConfirm: () => setData((d) => deleteTemplate(d, t.id)),
            })
          }}
        />
      )}

      {editingQ && (
        <QuestionSheet
          question={editingQ.q}
          questions={data.questions}
          isNew={editingQ.isNew}
          onSave={onSaveQuestion}
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
