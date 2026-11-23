import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, indexedDBLocalPersistence, initializeAuth, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut } from 'firebase/auth'
import { doc, getFirestore, onSnapshot, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in'
import { DATA_VERSION } from './model'
import { DataError } from './parseData'

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

function userDataDoc(user) {
  return doc(db, 'users', user.uid, 'state', 'travelList')
}

// First sign-in seeds a new account from this device. Existing accounts win
// when another device signs in, so the phone with the saved checklist should
// be connected first.
export async function ensureCloudData(user, localData, preferLocal = false) {
  const ref = userDataDoc(user)
  // JSON storage cannot represent undefined values. Match that behavior before
  // sending data to Firestore, which rejects undefined fields by default.
  const safeLocalData = JSON.parse(JSON.stringify(localData))
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref)
    const cloud = snapshot.exists() ? snapshot.data().payload : null
    // Never overwrite a copy a newer build wrote: this build can't read it.
    if (cloud?.version > DATA_VERSION) throw new DataError('This list was saved by a newer version of TravelList.', 'newer')
    if (cloud && !preferLocal) return cloud
    transaction.set(ref, { payload: safeLocalData, updatedAt: serverTimestamp() })
    return safeLocalData
  })
}

export function listenForCloudData(user, callback, onError) {
  return onSnapshot(userDataDoc(user), { includeMetadataChanges: true }, (snapshot) => {
    if (snapshot.exists() && !snapshot.metadata.hasPendingWrites) callback(snapshot.data().payload)
  }, onError)
}

export async function saveCloudData(user, data) {
  const safeData = JSON.parse(JSON.stringify(data))
  await setDoc(userDataDoc(user), { payload: safeData, updatedAt: serverTimestamp() })
}
