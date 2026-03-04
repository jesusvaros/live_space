package com.livespace.app;

import android.net.Uri;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  private static final String MAIN_ROUTE_PATH = "/tabs/events";

  private boolean isAtMainRoute() {
    if (bridge == null || bridge.getWebView() == null) {
      return false;
    }

    final String currentUrl = bridge.getWebView().getUrl();
    if (currentUrl == null || currentUrl.isEmpty()) {
      return false;
    }

    final Uri uri = Uri.parse(currentUrl);
    final String path = uri.getPath();
    if (path == null || path.isEmpty()) {
      return false;
    }

    return MAIN_ROUTE_PATH.equals(path)
      || (path.endsWith(MAIN_ROUTE_PATH))
      || (path.endsWith(MAIN_ROUTE_PATH + "/"));
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    getOnBackPressedDispatcher().addCallback(
      this,
      new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
          if (isAtMainRoute()) {
            finish();
            return;
          }

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
