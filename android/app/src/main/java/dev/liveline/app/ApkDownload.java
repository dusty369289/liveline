package dev.liveline.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Fetching an update for UpdaterPlugin: the release APK (with progress), its published SHA-256, and the checksum check
 * that decides whether the download is installed. Plain Java with no Android or Capacitor state, so the plugin keeps
 * only the install itself, and the check runs in the JVM unit tests (android/app/src/test, run by the Checks job).
 * Runs on the plugin's download thread, never the main one.
 */
final class ApkDownload {
    /** Bigger than any LiveLine APK by far: a bigger download is not ours, so it's stopped. */
    static final long MAX_BYTES = 200L * 1024 * 1024;
    /** How often progress is reported, so the page isn't flooded with events. */
    private static final long NOTE_EVERY_MS = 200;
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");

    interface Progress {
        /** fraction 0..1, or -1 when the size isn't known */
        void at(double fraction);
    }

    private ApkDownload() {}

    /** Downloads url to dir/update.apk and returns the file. */
    static File fetch(File dir, String url, Progress progress) throws Exception {
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("Couldn't make room for the download.");
        File out = new File(dir, "update.apk");
        HttpURLConnection c = open(url);
        long total = c.getContentLengthLong();
        if (total > MAX_BYTES) throw new Exception("The download is unexpectedly large, so it was stopped.");
        long done = 0;
        long lastNote = 0;
        try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                os.write(buf, 0, n);
                done += n;
                if (done > MAX_BYTES) throw new Exception("The download is unexpectedly large, so it was stopped.");
                long now = System.currentTimeMillis();
                if (now - lastNote > NOTE_EVERY_MS) {
                    lastNote = now;
                    progress.at(total > 0 ? (double) done / total : -1);
                }
            }
        } finally {
            c.disconnect();
        }
        return out;
    }

    /** The checksum published beside the APK, or null if it's empty. */
    static String readSha(String url) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream()) {
            byte[] b = new byte[512];
            int n = in.read(b);
            return parseSha(n > 0 ? new String(b, 0, n, "UTF-8") : null);
        } finally {
            c.disconnect();
        }
    }

    /** The digest from a .sha256 file in sha256sum's format ("<hex>  <name>"), or null if it's empty. */
    static String parseSha(String body) {
        if (body == null) return null;
        String s = body.trim();
        if (s.isEmpty()) return null;
        return s.split("\\s+")[0];
    }

    /**
     * True only if `want` is a SHA-256 (64 hex characters, either case) and the file's digest matches it. Anything
     * else deletes the file, so an unchecked APK is never left where it could be installed.
     */
    static boolean verify(File apk, String want) throws Exception {
        String w = want == null ? "" : want.trim().toLowerCase(Locale.ROOT);
        if (SHA256.matcher(w).matches() && sha256(apk).equals(w)) return true;
        apk.delete();
        return false;
    }

    static String sha256(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        StringBuilder sb = new StringBuilder();
        for (byte b : md.digest()) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setInstanceFollowRedirects(true); // GitHub sends asset downloads to its storage host
        c.setConnectTimeout(15_000);
        c.setReadTimeout(30_000);
        c.setRequestProperty("Accept", "application/octet-stream");
        if (c.getResponseCode() != 200) throw new Exception("GitHub answered " + c.getResponseCode() + " for the download.");
        return c;
    }
}
