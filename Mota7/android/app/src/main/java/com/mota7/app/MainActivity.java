package com.mota7.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // بعد إظهار شاشة الإقلاع (windowBackground من AppTheme.NoActionBarLaunch)، انتقل لثيم التطبيق العادي
        setTheme(com.mota7.app.R.style.AppTheme_NoActionBar);
        registerPlugin(Mota7LocationPlugin.class);
        registerPlugin(Mota7NotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
