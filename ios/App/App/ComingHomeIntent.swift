import AppIntents
import Foundation
import UserNotifications

// The Shortcuts action behind the car-Bluetooth automation. It reads
// Documents/coming-home.json, which the web app rewrites on every save
// (comingHomeSnapshot in src/model.js), so all list logic stays in JS.
struct CheckComingHomeIntent: AppIntent {
    static var title: LocalizedStringResource = "Check Coming Home"
    static var description = IntentDescription(
        "If a trip is on its last day or you tapped Heading Home, shows a notification with the Coming Home items still unchecked. Otherwise does nothing."
    )
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let items = ComingHomeSnapshot.dueItems()
        guard !items.isEmpty else { return .result(value: "") }

        let content = UNMutableNotificationContent()
        content.title = "Coming home"
        content.body = items.joined(separator: "\n")
        content.sound = .default
        let request = UNNotificationRequest(identifier: "coming-home-car", content: content, trigger: nil)
        try await UNUserNotificationCenter.current().add(request)
        return .result(value: content.body)
    }
}

struct TravelListShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: CheckComingHomeIntent(),
            phrases: ["Check coming home in \(.applicationName)"],
            shortTitle: "Check Coming Home",
            systemImageName: "car"
        )
    }
}

enum ComingHomeSnapshot {
    struct Trip: Decodable {
        let name: String
        let end: String // yyyy-MM-dd, local calendar day
        let remindUntil: String?
        let headingHome: Bool
        let items: [String]
    }
    struct File: Decodable { let trips: [Trip] }

    static func dueItems(now: Date = Date()) -> [String] {
        guard
            let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
            let data = try? Data(contentsOf: dir.appendingPathComponent("coming-home.json")),
            let file = try? JSONDecoder().decode(File.self, from: data)
        else { return [] }

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        let today = formatter.string(from: now)

        // This Shortcut reminder uses a three-day post-trip cutoff; the app's
        // Coming Home state remains active until the trip is ended.
        // Apply the cutoff even for snapshots written by an older app.
        let due = file.trips.filter { trip in
            ReminderWindow.shouldRemind(
                today: today,
                end: trip.end,
                remindUntil: trip.remindUntil,
                headingHome: trip.headingHome,
                hasItems: !trip.items.isEmpty
            )
        }
        if due.count == 1 { return due[0].items }
        return due.flatMap { trip in trip.items.map { "\(trip.name): \($0)" } }
    }
}
