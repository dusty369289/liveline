package dev.liveline.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** When the notice after an update is posted: only for the update this app started, once it has arrived. */
public class UpdatedNoticeTest {
    @Test
    public void announcesTheUpdateThisAppStarted() {
        assertTrue(UpdatedNotice.shouldAnnounce("0.6.2", "0.6.2"));
    }

    @Test
    public void staysQuietWithNoUpdateStartedHere() {
        // installed from GitHub by hand, or by Android itself: nothing of ours to say
        assertFalse(UpdatedNotice.shouldAnnounce(null, "0.6.2"));
        assertFalse(UpdatedNotice.shouldAnnounce("", "0.6.2"));
    }

    @Test
    public void staysQuietWhenAnotherVersionArrived() {
        // we started 0.6.2 but something else replaced the app: don't claim our update happened
        assertFalse(UpdatedNotice.shouldAnnounce("0.6.2", "0.6.1"));
        assertFalse(UpdatedNotice.shouldAnnounce("0.6.2", null));
    }
}
