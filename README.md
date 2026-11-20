# TravelList

A trip checklist that builds itself from a few questions. On-device only: no server, no account.

- **Master list**: items in four sections (Pack, To Do, Out the Door, Coming Home), each optionally tied to trip questions ("Camping?") or automatic conditions (winter, overnight); an item shows when any of its conditions is true, plus an optional "only if" condition that must also hold (e.g. Max's bathing suit: only if Max, when warm or swimming).
- **Trips**: dates + an explicit Yes/No to every question that applies (a question can be limited to a season, e.g. bathing suits only May–Sep) → checklist. Items are computed live from the master list, so edits show up in planned trips. One-offs can be promoted to the master list.
- **Reminders**: a local notification at 8am on the last day listing unchecked Coming Home items. The **Check Coming Home** Shortcuts action (`ios/App/App/ComingHomeIntent.swift`) powers the car-Bluetooth automation; setup steps are in the app under *Car reminders setup*.
- **Data**: `Documents/travellist.json` on the phone (visible in Files, included in iCloud device backup). `coming-home.json` beside it is a derived snapshot for the Shortcuts action.

## Develop

```bash
npm install
npm run dev      # browser preview (data in localStorage; no notifications)
npm test
npm run ios      # build, sync, open Xcode → pick your phone, Run
```

To install on your iPhone, select your team under *Signing & Capabilities* in Xcode the first time.
