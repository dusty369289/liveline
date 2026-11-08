package dev.liveline.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * After an in-app update: "LiveLine updated to 0.6.2. Tap to open it again." Android stops an app to replace it and,
 * since Android 10, won't let it bring itself back to the front, so a notification the user taps is the only way back
 * in one step. Android sends MY_PACKAGE_REPLACED to the new version just after it's installed; this posts the notice
 * only for the update UpdaterPlugin started (it notes the version first, expect()), and only with the permission
 * Android 13+ asks for (UpdaterPlugin asks it when Update is tapped). Without it, nothing: the installing step already
 * says to open LiveLine again from the home screen.
 */
public class UpdatedNotice extends BroadcastReceiver {
    private static final String PREFS = "liveline.updater";
    private static final String EXPECTED = "expected"; // the version being installed, until it arrives
    private static final String CHANNEL = "updates";
    private static final int ID = 1;

    /** Before installing: note the version, so the notice names only an update this app started. */
    static void expect(Context ctx, String version) {
        prefs(ctx).edit().putString(EXPECTED, version).apply();
    }

    /** Announce when the update this app started is the version now installed. Pure, for UpdatedNoticeTest. */
    static boolean shouldAnnounce(String expected, String installed) {
        return expected != null && !expected.isEmpty() && expected.equals(installed);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        SharedPreferences p = prefs(ctx);
        String expected = p.getString(EXPECTED, null);
        p.edit().remove(EXPECTED).apply(); // said once, whatever happens next
        String installed = versionName(ctx);
        if (!shouldAnnounce(expected, installed)) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Updates", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("When LiveLine has updated itself, a tap to open it again");
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) return;
        PendingIntent tap = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder n = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_liveline)
            .setContentTitle("LiveLine updated to " + installed)
            .setContentText("Tap to open it again.")
            .setContentIntent(tap)
            .setAutoCancel(true);
        NotificationManagerCompat.from(ctx).notify(ID, n.build());
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String versionName(Context ctx) {
        try {
            return ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }
}
