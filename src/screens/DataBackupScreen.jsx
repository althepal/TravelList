import { useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { ConfirmSheet, TopBar } from '../components'
import { DataError, parseData } from '../parseData'
import { isShareCancellation } from '../share'

// Reads a chosen backup file, or throws an Error whose message is ready to show.
export async function readBackupFile(file) {
  try {
    return parseData(JSON.parse(await file.text()), { imported: true })
  } catch (e) {
    if (e?.code === 'newer') throw new Error(`${e.message} Update the app to import this backup.`)
    if (e instanceof DataError) throw e
    throw new Error('That file could not be read as a TravelList JSON backup.')
  }
}

function backupFilename() {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `travellist-backup-${stamp}.json`
}

export function DataBackupScreen({ data, restoreBackup, go }) {
  const fileInput = useRef(null)
  const [candidate, setCandidate] = useState(null)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [confirming, setConfirming] = useState(false)

  const exportBackup = async () => {
    setError('')
    setStatus('')
    const filename = backupFilename()
    const contents = JSON.stringify(data, null, 2)
    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: filename,
          data: contents,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        })
        try {
          const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache })
          await Share.share({
            title: 'TravelList backup',
            url: uri,
            dialogTitle: 'Share TravelList backup',
          })
          setStatus('Backup shared.')
        } finally {
          await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {})
        }
      } else {
        const blob = new Blob([contents], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = filename
        document.body.appendChild(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        setStatus(`Downloaded ${filename}.`)
      }
    } catch (e) {
      const message = typeof e === 'string' ? e : e?.message
      if (isShareCancellation(e)) return
      setError(`Couldn't export the backup: ${message || 'Unknown error'}`)
    }
  }

  const chooseBackup = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setStatus('')
    try {
      setCandidate({ data: await readBackupFile(file), filename: file.name })
    } catch (e) {
      setCandidate(null)
      setError(e.message)
    }
  }

  const applyBackup = () => {
    restoreBackup(candidate.data)
    setStatus(`Imported ${candidate.filename}. Your trips and checklist are now replaced by this backup.`)
    setCandidate(null)
    setConfirming(false)
  }

  const tripCount = candidate?.data.trips.length ?? 0
  const itemCount = candidate?.data.templates.length ?? 0
  const questionCount = candidate?.data.questions.length ?? 0

  return (
    <main>
      <TopBar title="Data & backup" onBack={() => go({ name: 'trips' })} backLabel="Trips" />

      <section className="backup-section">
        <h2 className="section-title">Move or save your list</h2>
        <div className="card backup-card">
          <p className="muted small">A backup includes your master list, questions, trips, and check marks.</p>
          <button className="btn primary wide" onClick={exportBackup}>Export backup</button>
          {Capacitor.isNativePlatform() && (
            <p className="muted small">Choose AirDrop or Save to Files in the sharing menu to move the backup to another device.</p>
          )}
        </div>
      </section>

      <section className="backup-section">
        <h2 className="section-title">Restore a backup</h2>
        <div className="card backup-card">
          <p className="muted small">Choose a TravelList JSON backup from Files or your downloads.</p>
          <button className="btn wide" onClick={() => fileInput.current?.click()}>Choose backup file</button>
          <input
            ref={fileInput}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={chooseBackup}
            aria-label="Choose a TravelList backup file"
          />
          {candidate && (
            <div className="backup-preview" aria-live="polite">
              <strong>{candidate.filename}</strong>
              <span className="muted small">{tripCount} trips · {itemCount} master items · {questionCount} questions</span>
              <button className="btn danger wide" onClick={() => setConfirming(true)}>Replace with this backup</button>
            </div>
          )}
        </div>
      </section>

      {error && <p className="backup-message error-text" role="alert">{error}</p>}
      {status && <p className="backup-message muted" role="status">{status}</p>}

      <p className="muted small backup-note">Import replaces the data on this device. Export its current backup first if you may want to restore it later.</p>

      {confirming && candidate && (
        <ConfirmSheet
          title="Replace this device's data?"
          message={`This replaces the current master list and all trips with “${candidate.filename}” (${tripCount} trips, ${itemCount} items, and ${questionCount} questions).`}
          confirmLabel="Replace data"
          onConfirm={applyBackup}
          onClose={() => setConfirming(false)}
        />
      )}
    </main>
  )
}
