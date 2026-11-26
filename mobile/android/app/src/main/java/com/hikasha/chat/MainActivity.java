package com.hikasha.chat;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);

        // The BotRix widget is a third-party iframe on the Capacitor local
        // origin. Android WebView drops third-party cookies by default, which
        // leaves the widget blank on devices where the session is cookie-gated.
        WebView webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null) {
            cookies.setAcceptThirdPartyCookies(webView, true);
        }

        // Android 15/16 force edge-to-edge for target 36. Inset the WebView
        // container once so the app's own top bar never hides under the status
        // bar, and keep the setup input above the keyboard. The bar areas use
        // the same dark brand color as the splash.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        View root = findViewById(android.R.id.content);
        if (root != null) {
            root.setBackgroundColor(Color.rgb(11, 15, 26));
            ViewCompat.setOnApplyWindowInsetsListener(root, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                );
                Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(root);
        }
    }
}
