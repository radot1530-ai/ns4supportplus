package com.ns4.quiz;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

public class NS4WidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "ns4_widget_prefs";
    public static final String ACTION_ROTATE = "com.ns4.quiz.WIDGET_ROTATE";
    private static final long ROTATE_EVERY_MS = 10 * 60 * 1000L;   // la note change toutes les 10 min
    private static final int MAX_POOL = 30;

    // ---------- Données : réserve de notes consultées (vocab / fòmil / exam) ----------
    private static JSONArray readPool(SharedPreferences p) {
        try {
            String raw = p.getString("pool", null);
            if (raw != null) return new JSONArray(raw);
        } catch (Exception ignored) {}
        JSONArray pool = new JSONArray();
        // Migration de l'ancien format (1 note par catégorie)
        String[] cats = { "vocab", "fomil", "exam" };
        for (String c : cats) {
            String t = p.getString("note_" + c + "_title", null);
            if (t == null) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("c", c); o.put("t", t); o.put("x", p.getString("note_" + c + "_text", ""));
                pool.put(o);
            } catch (Exception ignored) {}
        }
        return pool;
    }

    // Appelé par le pont JS (AndroidWidget.saveNote) : la note qu'on vient de lire s'affiche aussitôt
    public static void addNote(Context ctx, String category, String title, String text) {
        if (title == null) return;
        SharedPreferences p = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        try {
            JSONArray old = readPool(p);
            JSONArray pool = new JSONArray();
            JSONObject n = new JSONObject();
            n.put("c", category); n.put("t", title); n.put("x", text == null ? "" : text);
            pool.put(n);
            for (int i = 0; i < old.length() && pool.length() < MAX_POOL; i++) {
                JSONObject o = old.getJSONObject(i);
                if (category.equals(o.optString("c")) && title.equals(o.optString("t"))) continue;
                pool.put(o);
            }
            p.edit().putString("pool", pool.toString()).putInt("idx", 0).apply();
        } catch (Exception ignored) {}
        refreshAll(ctx);
    }

    private static void rotate(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int size = readPool(p).length();
        if (size > 1) p.edit().putInt("idx", (p.getInt("idx", 0) + 1) % size).apply();
        refreshAll(ctx);
    }

    // ---------- Affichage ----------
    private static void updateOne(Context ctx, AppWidgetManager manager, int widgetId) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String tag = "💡 NS4 Support+", title = "Byenveni!";
        String text = "Louvri yon leson nan Vokabilè, Fòmil oswa Egzamen pou wè yon nòt isit la.";
        try {
            JSONArray pool = readPool(p);
            if (pool.length() > 0) {
                int idx = p.getInt("idx", 0) % pool.length();
                JSONObject o = pool.getJSONObject(idx);
                String c = o.optString("c");
                tag = "vocab".equals(c) ? "💡 Nòt Vokabilè" : "fomil".equals(c) ? "📐 Fòmil" : "📝 Egzamen";
                title = o.optString("t");
                text = o.optString("x");
            }
        } catch (Exception ignored) {}

        RemoteViews views = new RemoteViews(ctx.getPackageName(), R.layout.widget_ns4);
        views.setTextViewText(R.id.widget_tag, tag);
        views.setTextViewText(R.id.widget_title, title);
        views.setTextViewText(R.id.widget_text, text);

        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) launch = new Intent(ctx, MainActivity.class);
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent open = PendingIntent.getActivity(ctx, 0, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, open);

        manager.updateAppWidget(widgetId, views);
    }

    public static void refreshAll(Context ctx) {
        AppWidgetManager manager = AppWidgetManager.getInstance(ctx);
        int[] ids = manager.getAppWidgetIds(new ComponentName(ctx, NS4WidgetProvider.class));
        for (int id : ids) updateOne(ctx, manager, id);
    }

    // ---------- Rotation toutes les 10 min ----------
    private static PendingIntent rotatePending(Context ctx) {
        Intent i = new Intent(ctx, NS4WidgetProvider.class).setAction(ACTION_ROTATE);
        return PendingIntent.getBroadcast(ctx, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void scheduleRotation(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME,
            SystemClock.elapsedRealtime() + ROTATE_EVERY_MS, ROTATE_EVERY_MS, rotatePending(ctx));
    }

    public static void scheduleRotationIfNeeded(Context ctx) {
        int[] ids = AppWidgetManager.getInstance(ctx)
            .getAppWidgetIds(new ComponentName(ctx, NS4WidgetProvider.class));
        if (ids.length > 0) scheduleRotation(ctx);
    }

    @Override
    public void onEnabled(Context ctx) {
        scheduleRotation(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(rotatePending(ctx));
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) updateOne(ctx, manager, id);
        scheduleRotation(ctx);   // ré-arme l'alarme (après redémarrage du téléphone, par ex.)
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (intent != null && ACTION_ROTATE.equals(intent.getAction())) rotate(ctx);
    }
}