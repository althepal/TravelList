import { Fragment, useState } from 'react'
import { ConfirmSheet, QuestionAutoYesPicker, QuestionConditionPicker, Sheet, TopBar } from '../components'
import {
  CATEGORIES, conditionLabel, deleteQuestion, deleteTemplate, groupPackItems, newQuestion, newTemplate,
  questionDependencyCycle, saveQuestion, saveTemplate, templateWithExistingConditions, withExistingConditions,
} from '../model'
import { TemplateSheet } from './TemplateSheet'
import { mergeFields, mergeTemplate } from '../mergeData'

const TABS = [...CATEGORIES, { id: 'questions', label: 'Questions' }]

export function QuestionSheet({ question, questions, isNew, onSave, onDelete, onClose, pinned }) {
  const [q, setQ] = useState(question)
  const [validationError, setValidationError] = useState('')
  const [showAutoYes, setShowAutoYes] = useState(question.autoYesIf.length > 0)
  const otherQuestions = questions.filter((x) => x.id !== q.id)
  const submit = (event) => {
    event.preventDefault()
    if (!q.text.trim()) return
    const draft = { ...q, text: q.text.trim(), short: (q.short || '').trim() || q.text.trim() }
    const error = onSave(draft)
    if (error) setValidationError(error)
  }
  return (
    <Sheet title={isNew ? 'New question' : 'Edit question'} onClose={onClose} pinned={pinned}>
      <form onSubmit={submit}>
        <div className="sheet-fields">
          <label className="field">
            <span>Question (yes / no)</span>
            <input value={q.text} onChange={(e) => setQ({ ...q, text: e.target.value })} placeholder="Going skiing?" autoFocus={isNew} required />
          </label>
          <label className="field">
            <span>Short label</span>
            <input value={q.short ?? ''} onChange={(e) => setQ({ ...q, short: e.target.value })} placeholder="Skiing" />
          </label>
          <QuestionConditionPicker
            questions={otherQuestions}
            value={q.askIf}
            onChange={(askIf) => { setQ({ ...q, askIf }); setValidationError('') }}
          />
          {showAutoYes ? (
            <QuestionAutoYesPicker
              questions={otherQuestions}
              value={q.autoYesIf}
              onChange={(autoYesIf) => { setQ({ ...q, autoYesIf }); setValidationError('') }}
            />
          ) : (
            <button type="button" className="link small" onClick={() => setShowAutoYes(true)}>Add auto yes</button>
          )}
        </div>
        {validationError && <p className="sheet-error error-text small" role="alert">{validationError}</p>}
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
  const [editing, setEditing] = useState(requestedTemplate ? { item: requestedTemplate, isNew: false } : null)
  const [editingQ, setEditingQ] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const onSaveTemplate = (t) => {
    setData((d) => {
      if (editing.isNew) return saveTemplate(d, templateWithExistingConditions(t, d.questions))
      const current = d.templates.find((item) => item.id === t.id)
      return current ? saveTemplate(d, templateWithExistingConditions(mergeTemplate(editing.item, t, current), d.questions)) : d
    })
    setTab(t.category)
    setSearch('')
    setEditing(null)
  }
  const onSaveQuestion = (draft) => {
    let error = ''
    setData((d) => {
      const current = d.questions.find((item) => item.id === draft.id)
      if (!editingQ.isNew && !current) return d
      const q = editingQ.isNew ? draft : mergeFields(editingQ.q, draft, current)
      const next = saveQuestion(d, withExistingConditions(q, d.questions))
      const cycle = questionDependencyCycle(next.questions, q.id)
      if (!cycle) return next
      const names = cycle.map((id) => next.questions.find((item) => item.id === id)?.text || 'Unnamed question')
      error = `These questions depend on each other in a loop: ${names.join(' → ')}. Change their Only ask when or Auto yes when choices before saving.`
      return d
    })
    if (!error) {
      setSearch('')
      setEditingQ(null)
    }
    return error
  }

  const query = search.trim().toLocaleLowerCase()
  const tabLabel = TABS.find((item) => item.id === tab)?.label ?? tab
  const templates = data.templates.filter((t) => t.category === tab)
  const filteredTemplates = templates.filter((t) => {
    const conditions = t.conditionGroups.flatMap(({ all }) => all)
      .map((condition) => conditionLabel(condition, data.questions))
      .join(' ')
    return !query || `${t.text} ${t.group || ''} ${conditions}`.toLocaleLowerCase().includes(query)
  })
  const filteredQuestions = data.questions.filter((q) =>
    !query || `${q.text} ${q.short || ''}`.toLocaleLowerCase().includes(query),
  )

  return (
    <main>
      <TopBar
        title="Master list"
        onBack={() => go(returnTo ?? { name: 'trips' })}
        backLabel={returnTo?.label ?? 'Trips'}
        action={tab !== 'questions' && (
          <button type="button" className="link" onClick={() => setEditing({ item: newTemplate(tab), isNew: true })}>
            Add item
          </button>
        )}
      />
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
              const uses = data.templates.filter((t) => t.conditionGroups.some(({ all }) => all.includes(q.id))).length
              return (
                <button key={q.id} className="list-row" onClick={() => setEditingQ({ q, isNew: false })}>
                  <span>
                    {q.text}
                    {q.askIf.length > 0 && (
                      <small className="muted block">
                        Only asked: {q.askIf.map((c) => conditionLabel(c, data.questions)).join(' or ')}
                      </small>
                    )}
                    {q.autoYesIf.length > 0 && (
                      <small className="muted block">
                        Auto yes: {q.autoYesIf.map((c) => conditionLabel(c, data.questions)).join(' or ')}
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
                  <button key={t.id} className="list-row template-row" onClick={() => setEditing({ item: t, isNew: false })}>
                    <span>
                      {t.text}
                      {t.perDay && <span className="qty">per day</span>}
                    </span>
                    <span className="chips condition-summary">
                      {t.conditionGroups.length === 0 && <span className="chip ghost">Always</span>}
                      {t.conditionGroups.map(({ all }, index) => (
                        <Fragment key={index}>
                          {index > 0 && <span className="muted small">or</span>}
                          <span className="chip ghost">{all.map((c) => conditionLabel(c, data.questions)).join(' and ')}</span>
                        </Fragment>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {filteredTemplates.length === 0 && <div className="card"><p className="muted pad small">{query ? 'No matching items.' : 'Nothing here yet.'}</p></div>}
        </section>
      )}

      {editing && (
        <TemplateSheet
          data={data}
          template={editing.item}
          pinned
          onSave={onSaveTemplate}
          onClose={() => setEditing(null)}
          onDelete={() => {
            const t = editing.item
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
          pinned
          onSave={onSaveQuestion}
          onClose={() => setEditingQ(null)}
          onDelete={() => {
            const q = editingQ.q
            setEditingQ(null)
            setConfirm({
              title: 'Delete question?',
              message: `Item rules that use “${q.text}” will stop matching. Items that lose their last rule stay off trips until you edit them. Other questions’ Only ask when and Auto yes when choices will drop it.`,
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
