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

export function SyncScreen({ go, user, authLoading, syncStatus, syncError, hasUnsyncedChanges, onRetry }) {
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')

  const authenticate = async () => {
    setBusy(true)
    setFormError('')
    try {
      await signInWithGoogle()
    } catch (error) {
      setFormError(errorText(error))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (hasUnsyncedChanges && !window.confirm('Some changes have not reached the cloud yet. They will stay saved on this device for this Google account. Sign out anyway?')) return
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
      <TopBar title="Sync between devices" onBack={() => go({ name: 'trips' })} backLabel="Trips" />
      <section className="prose">
        {!firebaseConfigured ? (
          <p>Firebase setup is incomplete. Add the web app config to the local `.env.local` file and the GitHub repository variables.</p>
        ) : authLoading ? (
          <p>Checking your account…</p>
        ) : user ? (
          <>
            <div className="card form-card">
              <p>Signed in as <strong>{user.email}</strong></p>
              <p className="muted small">{syncError || syncStatus}</p>
              {hasUnsyncedChanges && <p className="muted small">Your unsynced changes are saved on this device for this Google account.</p>}
              {syncError && <button className="btn" onClick={onRetry}>Try syncing again</button>}
              <button className="btn" onClick={logout} disabled={busy}>{busy ? 'Signing out…' : 'Sign out'}</button>
            </div>
            <p>Your checklist stays saved on this device and syncs to your private account when connected.</p>
          </>
        ) : (
          <>
            <p>Sign in with the same Google account on your iPhone and website to use one shared checklist.</p>
            <p><strong>Connect the iPhone with your existing checklist first.</strong> If this account already has cloud data, it will replace the local list on this device.</p>
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
