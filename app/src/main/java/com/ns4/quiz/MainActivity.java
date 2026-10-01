package com.ns4.quiz;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.AlphaAnimation;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.appopen.AppOpenAd;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

public class MainActivity extends AppCompatActivity {

    WebView webView;
    AdView adView;
    RewardedAd rewardedAd;
    InterstitialAd interstitialAd;

    // ---------- App Open ----------
    AppOpenAd appOpenAd;
    private long appOpenLoadTime = 0;
    private long lastAppOpenShown = 0;
    private boolean isShowingAppOpen = false;
    private boolean skipNextAppOpen = true;   // pas de pub au tout premier lancement
    private boolean wasInBackground = false;

    private ValueCallback<Uri[]> filePathCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private long lastBackPressTime = 0;

    // ---------- Splash screen natif ----------
    // 🔵 Le splash reste affiché PAR-DESSUS le WebView (qui charge en dessous dès le départ,
    // donc on ne perd aucune seconde) jusqu'à ce que la page finisse de charger : minimum
    // SPLASH_MIN_MS pour éviter un clignotement, maximum 6s de sécurité si la connexion est lente.
    private View splashOverlay;
    private long splashShownAt = 0;
    private static final long SPLASH_MIN_MS = 1200;
    private static final long SPLASH_MAX_MS = 6000;

    // ⚠️ IDs de TEST Google — remplace par tes vrais IDs une fois validé
    private static final String REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";
    private static final String INTERSTITIAL_AD_UNIT_ID = "ca-app-pub-3940256099942544/1033173712";
    private static final String APP_OPEN_AD_UNIT_ID = "ca-app-pub-3940256099942544/9257395921";

