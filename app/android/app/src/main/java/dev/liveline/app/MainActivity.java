package dev.liveline.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(UpdaterPlugin.class); // one-tap updates from GitHub Releases
        super.onCreate(savedInstanceState);
    }
}
