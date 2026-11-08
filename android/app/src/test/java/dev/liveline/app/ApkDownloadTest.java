package dev.liveline.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/** The checksum check that decides whether a downloaded update is installed. Plain JVM, no Android. */
public class ApkDownloadTest {
    // SHA-256 of the five bytes "hello"
    private static final String HELLO = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private File apk() throws Exception {
        File f = tmp.newFile();
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write("hello".getBytes(StandardCharsets.UTF_8));
        }
        return f;
    }

    @Test
    public void matchingDigestPassesAndKeepsTheFile() throws Exception {
        File f = apk();
        assertTrue(ApkDownload.verify(f, HELLO));
        assertTrue(f.exists());
    }

    @Test
    public void uppercaseDigestPasses() throws Exception {
        assertTrue(ApkDownload.verify(apk(), HELLO.toUpperCase(java.util.Locale.ROOT)));
    }

    @Test
    public void surroundingWhitespaceIsIgnored() throws Exception {
        assertTrue(ApkDownload.verify(apk(), "  " + HELLO + "\n"));
    }

    @Test
    public void wrongDigestFailsAndDeletesTheFile() throws Exception {
        File f = apk();
        String wrong = HELLO.substring(0, 63) + "5";
        assertFalse(ApkDownload.verify(f, wrong));
        assertFalse(f.exists());
    }

    @Test
    public void missingOrMalformedChecksumFailsAndDeletesTheFile() throws Exception {
        String[] bad = {
            null,
            "",
            "   ",
            HELLO.substring(0, 63), // one short
            HELLO + "0", // one long
            "g" + HELLO.substring(1), // not hex
            HELLO.substring(0, 32) + " " + HELLO.substring(32),
        };
        for (String want : bad) {
            File f = apk();
            assertFalse("accepted " + want, ApkDownload.verify(f, want));
            assertFalse("kept the file for " + want, f.exists());
        }
    }

    @Test
    public void parseShaReadsSha256sumOutput() {
        assertEquals(HELLO, ApkDownload.parseSha(HELLO + "  LiveLine-v1.2.3.apk\n"));
        assertEquals(HELLO, ApkDownload.parseSha("\n" + HELLO + "\n"));
        assertEquals(HELLO, ApkDownload.parseSha(HELLO));
    }

    @Test
    public void parseShaGivesNullForNothing() {
        assertNull(ApkDownload.parseSha(null));
        assertNull(ApkDownload.parseSha(""));
        assertNull(ApkDownload.parseSha("  \n"));
    }
}
