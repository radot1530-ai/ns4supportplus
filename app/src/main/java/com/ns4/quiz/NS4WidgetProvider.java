package com.ns4.quiz;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

public class NS4WidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "ns4_widget_prefs";

    static class NoteEntry {
        String category, tag, title, text;
        NoteEntry(String c, String t, String ti, String te) { category = c; tag = t; title = ti; text = te; }
    }

    private NoteEntry pickNote(SharedPreferences prefs) {
        List<NoteEntry> candidates = new ArrayList<>();

        String vTitle = prefs.getString("note_vocab_title", null);
        if (vTitle != null) candidates.add(new NoteEntry("vocab", "💡 Nòt Vokabilè", vTitle, prefs.getString("note_vocab_text", "")));

        String fTitle = prefs.getString("note_fomil_title", null);
        if (fTitle != null) candidates.add(new NoteEntry("fomil", "📐 Fòmil", fTitle, prefs.getString("note_fomil_text", "")));

        String eTitle = prefs.getString("note_exam_title", null);
        if (eTitle != null) candidates.add(new NoteEntry("exam", "📝 Egzamen", eTitle, prefs.getString("note_exam_text", "")));

        if (candidates.isEmpty()) {
            return new NoteEntry("vocab", "💡 NS4 Support+", "Louvri app la", "Kòmanse aprann jodi a!");
        }
        return candidates.get(new Random().nextInt(candidates.size()));
    }

    private void updateOne(Context context, AppWidgetManager manager, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        NoteEntry note = pickNote(prefs);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_ns4);
        views.setTextViewText(R.id.widget_tag, note.tag);
        views.setTextViewText(R.id.widget_title, note.title);
        views.setTextViewText(R.id.widget_text, note.text);

        Intent intent = new Intent(context, MainActivity.class);
        intent.putExtra("open_category", note.category);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context, widgetId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pending);

        manager.updateAppWidget(widgetId, views);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int id : widgetIds) updateOne(context, manager, id);
    }

    // Appelé par le pont JS pour forcer un rafraîchissement immédiat
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, NS4WidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(cn);
        for (int id : ids) new NS4WidgetProvider().updateOne(context, manager, id);
    }
}