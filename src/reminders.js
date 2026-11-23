import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { addDays, parseDate, tripItems } from './model'

const LAST_DAY_HOUR = 8
const BEFORE_TRIP_HOUR = 20

function at(day, hour) {
  const d = parseDate(day)
  d.setHours(hour, 0, 0, 0)
  return d
}

// Every notification the trips call for, as plain objects (testable without iOS).
export function plannedReminders(data, now = new Date()) {
  const out = []
  data.trips.forEach((trip, i) => {
    if (trip.ended) return
    const items = tripItems(data, trip).filter((x) => !x.checked)
    const name = trip.name || 'your trip'

    out.push({
      id: i * 10 + 1,
      title: `Charge the car for ${name}`,
      body: 'Charge the car for your trip tomorrow.',
      at: at(addDays(trip.start, -1), BEFORE_TRIP_HOUR),
      tripId: trip.id,
    })

    const home = items.filter((x) => x.category === 'home')
    if (home.length && !trip.headingHome) {
      out.push({
        id: i * 10 + 2,
        title: `Last day of ${name} — coming home`,
        body: home.map((x) => x.text).join('\n'),
        at: at(trip.end, LAST_DAY_HOUR),
        tripId: trip.id,
      })
    }
  })
  return out.filter((r) => r.at > now)
}

// Replaces all pending notifications with the current plan. Cheap enough to
// run after every change; iOS allows 64 pending and each trip uses at most two.
export async function syncReminders(data) {
  if (!Capacitor.isNativePlatform()) return
  const plan = plannedReminders(data)
  const pending = await LocalNotifications.getPending()
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
  }
  if (!plan.length) return
  let { display } = await LocalNotifications.checkPermissions()
  if (display === 'prompt' || display === 'prompt-with-rationale') {
    ;({ display } = await LocalNotifications.requestPermissions())
  }
  if (display !== 'granted') return
  await LocalNotifications.schedule({
    notifications: plan.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      schedule: { at: r.at },
      extra: { tripId: r.tripId },
    })),
  })
}
