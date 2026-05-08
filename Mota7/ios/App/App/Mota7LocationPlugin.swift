import Capacitor
import CoreLocation

/**
 يطابق `Mota7LocationPlugin.java`: طلب أذونة الموقع عندما يكون في حالة `.notDetermined`.
 */
@objc(Mota7LocationPlugin)
public class Mota7LocationPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "Mota7LocationPlugin"
    public let jsName = "Mota7Location"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestLocationAccess", returnType: CAPPluginReturnPromise)
    ]

    private var locationManager: CLLocationManager?
    private var pendingCall: CAPPluginCall?

    @objc func requestLocationAccess(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let manager = CLLocationManager()
            self.locationManager = manager
            manager.delegate = self

            switch manager.authorizationStatus {
            case .authorizedAlways, .authorizedWhenInUse:
                call.resolve()
            case .notDetermined:
                self.pendingCall = call
                manager.requestWhenInUseAuthorization()
            case .denied, .restricted:
                call.reject("Location permission denied")
            @unknown default:
                call.reject("Location permission unknown")
            }
        }
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        guard let call = pendingCall else { return }
        switch status {
        case .authorizedAlways, .authorizedWhenInUse:
            pendingCall = nil
            call.resolve()
        case .denied, .restricted:
            pendingCall = nil
            call.reject("Location permission denied")
        case .notDetermined:
            break
        @unknown default:
            break
        }
    }

    @available(iOS 14.0, *)
    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        locationManager(manager, didChangeAuthorization: manager.authorizationStatus)
    }
}
