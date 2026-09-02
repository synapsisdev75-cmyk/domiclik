import React, { useEffect, useRef, useState } from 'react';
import { MapWallSettings } from '../../types';
import {
  saveMapWallSettings,
  subscribeMapWallSettings,
  uploadMapWallVideo,
} from '../../lib/firebase';
import { DEFAULT_MAP_WALL_SETTINGS } from '../../lib/mapWall';
import { Film, Upload, RotateCcw, Loader2 } from 'lucide-react';

export function MapWallVideoPanel() {
  const [settings, setSettings] = useState<MapWallSettings>(DEFAULT_MAP_WALL_SETTINGS);
  const [uploading, setUploading] = useState<'a' | 'b' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);

  useEffect(() => subscribeMapWallSettings(setSettings), []);

  const handleUpload = async (slot: 'a' | 'b', file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setMessage('Solo archivos de video (MP4, WebM…).');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setMessage('Máximo 50 MB por video.');
      return;
    }
    setUploading(slot);
    setMessage(null);
    try {
      await uploadMapWallVideo(file, slot);
      setMessage(`Video ${slot.toUpperCase()} subido. La pantalla secundaria lo usará al instante.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo subir el video.');
    } finally {
      setUploading(null);
    }
  };

  const resetDefaults = async () => {
    setUploading('a');
    try {
      await saveMapWallSettings({
        videoAUrl: DEFAULT_MAP_WALL_SETTINGS.videoAUrl,
        videoBUrl: DEFAULT_MAP_WALL_SETTINGS.videoBUrl,
        videoALabel: DEFAULT_MAP_WALL_SETTINGS.videoALabel,
        videoBLabel: DEFAULT_MAP_WALL_SETTINGS.videoBLabel,
        mapDurationMs: DEFAULT_MAP_WALL_SETTINGS.mapDurationMs,
      });
      setMessage('Videos restaurados a los predeterminados.');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="glass-panel rounded-2xl border border-[#1A2D52] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Film className="w-4 h-4 text-[#00E5FF]" />
            Videos pantalla secundaria
          </h3>
          <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
            Secuencia: <span className="text-[#00E5FF]">Video A</span> (completo) → mapa →{' '}
            <span className="text-[#FF5722]">Video B</span> (completo) → mapa → repite.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void resetDefaults()}
          disabled={uploading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#1A2D52] text-[10px] font-bold text-slate-400 hover:text-white"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restaurar defaults
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(['a', 'b'] as const).map((slot) => {
          const url = slot === 'a' ? settings.videoAUrl : settings.videoBUrl;
          const label = slot === 'a' ? settings.videoALabel : settings.videoBLabel;
          const hint = slot === 'a' ? '~6 s · primero' : '~8 s · segundo';
          return (
            <div
              key={slot}
              className="rounded-xl border border-[#182B4D] bg-[#0A1122]/80 p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-white uppercase tracking-wider">
                  Video {slot.toUpperCase()}
                </span>
                <span className="text-[10px] text-slate-500">{hint}</span>
              </div>
              <p className="text-[10px] text-slate-400 truncate" title={url}>
                {label || url}
              </p>
              <video
                src={url}
                className="w-full h-24 object-cover rounded-lg bg-black border border-[#1A2D52]"
                muted
                playsInline
                preload="metadata"
              />
              <input
                ref={slot === 'a' ? inputARef : inputBRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(e) => {
                  void handleUpload(slot, e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={uploading !== null}
                onClick={() => (slot === 'a' ? inputARef : inputBRef).current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#FF5722]/15 border border-[#FF5722]/40 text-[#FF5722] text-xs font-bold hover:bg-[#FF5722]/25 disabled:opacity-50"
              >
                {uploading === slot ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Subir video {slot.toUpperCase()}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[11px] text-slate-400 font-tech">
          Mapa entre videos (segundos)
          <input
            type="number"
            min={3}
            max={60}
            value={Math.round(settings.mapDurationMs / 1000)}
            onChange={(e) => {
              const sec = Number(e.target.value);
              if (sec >= 3) {
                void saveMapWallSettings({ mapDurationMs: sec * 1000 });
              }
            }}
            className="ml-2 w-16 px-2 py-1 rounded-lg bg-[#070B16] border border-[#1A2D52] text-white text-xs"
          />
        </label>
      </div>

      {message && (
        <p className="text-[11px] text-slate-300 bg-[#070B16] border border-[#1A2D52] rounded-xl px-3 py-2">
          {message}
        </p>
      )}
    </div>
  );
}
