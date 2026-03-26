package com.mota7.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // مطلوب مع Theme.SplashScreen + postSplashScreenTheme في styles.xml — يضبط انتقال الإقلاع على Android 12+
        SplashScreen.installSplashScreen(this);
        registerPlugin(Mota7LocationPlugin.class);
        registerPlugin(Mota7NotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        // ثيم التطبيق العادي يُطبَّق من BridgeActivity (setTheme AppTheme_NoActionBar) بعد الإقلاع
    }
}
