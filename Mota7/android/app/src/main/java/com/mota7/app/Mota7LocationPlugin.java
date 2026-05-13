package com.mota7.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.JSObject;
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

    @PluginMethod
    public void pickLocationOnNativeMap(PluginCall call) {
        double lat = call.getDouble("lat", 0.0d);
        double lng = call.getDouble("lng", 0.0d);
        String title = call.getString("title", "اختر الموقع");

        Intent intent = new Intent(getContext(), NativeMapPickerActivity.class);
        intent.putExtra(NativeMapPickerActivity.EXTRA_LAT, lat);
        intent.putExtra(NativeMapPickerActivity.EXTRA_LNG, lng);
        intent.putExtra(NativeMapPickerActivity.EXTRA_TITLE, title);
        startActivityForResult(call, intent, "onNativeMapPicked");
    }

    @ActivityCallback
    private void onNativeMapPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null) {
            call.reject("No result from map picker");
            return;
        }

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.reject("Map picker cancelled");
            return;
        }

        double lat = data.getDoubleExtra(NativeMapPickerActivity.RESULT_LAT, 0.0d);
        double lng = data.getDoubleExtra(NativeMapPickerActivity.RESULT_LNG, 0.0d);
        String address = data.getStringExtra(NativeMapPickerActivity.RESULT_ADDRESS);

        JSObject out = new JSObject();
        out.put("lat", lat);
        out.put("lng", lng);
        if (address != null) {
            out.put("address", address);
        }
        call.resolve(out);
    }
}
