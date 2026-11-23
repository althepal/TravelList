import Foundation

@main
struct ReminderWindowTests {
    static func main() {
        precondition(ReminderWindow.shouldRemind(
            today: "2026-12-07", end: "2026-12-04", remindUntil: "2026-12-07",
            headingHome: false, hasItems: true
        ))
        precondition(!ReminderWindow.shouldRemind(
            today: "2026-12-08", end: "2026-12-04", remindUntil: "2026-12-07",
            headingHome: false, hasItems: true
        ))

        precondition(ReminderWindow.shouldRemind(
            today: "2026-12-02", end: "2026-12-04", remindUntil: "2026-12-07",
            headingHome: true, hasItems: true
        ))
        precondition(!ReminderWindow.shouldRemind(
            today: "2026-12-04", end: "2026-12-04", remindUntil: "2026-12-07",
            headingHome: false, hasItems: false
        ))
        print("Reminder window checks passed.")
    }
}
