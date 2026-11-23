# TravelList

A trip checklist that builds itself from a few questions. The iPhone app stores data on-device; the browser preview stores it in that browser.

- **Master list**: searchable items in four sections (Pack, To Do, Out the Door, Coming Home), each optionally tied to trip questions ("Camping?") or automatic conditions (winter, summer); an item shows when any of its conditions is true, plus an optional "only if" condition that must also hold (e.g. Max's bathing suit: only if Max, when swimming).
- **Trips**: dates + an explicit Yes/No to every question that applies (a question can be limited to other answers or seasons) → checklist. Items are computed live from the master list, so edits show up in planned trips. One-offs can be promoted to the master list, and completed items can be hidden while packing.
- **Backups**: export the complete list as JSON and import it on another device. Import replaces that device's data after a preview and confirmation.
- **Reminders**: a local notification at 8am on the last day listing unchecked Coming Home items. The **Check Coming Home** Shortcuts action (`ios/App/App/ComingHomeIntent.swift`) powers the car-Bluetooth automation; reminders stop when the items are checked, the trip is ended, or three days after the return date. Setup steps are in the app under *Car reminders setup*.
- **Data**: `Documents/travellist.json` on the phone (visible in Files, included in iCloud device backup). `coming-home.json` beside it is a derived snapshot for the Shortcuts action.

## Develop

```bash
npm install
npm run dev      # browser preview (data in localStorage; no notifications)
npm test
npm run test:ios-rules # Swift reminder cutoff checks
npm run ios      # build, sync, open Xcode → pick your phone, Run
```

See [TravelList test results](TESTING.md) for the automated checks and the iPhone and web sync regression steps.

## Website hosting

The GitHub Actions workflow builds the static web app and publishes it to GitHub Pages when changes are pushed to `main`. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The expected site URL is `https://althepal.github.io/TravelList/`.

## Cloud sync

Cloud sync uses Google sign-in and Cloud Firestore. For local builds, `.env.local` contains the Firebase web app config and Google web client ID and is ignored by Git. For GitHub Pages builds, add repository variables named `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, and `GOOGLE_WEB_CLIENT_ID` under **Settings → Secrets and variables → Actions → Variables**.

In the Firebase Console, enable Google under **Authentication → Sign-in method**, add the website domain under **Authentication → Settings → Authorized domains**, create a Cloud Firestore database, and publish the rules in `firestore.rules` under **Firestore Database → Rules**. The app stores one private list document per Firebase user. Sign in on the iPhone first to seed the cloud with its existing checklist; signing in on another device downloads the existing cloud copy. Signing in with a different account than a device last synced with deletes that device's list and loads the new account's copy (or the starter list if it has none). The app keeps a local copy for offline use. Analytics is not initialized by the app.

Sync applies each device's changes to the latest cloud copy in a Firestore transaction. Each committed batch has a private receipt so a retry cannot apply it again. Edits to different fields or checklist items can merge. If two devices change the same field, the last committed change wins. A change that would introduce a question dependency loop keeps the cloud dependency. A deleted trip or item stays deleted when an older edit arrives. A confirmed backup restore replaces the list and supersedes edits queued against the previous copy. When recovering from an unreadable file, TravelList identifies the cloud account that will receive the restored copy and asks for confirmation before saving it.

Browser tabs share one saved draft. On browsers with Web Locks, a second tab waits for the first to close before it can open that draft.

Publish the updated Firestore rules when releasing the matching web and iPhone builds. Once a list records its first sync revision, the rules reject full-list writes from older builds. If a device has unsynced edits from before this update and its local copy differs from the cloud, the Account screen keeps the local copy available for export before the user chooses the cloud copy.

To install on your iPhone, select your team under *Signing & Capabilities* in Xcode the first time.
