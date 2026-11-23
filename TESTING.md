# TravelList sync tests

November 23, 2026. Testing covered the iPhone 17 Pro simulator on iOS 26.5, Chrome, and Firestore. All test edits used disposable trips or a local Firebase project.

The sync fix merges pending device edits into the latest list in a Firestore transaction, records each committed batch for safe retry, and gives a confirmed backup restore precedence over older edits.

## Before the fix

| Check | Result |
| --- | --- |
| `npm test`, `npm run test:ios-rules`, and `npm run build` | 42 JavaScript tests passed, the Swift reminder cutoff checks passed, and the web build succeeded. |
| Native Google sign-in | The first simulator build skipped Xcode signing and failed with a Keychain entitlement error. Rebuilding with signing resolved it. The test trip survived the update and Google sign-in succeeded. |
| Initial sync and live edits | A trip created on the simulator before sign-in appeared on the deployed website. Checking a box on the web and clearing it on the simulator propagated both ways. |
| Rapid edits and one-offs | Twenty rapid web checks and seven rapid simulator unchecks synced. Four one-offs with Unicode, leading and trailing whitespace, and a long label were saved. |
| Browser offline and reload | Two edits synced after reconnecting. The page could not load during an offline reload, but the pending edit survived and synced when reopened online. |
| Overlapping offline edits | Reproduced data loss. The offline web edit to **Sweatpants** replaced the **Sweatshirt** edit that iOS had already synced. Both clients settled at 15 of 48 checked instead of 16. |

## Automated checks after the fix

| Command or test file | Coverage | Result |
| --- | --- | --- |
| `npm test` | Checklist generation, conditions and question dependencies, data parsing and upgrades, backup validation, share cancellation, reminder calculations, and local storage. | 58 passed |
| `src/syncState.test.js` | Disjoint and overlapping edits, ordering, valid date ranges, deletes and reference cleanup, edits during upload, receipt replay, an explicit backup replacement, account switching, legacy offline edits, and newer cloud data. | Passed within `npm test` |
| `src/storage.test.js` | Missing and unreadable files, pre-update data, preserving an unreadable copy, ordered saves, and a pending batch with its baseline surviving a reload. | Passed within `npm test` |
| `npm run test:ios-rules` | Native coming-home reminder cutoff rules. | Passed |
| `npm run build` and Capacitor sync | Production web bundle and iOS asset and plugin sync. | Passed |
| Signed Xcode simulator build | Built, installed, and opened on the iPhone 17 Pro simulator. The existing Google session and both test trips survived the update. | Passed |
| Local Auth and Firestore rules | Owner access, another user and signed-out client denied, legacy list migration, stale or out-of-sequence writes denied, and transaction updates accepted. | Passed |

Run the rules test with Java 21 and the Firebase CLI. It uses disposable accounts in a local demo project.

```sh
npx --yes firebase-tools emulators:exec --config firebase.tests.json \
  --only auth,firestore --project demo-travellist-sync 'node tests/firestoreRules.mjs'
```

## Simulator and browser results after the fix

Both rebuilt clients shared a disposable account on the local Firebase project with the updated rules. The test builds used emulator sign-in. The regular signed iOS build was also installed and checked with its existing Google session.

| Check | Result |
| --- | --- |
| Initial sync | A 24-item trip created on the web before sign-in appeared on the simulator after it signed in. Both showed zero checked. |
| Offline conflict | Checked **Sweatpants** in offline Chrome and **Sweatshirt** on iOS. The iOS Account screen reached **Up to date** before Chrome reconnected. Both clients then showed both checked, for 2 of 24 done. |
| Open trip editor | Started renaming the trip in Chrome, checked **Rain coat** on iOS, then saved the rename. Both clients kept the new name and the checkmark. |
| Offline reload with another device editing | Checked **T-shirts** and **Shorts** in offline Chrome, reloaded, and checked **Collar shirt** on iOS while Chrome was still offline. After reopening Chrome online, both clients showed all three edits and 6 of 24 done. An offline refresh still requires a connection to load the website. |
| Fast edits and restart | Made eight web checkbox edits and added four one-offs, including Unicode, surrounding whitespace, and a long label. Chrome and iOS both showed 14 of 28 done after reloading Chrome and terminating and relaunching the simulator app. |

