package com.mota7.admin;

import android.Manifest;
import android.os.Build;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * طلب إذن إظهار الإشعارات (Android 13+ / API 33+).
 */
@CapacitorPlugin(
    name = "Mota7Notifications",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notificationAccess")
    }
)
public class Mota7NotificationsPlugin extends Plugin {

    @PluginMethod
    public void requestNotificationAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve();
            return;
        }
        if (getPermissionState("notificationAccess") == PermissionState.GRANTED) {
            call.resolve();
            return;
        }
        requestPermissionForAlias("notificationAccess", call, "completeNotificationAccessRequest");
    }

    @PluginMethod
    public void getNotificationAccessState(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        boolean granted = getPermissionState("notificationAccess") == PermissionState.GRANTED;
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PermissionCallback
    private void completeNotificationAccessRequest(PluginCall call) {
        if (getPermissionState("notificationAccess") == PermissionState.GRANTED) {
            call.resolve();
        } else {
            call.reject("Notification permission denied");
        }
    }
}
