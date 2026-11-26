import { TopBar } from '../components'

export function HelpScreen({ go }) {
  return (
    <main>
      <TopBar title="Car reminders" onBack={() => go({ name: 'trips' })} backLabel="Trips" />
      <section className="prose">
        <p>
          On a trip's last day (or after you tap <b>Heading home early</b>), TravelList can remind you of your
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
          left. Tap <b>I'm home</b> to close the trip and stop these reminders. They also stop when you check
          everything off or three days after your scheduled return date.
        </p>
        <p>
          You'll also get one notification at 8am on the last day, even without this automation.
        </p>
        <h2>Your data</h2>
        <p>
          Your list is saved on this device, in <b>Files › On My iPhone or iPad › TravelList</b>, and included
          in your regular iPhone or iPad iCloud backup. If you sign in under <b>Account</b>, a copy is also
          kept in your account so your other devices stay up to date.
        </p>
      </section>
    </main>
  )
}
