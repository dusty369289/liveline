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

/**
 * Fetching an update for UpdaterPlugin: the release APK (with progress), its published SHA-256, and the APK's own
 * SHA-256 to compare. Plain Java with no Android or Capacitor state, so the plugin keeps only the install itself.
 * Runs on the plugin's download thread, never the main one.
 */
final class ApkDownload {
    /** Bigger than any LiveLine APK by far: a bigger download is not ours, so it's stopped. */
    static final long MAX_BYTES = 200L * 1024 * 1024;
    /** How often progress is reported, so the page isn't flooded with events. */
    private static final long NOTE_EVERY_MS = 200;

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

    /** The checksum published beside the APK (sha256sum format: "<hex>  <name>"). */
    static String readSha(String url) throws Exception {
        HttpURLConnection c = open(url);
        try (InputStream in = c.getInputStream()) {
            byte[] b = new byte[512];
            int n = in.read(b);
            String s = n > 0 ? new String(b, 0, n, "UTF-8").trim() : "";
            return s.split("\\s+")[0];
        } finally {
            c.disconnect();
        }
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
