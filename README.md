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

To install on your iPhone, select your team under *Signing & Capabilities* in Xcode the first time.
