import { TopBar } from '../components'

export function HelpScreen({ go }) {
  return (
    <main>
      <TopBar title="Car reminders" onBack={() => go({ name: 'trips' })} backLabel="Trips" />
      <section className="prose">
        <p>
          On a trip's last day (or after you tap <b>Heading home</b>), TravelList can remind you of your
          Coming Home items every time your phone connects to the car. You set this up once in the
          Shortcuts app:
        </p>
        <ol>
          <li>Open <b>Shortcuts</b> › <b>Automation</b> › <b>+</b>.</li>
          <li>Choose <b>Bluetooth</b>, tap <b>Choose</b> and pick your car (the name it has in Settings › Bluetooth). Leave it on <b>Is Connected</b>.</li>
          <li>Pick <b>Run Immediately</b> and turn off <b>Notify When Run</b>.</li>
          <li>Tap <b>Next</b>, then <b>New Blank Automation</b>.</li>
          <li>Add the action <b>Check Coming Home</b> (search “TravelList”).</li>
          <li>Tap <b>Done</b>.</li>
        </ol>
        <p>
          When no trip is coming home, it does nothing. When one is, you get a notification listing what's
          left — until you check the items off or end the trip.
        </p>
        <p>
          You'll also get one notification at 8am on the last day, even without this automation.
        </p>
        <h2>Your data</h2>
        <p>
          Everything is stored on this phone only, in <b>Files › On My iPhone › TravelList</b>. It's included
          in your regular iPhone iCloud backup.
        </p>
      </section>
    </main>
  )
}
