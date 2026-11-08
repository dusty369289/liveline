package dev.liveline.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * The checksum check that decides whether a downloaded update is installed. Pure Java (no Android), so it runs in
 * the JVM unit tests (android/app/src/test, run by the Checks job). UpdaterPlugin does the downloading.
 */
final class ApkDownload {
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");

    private ApkDownload() {}

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
}
