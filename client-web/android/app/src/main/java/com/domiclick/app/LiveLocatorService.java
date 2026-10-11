package com.domiclick.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * GPS de alta precisión con servicio en primer plano.
 * Sigue marcando cada tramo aunque la pantalla esté bloqueada.
 */
public class LiveLocatorService extends Service {
  static volatile boolean running = false;
  private static final int NOTIFICATION_ID = 4101;
  private static final String CHANNEL_ID = "domiclick_locator";

  private FusedLocationProviderClient client;
  private LocationCallback callback;
  private PowerManager.WakeLock wakeLock;

  static void start(Context context) {
    Intent intent = new Intent(context, LiveLocatorService.class);
    ContextCompat.startForegroundService(context, intent);
  }

  static void stop(Context context) {
    context.stopService(new Intent(context, LiveLocatorService.class));
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    Notification notification = buildNotification("Buscando GPS preciso…");
    if (Build.VERSION.SDK_INT >= 29) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
    } else {
      startForeground(NOTIFICATION_ID, notification);
    }
    running = true;
    acquireWakeLock();
    requestUpdates();
    return START_STICKY;
  }

  @Override
  public void onDestroy() {
    running = false;
    if (client != null && callback != null) {
      client.removeLocationUpdates(callback);
    }
    if (wakeLock != null && wakeLock.isHeld()) {
      wakeLock.release();
    }
    super.onDestroy();
  }

  private void acquireWakeLock() {
    PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
    if (pm == null) return;
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "domiclick:locator");
    wakeLock.setReferenceCounted(false);
    wakeLock.acquire(8L * 60L * 60L * 1000L);
  }

  @SuppressLint("MissingPermission")
  private void requestUpdates() {
    if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION)
        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      stopSelf();
      return;
    }
    client = LocationServices.getFusedLocationProviderClient(this);
    LocationRequest request =
        new LocationRequest.Builder(1000L)
            .setMinUpdateIntervalMillis(1000L)
            .setMaxUpdateDelayMillis(2000L)
            .setMinUpdateDistanceMeters(0f)
            .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
            .setWaitForAccurateLocation(false)
            .build();
    callback =
        new LocationCallback() {
          @Override
          public void onLocationResult(LocationResult result) {
            if (result == null || result.getLastLocation() == null) return;
            android.location.Location loc = result.getLastLocation();
            float speed = loc.hasSpeed() ? loc.getSpeed() : -1f;
            float heading = loc.hasBearing() ? loc.getBearing() : 0f;
            boolean moving = speed >= 0.8f;
            String state = speed < 0f ? "Ubicación precisa" : moving ? "En movimiento" : "Detenido";
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
              nm.notify(NOTIFICATION_ID, buildNotification(state));
            }
            LiveLocatorPlugin.emitFix(loc.getLatitude(), loc.getLongitude(), loc.getAccuracy(), speed, heading);
          }
        };
    client.requestLocationUpdates(request, callback, Looper.getMainLooper());
  }

  private Notification buildNotification(String state) {
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26 && nm != null) {
      NotificationChannel channel =
          new NotificationChannel(CHANNEL_ID, "Ubicación en vivo", NotificationManager.IMPORTANCE_LOW);
      channel.setDescription("La torre ve tu posición aunque el celular esté bloqueado.");
      nm.createNotificationChannel(channel);
    }
    return new NotificationCompat.Builder(this, CHANNEL_ID)
        .setContentTitle("DomiClick · localizador")
        .setContentText(state + " · la torre te sigue en vivo")
        .setSmallIcon(android.R.drawable.ic_menu_mylocation)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .build();
  }
}
