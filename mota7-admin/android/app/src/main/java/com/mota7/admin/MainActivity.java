package com.mota7.admin;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        setTheme(com.mota7.admin.R.style.AppTheme_NoActionBar);
        registerPlugin(Mota7NotificationsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
