import UIKit
import Capacitor

/**
 Mota7: تسجيل الإضافات المحلية (مكافئة لـ MainActivity على أندرويد).
 */
final class Mota7BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginType(Mota7NotificationsPlugin.self)
        bridge?.registerPluginType(Mota7LocationPlugin.self)
    }
}
