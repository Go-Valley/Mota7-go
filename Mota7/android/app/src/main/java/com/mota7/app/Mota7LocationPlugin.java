package com.mota7.app;

import android.Manifest;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * يطلب أذونات الموقع عبر مسار Capacitor العادي (Activity Result) بدون فحص "تفعيل GPS" أولاً.
 * بهذا يظهر التطبيق في إعدادات أندرويد ضمن التطبيقات المسموح لها بالموقع بعد أول طلب.
 * مكوّن @capacitor/geolocation يمنع طلب الأذونات إذا كان GPS مطفأ، فيبقى التطبيق غير مُدرَج.
 */
@CapacitorPlugin(
    name = "Mota7Location",
    permissions = {
        @Permission(
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION },
            alias = "locationAccess"
        )
    }
)
public class Mota7LocationPlugin extends Plugin {

    @PluginMethod
    public void requestLocationAccess(PluginCall call) {
        if (getPermissionState("locationAccess") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("locationAccess", call, "completeLocationAccessRequest");
    }

    @PermissionCallback
    private void completeLocationAccessRequest(PluginCall call) {
        if (getPermissionState("locationAccess") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            call.reject("Location permission denied");
        }
    }
}
