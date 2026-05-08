import Capacitor
import UserNotifications

/**
 يطابق سلوك `Mota7NotificationsPlugin.java` على أندرويد: طلب إذن الإشعارات وفحص الحالة لـ JS.
 */
@objc(Mota7NotificationsPlugin)
public class Mota7NotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "Mota7NotificationsPlugin"
    public let jsName = "Mota7Notifications"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestNotificationAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getNotificationAccessState", returnType: CAPPluginReturnPromise)
    ]

    @objc func requestNotificationAccess(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject("Notification authorization failed", nil, error)
                    return
                }
                if granted {
                    call.resolve()
                } else {
                    call.reject("Notification permission denied")
                }
            }
        }
    }

    @objc func getNotificationAccessState(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                let granted: Bool
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    granted = true
                default:
                    granted = false
                }
                call.resolve(["granted": granted])
            }
        }
    }
}
