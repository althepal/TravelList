import Foundation

enum ReminderWindow {
    static func shouldRemind(
        today: String,
        end: String,
        remindUntil: String?,
        headingHome: Bool,
        hasItems: Bool
    ) -> Bool {
        let cutoff = remindUntil ?? legacyCutoff(for: end)
        return (headingHome || today >= end) && today <= cutoff && hasItems
    }

    private static func legacyCutoff(for end: String) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        guard
            let endDate = formatter.date(from: end),
            let cutoff = Calendar.current.date(byAdding: .day, value: 3, to: endDate)
        else { return end }
        return formatter.string(from: cutoff)
    }
}
