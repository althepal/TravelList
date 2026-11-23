import Foundation

enum ReminderWindow {
    static func shouldRemind(
        today: String,
        end: String,
        remindUntil: String,
        headingHome: Bool,
        hasItems: Bool
    ) -> Bool {
        (headingHome || today >= end) && today <= remindUntil && hasItems
    }
}
