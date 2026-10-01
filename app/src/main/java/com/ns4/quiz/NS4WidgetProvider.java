package com.ns4.quiz;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class NS4WidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "ns4_widget_prefs";

    // 🔵 Les 3 catégories possibles, dans un ordre de repli si aucune n'a de date (1re install)
    private static final String[] CATEGORIES = { "vocab", "fomil", "exam" };

    static class NoteEntry {
        String category, tag, title, text;
        long ts;
        NoteEntry(String c, String t, String ti, String te, long ts) {
            category = c; tag = t; title = ti; text = te; this.ts = ts;
        }
    }

    private static final String[] TAGS = { "💡 Nòt Vokabilè", "📐 Fòmil", "📝 Egzamen" };

    // 🔵 CORRIGÉ : on affiche la note la PLUS RÉCEMMENT consultée (par horodatage),
    // pas une note au hasard — avant, saveNote() pouvait mettre à jour "vocab" et le
    // widget avait quand même une chance d'afficher un vieux "fomil", ce qui donnait
    // l'impression que le widget restait bloqué / ne suivait pas ce que l'élève lisait.
    private NoteEntry pickNote(SharedPreferences prefs) {
        NoteEntry best = null;
        for (int i = 0; i < CATEGORIES.length; i++) {
            String cat = CATEGORIES[i];
            String title = prefs.getString("note_" + cat + "_title", null);
            if (title == null) continue;
            long ts = prefs.getLong("note_" + cat + "_ts", 0);
            if (best == null || ts > best.ts) {
                best = new NoteEntry(cat, TAGS[i], title, prefs.getString("note_" + cat + "_text", ""), ts);
            }
        }
        if (best == null) {
            // Rien n'a encore été consulté dans l'app (1re install) : texte par défaut soigné
            return new NoteEntry("vocab", "💡 NS4 Support+", "Byenveni!",
                "Louvri yon leson pou wè yon nòt chak jou dirèkteman isit la.", 0);
        }
        return best;
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

    // Appelé par le pont JS (MainActivity.WidgetBridge.saveNote) pour forcer un rafraîchissement immédiat
    public static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName cn = new ComponentName(context, NS4WidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(cn);
        for (int id : ids) new NS4WidgetProvider().updateOne(context, manager, id);
    }
}