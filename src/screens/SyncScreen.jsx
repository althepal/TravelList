import { useState } from 'react'
import { TopBar } from '../components'
import { firebaseConfigured, signInWithGoogle, signOutAccount } from '../firebase'

function errorText(error) {
  if (error?.code === 'auth/configuration-not-found' || error?.code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled yet. Enable Google under Firebase Authentication → Sign-in method.'
  if (error?.code === 'auth/unauthorized-domain') return 'This website is not authorized for sign-in. Add its domain under Firebase Authentication → Settings → Authorized domains.'
  if (error?.code === 'auth/popup-closed-by-user') return 'The Google sign-in window was closed before sign-in finished.'
  if (error?.code === 'auth/popup-blocked') return 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.'
  if (error?.code === 'SIGN_IN_CANCELED') return 'Google sign-in was canceled.'
  if (error?.code?.endsWith('permission-denied')) return 'Firebase blocked access. Set the Firestore rules from firestore.rules in this project.'
  return error?.message || 'Could not connect. Check your connection and Firebase setup.'
}

export function SyncScreen({ go, onAuthenticated, user, authLoading, syncStatus, syncError, ownerEmail, hasUnsyncedChanges, retry, needsLegacyResolution, useCloudCopy }) {
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const authenticate = async () => {
    setBusy(true)
    setFormError('')
    try {
      await signInWithGoogle()
      onAuthenticated?.()
    } catch (error) {
      setFormError(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (hasUnsyncedChanges && !window.confirm("Some changes haven't reached the cloud yet. They'll upload when you sign back in with this account, but signing in with a different account deletes them. Sign out anyway?")) return
    setBusy(true)
    setFormError('')
    try {
      await signOutAccount()
    } catch (error) {
      setFormError(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main>
      <TopBar title="Account" onBack={() => go({ name: 'trips' })} backLabel="Trips" />
      <section className="prose">
        {!firebaseConfigured ? (
          <p>Firebase setup is incomplete. Add the web app config to the local `.env.local` file and the GitHub repository variables.</p>
        ) : authLoading ? (
          <p>Checking your account…</p>
        ) : user ? (
          <>
            <div className="card form-card">
              <p>{user.email ? <>Signed in as <strong>{user.email}</strong></> : 'Signed in with Google'}</p>
              <p className="muted small">{syncError || syncStatus}</p>
              {hasUnsyncedChanges && <p className="muted small">Changes not yet in the cloud are saved on this device.</p>}
              {needsLegacyResolution ? (
                <>
                  <button className="btn" onClick={() => go({ name: 'dataBackup' })}>Export a backup</button>
                  <button className="btn" onClick={() => {
                    if (window.confirm('Replace this device’s list with the cloud copy?')) useCloudCopy()
                  }}>Use cloud copy</button>
                </>
              ) : null}
              {syncError && <button className="btn" onClick={retry}>Try syncing again</button>}
              <button className="btn" onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
            </div>
            <p>Your checklist stays saved on this device and syncs to your private account when connected.</p>
          </>
        ) : (
          <>
            <p>Sign in with the same Google account on your iPhone and website to use one shared checklist.</p>
            {ownerEmail ? (
              <p>This device's list belongs to <strong>{ownerEmail}</strong>. Signing in with a different account deletes it from this device and loads that account's list instead, or a fresh starter list if it has none.</p>
            ) : (
              <p><strong>Connect the iPhone with your existing checklist first.</strong> If this account already has cloud data, it will replace the local list on this device.</p>
            )}
            <div className="card form-card">
              {formError && <p className="error-text" role="alert">{formError}</p>}
              <button type="button" className="btn primary" onClick={authenticate} disabled={busy}>
                {busy ? 'Opening Google…' : 'Continue with Google'}
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
