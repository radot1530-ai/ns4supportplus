package com.ns4.quiz;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

public class MainActivity extends AppCompatActivity {

    WebView webView;
    AdView adView;
    RewardedAd rewardedAd;
    InterstitialAd interstitialAd;

    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private long lastBackPressTime = 0;

    // ⚠️ IDs de TEST Google — remplace par tes vrais IDs une fois validé
    private static final String REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";
    private static final String INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-3940256099942544/1033173712";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        MobileAds.initialize(this, initializationStatus -> {});

        webView = findViewById(R.id.webview);
        adView = findViewById(R.id.adView);

        AdRequest adRequest = new AdRequest.Builder().build();
        adView.loadAd(adRequest);

        loadRewardedAd();
        loadInterstitialAd();

        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);
        webSettings.setLoadWithOverviewMode(true);
        webSettings.setUseWideViewPort(true);

        // 🔵 Ponts JavaScript ↔ Android
        webView.addJavascriptInterface(new AdBridge(), "AndroidAds");
        webView.addJavascriptInterface(new WidgetBridge(), "AndroidWidget");
        webView.addJavascriptInterface(new ShareBridge(), "AndroidShare");

        // 🔵 Sélecteur de fichiers natif (photo de profil, etc.)
        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (filePathCallback == null) return;
                Uri[] results = null;
                if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                    Uri data = result.getData().getData();
                    if (data != null) results = new Uri[]{data};
                }
                filePathCallback.onReceiveValue(results);
                filePathCallback = null;
            }
        );

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                                              FileChooserParams fileChooserParams) {
                filePathCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("image/*");
                fileChooserLauncher.launch(Intent.createChooser(intent, "Chwazi yon foto"));
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    webView.loadUrl("file:///android_asset/offline.html");
                }
            }
        });

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

    private void loadInterstitialAd() {
        AdRequest adRequest = new AdRequest.Builder().build();
        InterstitialAd.load(this, INTERSTITIAL_AD_UNIT_ID, adRequest, new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(InterstitialAd ad) {
                interstitialAd = ad;
            }

            @Override
            public void onAdFailedToLoad(LoadAdError loadAdError) {
                interstitialAd = null;
            }
        });
    }

    // ---------- Pont : publicités (rewarded + interstitiel + bannière) ----------
    public class AdBridge {

        @JavascriptInterface
        public void showRewardedAd(String purpose) {
            runOnUiThread(() -> {
                if (rewardedAd != null) {
                    rewardedAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdDismissedFullScreenContent() {
                            rewardedAd = null;
                            loadRewardedAd();
                        }
                    });
                    rewardedAd.show(MainActivity.this, rewardItem ->
                        webView.post(() -> webView.evaluateJavascript(
                            "if(window.onAdRewardEarned) onAdRewardEarned('" + purpose + "');", null))
                    );
                } else {
                    webView.post(() -> webView.evaluateJavascript(
                        "if(window.onAdNotReady) onAdNotReady('" + purpose + "');", null));
                    loadRewardedAd();
                }
            });
        }

        @JavascriptInterface
        public void showInterstitial() {
            runOnUiThread(() -> {
                if (interstitialAd != null) {
                    interstitialAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdDismissedFullScreenContent() {
                            interstitialAd = null;
                            loadInterstitialAd();
                            webView.post(() -> webView.evaluateJavascript(
                                "if(window.onInterstitialClosed) onInterstitialClosed();", null));
                        }
                    });
                    interstitialAd.show(MainActivity.this);
                } else {
                    loadInterstitialAd();
                    webView.post(() -> webView.evaluateJavascript(
                        "if(window.onInterstitialClosed) onInterstitialClosed();", null));
                }
            });
        }

        @JavascriptInterface
        public void setBannerVisible(boolean visible) {
            runOnUiThread(() -> {
                if (adView != null) adView.setVisibility(visible ? View.VISIBLE : View.GONE);
            });
        }
    }

    // ---------- Pont : widget écran d'accueil ----------
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
                if (Build.VERSION.SDK_INT >= 26 && manager.isRequestPinAppWidgetSupported()) {
                    ComponentName provider = new ComponentName(MainActivity.this, NS4WidgetProvider.class);
                    manager.requestPinAppWidget(provider, null, null);
                } else {
                    webView.evaluateJavascript(
                        "if(window.showToast) showToast('Kenbe dwèt sou ekran akèy la, chwazi Widgets, jwenn NS4 Support+');", null);
                }
            });
        }
    }

    // ---------- Pont : partage natif Android (menyi konplè apps) ----------
    public class ShareBridge {
        @JavascriptInterface
        public void shareText(String title, String text, String url) {
            runOnUiThread(() -> {
                Intent sendIntent = new Intent(Intent.ACTION_SEND);
                sendIntent.setType("text/plain");
                sendIntent.putExtra(Intent.EXTRA_SUBJECT, title);
                sendIntent.putExtra(Intent.EXTRA_TEXT, text + "\n" + url);
                Intent chooser = Intent.createChooser(sendIntent, "Pataje NS4 Support+");
                startActivity(chooser);
            });
        }
    }

    // ---------- Bouton retour : toujours vers home.html, double-appui pour quitter ----------
    @Override
    public void onBackPressed() {
        webView.evaluateJavascript(
            "(function(){ try { if (typeof window.onAndroidBackPressed === 'function') { return window.onAndroidBackPressed() ? 'true' : 'false'; } } catch(e){} return 'false'; })();",
            value -> {
                boolean handledByPage = "true".equals(value);
                if (!handledByPage) {
                    runOnUiThread(this::handleNativeBack);
                }
            }
        );
    }

    private void handleNativeBack() {
        String url = webView.getUrl();
        boolean isHome = url != null && (url.endsWith("home.html") || url.endsWith("ns4supportplus/") || url.endsWith("index.html"));

        if (isHome) {
            long now = System.currentTimeMillis();
            if (now - lastBackPressTime < 2000) {
                finish();
            } else {
                lastBackPressTime = now;
                Toast.makeText(this, "Peze retou ankò pou kite app la", Toast.LENGTH_SHORT).show();
            }
        } else {
            webView.loadUrl("https://radot1530-ai.github.io/ns4supportplus/home.html");
        }
    }

    @Override
    protected void onDestroy() {
        if (adView != null) adView.destroy();
        super.onDestroy();
    }
}