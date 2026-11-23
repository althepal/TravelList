import { useRef, useState } from 'react'
import { readBackupFile } from './DataBackupScreen'

// Shown when the saved list can't be loaded. The rest of the app needs a list,
// so restoring a backup is the way out from here. App keeps a copy of the
// unreadable file before replacing it.
export function LoadFailedScreen({ message, onRestore }) {
  const fileInput = useRef(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const choose = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      await onRestore(await readBackupFile(file))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <section className="prose">
        <h2>Couldn't load your lists</h2>
        <p>{message}</p>
        <p>
          Nothing has been changed. To keep going, restore a TravelList backup. The list that couldn't be
          loaded is kept as a separate file next to it.
        </p>
      </section>
      <section>
        <button className="btn primary wide" onClick={() => fileInput.current?.click()} disabled={busy}>
          {busy ? 'Restoring…' : 'Restore a backup'}
        </button>
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept=".json,application/json"
          onChange={choose}
          aria-label="Choose a TravelList backup file"
        />
        {error && <p className="backup-message error-text" role="alert">{error}</p>}
      </section>
    </main>
  )
}
