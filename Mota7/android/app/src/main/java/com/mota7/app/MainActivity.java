package com.mota7.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
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
        splashContainer.setBackgroundColor(Color.parseColor("#FFE1C0"));
        splashContainer.setAlpha(1f);
        splashContainer.setClickable(true);

        final ImageView logo = new ImageView(this);
        final float density = getResources().getDisplayMetrics().density;
        final int logoSize = Math.round(density * 200f);
        final FrameLayout.LayoutParams logoParams = new FrameLayout.LayoutParams(logoSize, logoSize);
        logoParams.gravity = Gravity.CENTER;
        logo.setLayoutParams(logoParams);
        logo.setImageResource(R.drawable.splash_logo);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setAdjustViewBounds(true);

        splashContainer.addView(logo);
        root.addView(splashContainer);

        splashContainer.postDelayed(() -> splashContainer.animate()
            .alpha(0f)
            .setDuration(400)
            .withEndAction(() -> {
                splashContainer.setVisibility(View.GONE);
                root.removeView(splashContainer);
            })
            .start(), 900);
    }
}