## Offline conflict regression

1. Open the rebuilt web app and the rebuilt simulator app with the same test account. Open a disposable trip with two unchecked items on both clients.
2. In Chrome DevTools under **Network**, set the test tab to **Offline**. Check one item in Chrome and verify the simulator still shows it unchecked.
3. Check a different item on the simulator. Verify **Account** shows **Up to date** and the browser still shows that item unchecked.
4. Restore **No throttling** on the browser tab. Verify both previously unchecked items are now checked on both clients.
5. Reload Chrome and relaunch the simulator app. Verify both checks remain.

The rebuilt web preview reached its Google sign-in screen. Two-way regression testing on the rebuilt clients used the local Firebase project. The public website, production Firebase rules, and physical iPhone still require release verification, including locked-screen notifications and the car Bluetooth Shortcut.

## Review follow-up

The JavaScript suite passed all 61 tests. The new regressions verify that a late retry leaves a newer edit intact, that two valid edits cannot create a question dependency loop, and that unrelated changes preserve rows with duplicate IDs. The suite also verifies that older inline receipts are recognized. The Firestore emulator verified that the original batch receipt survives a newer list write and remains private to its owner.

## iOS offline, restore, and lifecycle follow-up

The follow-up used the working tree based on commit `803c018a71f6`. The signed production simulator build and rebuilt web preview contained `index-DGGP5Xy-.js` with SHA-256 `85a212667841e629c73bac25a32b15f52c49d6fd569a14a874bcf75720fc83c7`. The disposable local-Firebase build used for the iOS and Chrome tests contained `index-B-1nRxPY.js` with SHA-256 `71596587742709530c0abf68a759dd1d322062ff01c60fbbdf56cb3f8fcc1b95`.

| Check | Result |
| --- | --- |
| iOS offline edit and cold relaunch | Routed only the simulator's Firestore connection through a local proxy and disconnected it while Chrome stayed online. Checked **Underwear** on iOS. Chrome did not receive it. Terminated and relaunched iOS while disconnected and verified its checkmark remained. |
| Native foreground retry | Checked **Socks** in online Chrome while iOS was disconnected. Sent iOS to the Home Screen, restored its Firestore connection, and brought the same app process forward. Both clients showed both items checked, for 2 of 24 done. |
| Two Chrome tabs | The second tab waited for the first to close, then loaded the saved trip. |
| Two-client Firestore tests | The emulator used the app's own transaction code with distinct authenticated clients. A backup won over a queued edit. A stale check did not revive a deleted trip, master item, or one-off. Signing in as a different user loaded that account's list and left the old account's list intact. |
| Firestore rules and receipts | Rejected fractional revisions and attempts by another account to delete the list. Passed receipt replay, owner isolation, and the legacy-write guard using the app's actual write path. |
| React sync lifecycle | Automated tests verified debouncing and saving a batch locally before upload, pausing and resuming the listener, foreground retry after an offline start with a saved batch, and a retry timer when the browser reports it is online. |
| Recovery from a load failure | Automated UI tests verified that the unreadable file is copied first and a confirmed backup reaches the current account or the next sign-in. The previous cloud copy did not replace the recovered draft. |
| Final build and suites | 67 JavaScript tests, Swift reminder checks, Firestore emulator checks, the web build, and the signed simulator build passed. |

Searching Settings on the iOS 26.5 simulator returned no results for **Airplane Mode**. The local proxy tested loss of Firestore access, offline relaunch, and foreground recovery. Physical-iPhone Airplane Mode and production release verification remain open.
