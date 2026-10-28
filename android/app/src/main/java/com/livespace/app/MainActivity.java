package com.livespace.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.livespace.app.gallery.GalleryScanPlugin;
import com.livespace.app.media.LiveSpaceMediaPlugin;
import com.livespace.app.ocr.TextScanPlugin;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Local plugins must be registered before the bridge starts.
    registerPlugin(GalleryScanPlugin.class);
    registerPlugin(LiveSpaceMediaPlugin.class);
    registerPlugin(TextScanPlugin.class);
    super.onCreate(savedInstanceState);

    getOnBackPressedDispatcher().addCallback(
      this,
      new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
          // The web app decides: close a sheet, go back a page, or exit
          // from home (src/app/AppBackHandler.tsx).
          if (bridge != null) {
            bridge.triggerJSEvent("backbutton", "document");
            return;
          }
          finish();
        }
      }
    );
  }
}
