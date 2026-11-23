import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, indexedDBLocalPersistence, initializeAuth, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in'
import { createFirestoreSync } from './firestoreSync'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseConfigured = Object.values(config).every(Boolean)
const app = firebaseConfigured ? initializeApp(config) : null
const auth = app
  ? Capacitor.isNativePlatform()
    ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
    : getAuth(app)
  : null
const db = app ? getFirestore(app) : null

export const observeAuth = (callback) => onAuthStateChanged(auth, callback)

let googleInitialization

function initializeGoogleSignIn() {
  if (!googleInitialization) {
    const clientId = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID
    if (!clientId) throw new Error('Google sign-in is missing its web client ID. Add it to the local environment and GitHub Actions variables.')
    googleInitialization = GoogleSignIn.initialize({ clientId })
  }
  return googleInitialization
}

export async function signInWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    await initializeGoogleSignIn()
    const result = await GoogleSignIn.signIn()
    const credential = GoogleAuthProvider.credential(result.idToken)
    return signInWithCredential(auth, credential)
  }

  return signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOutAccount() {
  try {
    if (Capacitor.isNativePlatform()) {
      try {
        await initializeGoogleSignIn()
        await GoogleSignIn.signOut()
      } catch (googleError) {
        // Firebase still needs to sign out if native Google cleanup is
        // unavailable (for example, if its client ID is not configured).
        console.warn('Google sign-out cleanup failed:', googleError)
      }
    }
  } finally {
    await signOut(auth)
  }
}

export const { ensureCloudData, listenForCloudData, saveCloudData } = createFirestoreSync(db)
