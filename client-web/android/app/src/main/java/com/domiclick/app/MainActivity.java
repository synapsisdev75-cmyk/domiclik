package com.domiclick.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import ee.forgr.capacitor.social.login.GoogleProvider;
import ee.forgr.capacitor.social.login.ModifiedMainActivityForSocialLoginPlugin;
import ee.forgr.capacitor.social.login.SocialLoginPlugin;

/** Required by @capgo/capacitor-social-login when requesting Google scopes. */
public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    registerPlugin(LiveLocatorPlugin.class);
    super.onCreate(savedInstanceState);
    // El contenido no debe dibujarse bajo la barra de estado / notch.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
      final View decor = getWindow().getDecorView();
      decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }
  }

  /** Con el localizador activo, el WebView no se pausa al bloquear la pantalla. */
  private void keepLocatorAlive() {
    if (!LiveLocatorService.running || getBridge() == null) return;
    WebView view = getBridge().getWebView();
    if (view == null) return;
    view.onResume();
    view.resumeTimers();
  }

  @Override
  public void onPause() {
    super.onPause();
    keepLocatorAlive();
  }

  @Override
  public void onStop() {
    super.onStop();
    keepLocatorAlive();
  }

  @Override
  public void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN
        && requestCode < GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
      PluginHandle pluginHandle = getBridge().getPlugin("SocialLogin");
      if (pluginHandle == null) {
        Log.i("Google Activity Result", "SocialLogin login handle is null");
        return;
      }
      Plugin plugin = pluginHandle.getInstance();
      if (!(plugin instanceof SocialLoginPlugin)) {
        Log.i("Google Activity Result", "SocialLogin plugin instance is not SocialLoginPlugin");
        return;
      }
      ((SocialLoginPlugin) plugin).handleGoogleLoginIntent(requestCode, data);
    }
  }

  // Required by the plugin; leave empty.
  @Override
  public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {}
}