    private static final long APP_OPEN_MAX_AGE_MS = 4 * 60 * 60 * 1000L;  // une pub chargée reste valide 4 h
    private static final long APP_OPEN_COOLDOWN_MS = 3 * 60 * 1000L;      // minimum 3 min entre deux App Open
    private static final String PREFS_ADS = "ns4_ads_prefs";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);   // le WebView ci-dessous commence à charger tout de suite

        showSplashOverlay();   // 🔵 affiché PAR-DESSUS pendant le chargement — rien d'autre ne change

        MobileAds.initialize(this, initializationStatus -> {});

        webView = findViewById(R.id.webview);
        adView = findViewById(R.id.adView);

        AdRequest adRequest = new AdRequest.Builder().build();
        adView.loadAd(adRequest);

        loadRewardedAd();
        loadInterstitialAd();
        loadAppOpenAd();

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
                skipNextAppOpen = true;   // le retour du sélecteur de photo ne déclenche pas de pub
                fileChooserLauncher.launch(Intent.createChooser(intent, "Chwazi yon foto"));
                return true;
            }
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                hideSplashOverlay();   // 🔵 la page est prête : on enlève le splash
            }

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

    // ---------- Splash screen : affichage / masquage ----------
    private void showSplashOverlay() {
        splashOverlay = getLayoutInflater().inflate(R.layout.splash_screen, null);
        ViewGroup root = findViewById(android.R.id.content);
        root.addView(splashOverlay, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        TextView splashCreator = splashOverlay.findViewById(R.id.splashCreator);
        AlphaAnimation fadeIn = new AlphaAnimation(0.0f, 1.0f);
        fadeIn.setDuration(900);
        fadeIn.setStartOffset(300);
        fadeIn.setFillAfter(true);
        splashCreator.startAnimation(fadeIn);

        splashShownAt = System.currentTimeMillis();

        // Filet de sécurité : si la page met trop de temps (connexion lente/hors ligne),
        // on enlève quand même le splash pour ne jamais bloquer l'utilisateur dessus.
        new Handler(Looper.getMainLooper()).postDelayed(this::hideSplashOverlay, SPLASH_MAX_MS);
    }

    private void hideSplashOverlay() {
        if (splashOverlay == null) return;   // déjà caché (ou en train de l'être)
        final View v = splashOverlay;
        splashOverlay = null;   // empêche un double déclenchement (onPageFinished + filet de sécurité)

        long elapsed = System.currentTimeMillis() - splashShownAt;
        long remaining = Math.max(0, SPLASH_MIN_MS - elapsed);   // le splash reste au moins SPLASH_MIN_MS

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            v.animate().alpha(0f).setDuration(250).withEndAction(() -> {
                ViewGroup root = findViewById(android.R.id.content);
                root.removeView(v);
            }).start();
        }, remaining);
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

    // ---------- App Open : logique ----------
    // 🛡️ Statut PRO mémorisé côté natif (envoyé par la page via AndroidAds.setProStatus)
    private boolean isProUser() {
        return getSharedPreferences(PREFS_ADS, MODE_PRIVATE).getBoolean("is_pro", false);
    }

    private boolean isAppOpenAvailable() {
        return appOpenAd != null
            && (System.currentTimeMillis() - appOpenLoadTime) < APP_OPEN_MAX_AGE_MS;
    }

    private void loadAppOpenAd() {
        if (isProUser() || appOpenAd != null) return;   // PRO : on ne charge même pas la pub
        AppOpenAd.load(this, APP_OPEN_AD_UNIT_ID, new AdRequest.Builder().build(),
            new AppOpenAd.AppOpenAdLoadCallback() {
                @Override
                public void onAdLoaded(AppOpenAd ad) {
                    appOpenAd = ad;
                    appOpenLoadTime = System.currentTimeMillis();
                }

                @Override
                public void onAdFailedToLoad(LoadAdError error) {
                    appOpenAd = null;
                }
            });
    }

    private void showAppOpenIfAllowed() {
        if (isProUser()) return;                                                       // 🛡️ PRO protégé
        if (isShowingAppOpen) return;
        if (System.currentTimeMillis() - lastAppOpenShown < APP_OPEN_COOLDOWN_MS) return;
        if (!isAppOpenAvailable()) {
            appOpenAd = null;
            loadAppOpenAd();
            return;
        }

        appOpenAd.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdShowedFullScreenContent() {
                isShowingAppOpen = true;
            }

            @Override
            public void onAdDismissedFullScreenContent() {
                isShowingAppOpen = false;
                appOpenAd = null;
                lastAppOpenShown = System.currentTimeMillis();
                skipNextAppOpen = true;   // le retour de la pub ne doit pas en redéclencher une
                loadAppOpenAd();
            }

            @Override
            public void onAdFailedToShowFullScreenContent(AdError adError) {
                isShowingAppOpen = false;
                appOpenAd = null;
                loadAppOpenAd();
            }
        });
        appOpenAd.show(this);
    }

    @Override
    protected void onStop() {
        super.onStop();
        wasInBackground = true;
    }

    @Override
    protected void onStart() {
        super.onStart();
        if (wasInBackground) {
            wasInBackground = false;
            if (skipNextAppOpen) {
                // retour d'une pub rewarded/interstitielle, du sélecteur de photo ou du partage
                skipNextAppOpen = false;
            } else {
                showAppOpenIfAllowed();
            }
        } else {
            skipNextAppOpen = false;   // premier démarrage : pas de pub, les suivants oui
        }
    }

    // ---------- Pont : publicités (rewarded + interstitiel + bannière + statut PRO) ----------
    public class AdBridge {

        @JavascriptInterface
        public void showRewardedAd(String purpose) {
            runOnUiThread(() -> {
                if (rewardedAd != null) {
                    skipNextAppOpen = true;
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
                    skipNextAppOpen = true;
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

        // 🛡️ Appelé par la page web : true = utilisateur PRO actif (aucune pub App Open)
        @JavascriptInterface
        public void setProStatus(boolean isPro) {
            getSharedPreferences(PREFS_ADS, MODE_PRIVATE)
                .edit()
                .putBoolean("is_pro", isPro)
                .apply();
            runOnUiThread(() -> {
                if (isPro) {
                    appOpenAd = null;          // on jette toute pub déjà chargée
                } else {
                    loadAppOpenAd();
                }
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
                skipNextAppOpen = true;   // le retour du menu de partage ne déclenche pas de pub
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