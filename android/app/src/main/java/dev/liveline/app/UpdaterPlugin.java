package dev.liveline.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.core.content.IntentCompat;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.Lifecycle;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * One-tap update: download the release APK, check its SHA-256 (both in ApkDownload), and install it over this version
 * with PackageInstaller.
 * Android still decides: the first time it asks the user to allow LiveLine to install apps (we open that screen and
 * carry on when they come back), and it shows its own "Update this app?" dialog unless it lets us skip it (Android 12+,
 * when this app installed the version being replaced). Android also refuses any APK not signed with the same key.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {
    private static final String ACTION = "dev.liveline.app.INSTALL_STATUS";
    private PluginCall waitingForPermission;
    private PluginCall installing;
    private BroadcastReceiver receiver;
    // Android's "Update this app?" dialog, kept until the install ends. Android blocks starting it while LiveLine is in
    // the background, and it would then never appear, leaving "installing" up until a restart: so it's started only
    // while LiveLine is on screen, or when the user comes back (onScreen). If the user closes it, the page keeps Update
    // tappable (updates.ts): the new install() call takes over, the old one ends with REPLACED, and the dialog reopens.
    private volatile Intent pendingConfirm; // set on the main thread, read by install() on the plugin's thread
    private boolean confirmShown; // main thread only
    // Not handleOnResume: Capacitor calls that from inside Activity.onResume, before AndroidX moves the lifecycle to
    // RESUMED, so showConfirm would still see STARTED and do nothing. ON_RESUME is dispatched once it is RESUMED.
    private final DefaultLifecycleObserver onScreen = new DefaultLifecycleObserver() {
        @Override
        public void onResume(@NonNull LifecycleOwner owner) {
            showConfirm(); // a confirm dialog Android wouldn't let us show while in the background
        }
    };

    @Override
    public void load() {
        getActivity().runOnUiThread(() -> getActivity().getLifecycle().addObserver(onScreen)); // observers: main thread only
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) {
            call.reject("No download link for the update.", "BAD_URL");
            return;
        }
        synchronized (this) {
            if (installing != null && pendingConfirm != null) {
                // waiting on Android's dialog (closed, or never shown): this call takes over, and the dialog reopens
                PluginCall old = installing;
                call.setKeepAlive(true);
                installing = call;
                old.setKeepAlive(false);
                old.reject("Carried on by a newer tap on Update.", "REPLACED");
                getActivity().runOnUiThread(() -> {
                    confirmShown = false;
                    showConfirm();
                });
                return;
            }
            if (installing != null) {
                call.reject("An update is already being installed.", "BUSY");
                return;
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            // one-time system switch; handleOnResume carries on if the user turns it on
            call.setKeepAlive(true);
            waitingForPermission = call;
            JSObject ev = new JSObject();
            ev.put("stage", "permission");
            notifyListeners("progress", ev);
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            return;
        }
        start(call);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        PluginCall call = waitingForPermission;
        if (call == null) return;
        waitingForPermission = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.setKeepAlive(false);
            call.reject("LiveLine isn't allowed to install updates. Turn on \"Allow from this source\" and tap Update again.", "NO_PERMISSION");
            return;
        }
        start(call);
    }

    /** Start Android's confirm dialog if one is waiting and not yet shown, and LiveLine is on screen. Main thread only. */
    private void showConfirm() {
        Intent confirm = pendingConfirm;
        if (confirm == null || confirmShown) return;
        if (!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) return;
        try {
            getActivity().startActivity(confirm);
            confirmShown = true;
        } catch (RuntimeException e) {
            finish(false, "Android couldn't show its update dialog. Try again.", "FAILED");
        }
    }

    private void start(PluginCall call) {
        call.setKeepAlive(true);
        synchronized (this) {
            installing = call;
        }
        new Thread(() -> {
            try {
                File apk = ApkDownload.fetch(updatesDir(), call.getString("url"), (f) -> progress("downloading", f));
                String want = call.getString("sha256");
                if (want == null || want.isEmpty()) {
                    String shaUrl = call.getString("sha256Url");
                    if (shaUrl != null && shaUrl.startsWith("https://")) want = ApkDownload.readSha(shaUrl);
                }
                if (want == null || want.isEmpty()) throw new Exception("The release has no checksum, so it wasn't installed.");
                String got = ApkDownload.sha256(apk);
                if (!got.equalsIgnoreCase(want.trim())) {
                    apk.delete();
                    throw new Exception("The download didn't match its checksum, so it wasn't installed. Try again.");
                }
                progress("installing", 1.0);
                commit(apk);
            } catch (Exception e) {
                finish(false, e.getMessage() != null ? e.getMessage() : "The update failed.", "FAILED");
            }
        }, "liveline-update").start();
    }

    private File updatesDir() {
        return new File(getContext().getCacheDir(), "updates");
    }

    private void commit(File apk) throws Exception {
        Context ctx = getContext();
        PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(ctx.getPackageName());
        params.setSize(apk.length());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // skip Android's confirmation when it allows it (we installed the version being replaced)
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = pi.createSession(params);
        try (PackageInstaller.Session s = pi.openSession(id)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = s.openWrite("liveline.apk", 0, apk.length())) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out);
            } catch (Exception e) {
                // a half-written session would sit in Android's installer (and its storage) until it expires
                s.abandon();
                throw e;
            }
            listen();
            Intent i = new Intent(ACTION).setPackage(ctx.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
            s.commit(PendingIntent.getBroadcast(ctx, id, i, flags).getIntentSender());
        }
    }

    private void listen() {
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context c, Intent intent) {
                int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
                if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
                    Intent confirm = IntentCompat.getParcelableExtra(intent, Intent.EXTRA_INTENT, Intent.class);
                    if (confirm != null) {
                        progress("confirm", 1.0);
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        pendingConfirm = confirm;
                        confirmShown = false;
                        showConfirm(); // receivers run on the main thread
                    }
                    return;
                }
                // on success Android replaces this app and restarts it, so this is mostly seen on failure
                if (status == PackageInstaller.STATUS_SUCCESS) finish(true, "Updated.", null);
                else if (status == PackageInstaller.STATUS_FAILURE_ABORTED) finish(false, "The update was cancelled.", "CANCELLED");
                else if (status == PackageInstaller.STATUS_FAILURE_CONFLICT || status == PackageInstaller.STATUS_FAILURE_INCOMPATIBLE) {
                    finish(false, "Android wouldn't install it over this copy, which was signed differently (a test build?). "
                        + "Uninstall LiveLine and install the release from GitHub once.", "CONFLICT");
                } else if (status == PackageInstaller.STATUS_FAILURE_STORAGE) finish(false, "Not enough storage to install the update.", "STORAGE");
                else {
                    String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
                    finish(false, "Android couldn't install the update" + (msg != null ? " (" + msg + ")" : "") + ".", "FAILED");
                }
            }
        };
        ContextCompat.registerReceiver(getContext(), receiver, new IntentFilter(ACTION), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private void progress(String stage, double fraction) {
        JSObject ev = new JSObject();
        ev.put("stage", stage);
        ev.put("fraction", fraction);
        notifyListeners("progress", ev);
    }

    private synchronized void finish(boolean ok, String message, String code) {
        PluginCall call = installing;
        installing = null;
        pendingConfirm = null;
        // the APK is in the installer's session (or failed): no need to keep a copy in the cache
        new File(updatesDir(), "update.apk").delete();
        if (call == null) return;
        call.setKeepAlive(false);
        if (ok) {
            JSObject r = new JSObject();
            r.put("message", message);
            call.resolve(r);
        } else {
            call.reject(message, code);
        }
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().getLifecycle().removeObserver(onScreen); // a destroyed activity's lifecycle drops it anyway
        if (receiver != null) {
            try {
                getContext().unregisterReceiver(receiver);
            } catch (IllegalArgumentException ignored) {
                // already gone
            }
            receiver = null;
        }
        super.handleOnDestroy();
    }
}
