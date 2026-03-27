package com.mota7.app;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
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

        final ViewGroup root = findViewById(android.R.id.content);
        if (root == null) {
            return;
        }

        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );

        final FrameLayout splashContainer = new FrameLayout(this);
        splashContainer.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        splashContainer.setAlpha(1f);
        splashContainer.setClickable(true);

        final ImageView splashBg = new ImageView(this);
        splashBg.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));
        splashBg.setScaleType(ImageView.ScaleType.CENTER_CROP);
        splashBg.setImageResource(R.drawable.splash_bg);

        final ImageView logo = new ImageView(this);
        final int logoSize = Math.round(getResources().getDisplayMetrics().density * 140f);
        final FrameLayout.LayoutParams logoParams = new FrameLayout.LayoutParams(logoSize, logoSize);
        logoParams.gravity = android.view.Gravity.CENTER;
        logo.setLayoutParams(logoParams);
        logo.setImageResource(R.drawable.splash_logo);
        logo.setAlpha(0f);
        logo.setScaleX(0.8f);
        logo.setScaleY(0.8f);

        splashContainer.addView(splashBg);
        splashContainer.addView(logo);
        root.addView(splashContainer);

        logo.animate()
            .alpha(1f)
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(600)
            .start();

        splashContainer.postDelayed(() -> splashContainer.animate()
            .alpha(0f)
            .setDuration(500)
            .withEndAction(() -> {
                splashContainer.setVisibility(View.GONE);
                root.removeView(splashContainer);
            })
            .start(), 1400);
    }
}
