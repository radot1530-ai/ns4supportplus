package com.ns4.quiz;

android.appwidget.AppWidgetManager; android.content.ComponentName; android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.OnUserEarnedRewardListener;

public class MainActivity extends AppCompatActivity {

    WebView webView;
    AdView adView;
    RewardedAd rewardedAd;

    // ⚠️ Remplace par ton VRAI ID d'unité rewarded (différent de la bannière)
    // Pour l'instant on utilise ton ID de test/bannière — crée un ID "Rewarded" dans AdMob
    private static final String REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Initialize AdMob
        MobileAds.initialize(this, initializationStatus -> {});

        webView = findViewById(R.id.webview);
        adView = findViewById(R.id.adView);

        // Charge bannière
        AdRequest adRequest = new AdRequest.Builder().build();
        adView.loadAd(adRequest);

        // Précharge le rewarded ad
        loadRewardedAd();

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);

        // 🔵 Pont JavaScript ↔ Android
        webView.addJavascriptInterface(new AdBridge(), "AndroidAds");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    webView.loadUrl("file:///android_asset/offline.html");
                }
            }
        });

        // 🔵 Charge depuis GitHub Pages
        webView.loadUrl("https://radot1530-ai.github.io/ns4supportplus/");
    }

    private void loadRewardedAd() {
        AdRequest adRequest = new AdRequest.Builder().build();
        RewardedAd.load(this, REWARDED_AD_UNIT_ID, adRequest, new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(RewardedAd ad) {
                rewardedAd = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError adError) {
                rewardedAd = null;
            }
        });
    }

    // 🔵 Classe pont : JS ka rele fonksyon Java sa yo
    public class AdBridge {

        @JavascriptInterface
        public void showRewardedAd() {
            runOnUiThread(() -> {
                if (rewardedAd != null) {
                    rewardedAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdDismissedFullScreenContent() {
                            rewardedAd = null;
                            loadRewardedAd(); // précharge la prochaine
                        }
                    });

                    rewardedAd.show(MainActivity.this, new OnUserEarnedRewardListener() {
                        @Override
                        public void onUserEarnedReward(com.google.android.gms.ads.rewarded.RewardItem rewardItem) {
                            // 🔵 Appelle une fonction JS pour confirmer la récompense
                            webView.post(() -> {
                                webView.evaluateJavascript("onAdRewardEarned();", null);
                            });
                        }
                    });
                } else {
                    // Pub pas prête, informe le JS
                    webView.post(() -> {
                        webView.evaluateJavascript("onAdNotReady();", null);
                    });
                    loadRewardedAd();
                }
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (adView != null) adView.destroy();
        super.onDestroy();
    }
}

// 🔵 Ajoute cette classe interne, et enregistre-la comme les autres ponts
public class WidgetBridge {
    @JavascriptInterface
    public void saveNote(String category, String title, String text) {
        SharedPreferences prefs = getSharedPreferences(NS4WidgetProvider.PREFS_NAME, MODE_PRIVATE);
        prefs.edit()
            .putString("note_" + category + "_title", title)
            .putString("note_" + category + "_text", text)
            .apply();
        NS4WidgetProvider.refreshAll(MainActivity.this);
    }

    @JavascriptInterface
    public void requestPinWidget() {
        runOnUiThread(() -> {
            AppWidgetManager manager = AppWidgetManager.getInstance(MainActivity.this);
            if (android.os.Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported()) {
                ComponentName provider = new ComponentName(MainActivity.this, NS4WidgetProvider.class);
                manager.requestPinAppWidget(provider, null, null);
            } else {
                webView.evaluateJavascript(
                    "showToast('Kenbe dwèt sou ekran akèy la, chwazi Widgets, jwenn NS4 Support+')", null);
            }
        });
    }
}