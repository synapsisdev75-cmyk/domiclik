package com.domiclick.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Puente del localizador. El servicio nativo sigue con la pantalla bloqueada. */
@CapacitorPlugin(name = "LiveLocator")
public class LiveLocatorPlugin extends Plugin {
  static LiveLocatorPlugin instance;

  @Override
  public void load() {
    instance = this;
  }

  static void emitFix(double lat, double lng, float accuracy, float speed, float heading) {
    LiveLocatorPlugin plugin = instance;
    if (plugin == null) return;
    JSObject data = new JSObject();
    data.put("lat", lat);
    data.put("lng", lng);
    data.put("accuracy", accuracy);
    data.put("speed", speed);
    data.put("heading", heading);
    plugin.notifyListeners("fix", data);
  }

  @PluginMethod
  public void start(PluginCall call) {
    LiveLocatorService.start(getContext());
    call.resolve();
  }

  @PluginMethod
  public void stop(PluginCall call) {
    LiveLocatorService.stop(getContext());
    call.resolve();
  }

  /** Pide a Android que no congele la app con el celular en reposo. */
  @PluginMethod
  public void requestUnrestricted(PluginCall call) {
    if (Build.VERSION.SDK_INT >= 23) {
      PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
      String pkg = getContext().getPackageName();
      if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + pkg));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
      }
    }
    call.resolve();
  }
}
