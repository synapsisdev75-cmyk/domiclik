import React, { useEffect, useState } from 'react';
import { SecretariatFile, StaffRole } from '../../types';
import {
  deleteSecretariatFile,
  subscribeSecretariatFiles,
  uploadSecretariatFile,
} from '../../lib/firebase';
import { canStaffWrite } from '../../lib/staffAccess';
import { Download, FileUp, FolderOpen, Trash2, Upload } from 'lucide-react';

interface Props {
  currentEmail: string;
  staffRole: StaffRole;
}

const CATEGORIES = ['Informe', 'Acta', 'Soporte', 'Nómina', 'Operaciones', 'General'];

function formatBytes(n?: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const SecretariatPanel: React.FC<Props> = ({ currentEmail, staffRole }) => {
  const [files, setFiles] = useState<SecretariatFile[]>([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Informe');
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const canDelete = canStaffWrite(staffRole);

  useEffect(() => subscribeSecretariatFiles(setFiles), []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) {
      setError('Selecciona un archivo para subir.');
      return;
    }
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await uploadSecretariatFile({
        title,
        category,
        file: picked,
        uploadedBy: currentEmail,
        uploadedByRole: staffRole,
      });
      setTitle('');
      setPicked(null);
      setInfo('Informe subido correctamente.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (file: SecretariatFile) => {
    if (!canDelete) return;
    if (!window.confirm(`¿Eliminar «${file.title}»?`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteSecretariatFile(file.id, file.storagePath);
      setInfo('Archivo eliminado.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#0A1020] border border-[#2B6CFF]/30 rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#2B6CFF]/15 flex items-center justify-center shrink-0">
            <FileUp className="w-5 h-5 text-[#7aa2ff]" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white">Subir informe</h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Documentos de secretaría visibles para todo el personal de torre. Solo lectura en
              operaciones; aquí puedes anexar y descargar informes.
            </p>
          </div>
        </div>

        <form onSubmit={handleUpload} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[11px] text-slate-400 space-y-1 sm:col-span-2">
            Título del documento
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Informe semanal de entregas"
              required
              className="w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2.5 text-xs text-white"
            />
          </label>
          <label className="text-[11px] text-slate-400 space-y-1">
            Categoría
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#070B16] border border-[#1a2744] rounded-xl px-3 py-2.5 text-xs text-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-slate-400 space-y-1">
            Archivo (PDF, Excel, Word, imagen…)
            <input
              type="file"
              onChange={(e) => setPicked(e.target.files?.[0] || null)}
              className="w-full text-[11px] text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-[#1a2744] file:text-white file:text-[11px] file:font-bold"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={busy || !title.trim() || !picked}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2B6CFF] text-white text-xs font-black disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              {busy ? 'Subiendo…' : 'Subir informe'}
            </button>
          </div>
        </form>
        {error && <p className="text-[12px] text-red-400">{error}</p>}
        {info && <p className="text-[12px] text-emerald-400">{info}</p>}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-black text-slate-400 font-tech uppercase flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5" /> Archivos ({files.length})
        </h3>
        {files.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-[#1a2744] bg-[#0A1020]/50">
            <p className="font-bold text-white mb-1">Sin informes aún</p>
            <p className="text-xs text-slate-400">Los documentos subidos aparecerán aquí para descarga.</p>
          </div>
        ) : (
          files.map((file) => (
            <div
              key={file.id}
              className="bg-[#0A1020] border border-[#162748] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{file.title}</div>
                <div className="text-[10px] text-slate-400 font-tech mt-0.5">
                  {file.category} · {file.fileName} · {formatBytes(file.sizeBytes)} ·{' '}
                  {new Date(file.createdAt).toLocaleString('es-CO')}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  Subido por {file.uploadedBy}
                  {file.uploadedByRole === 'secretary' ? ' (secretaría)' : ' (admin)'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={file.fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#2B6CFF]/20 border border-[#2B6CFF]/40 text-[#7aa2ff] text-[10px] font-black hover:bg-[#2B6CFF]/30"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar
                </a>
                {canDelete && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleDelete(file)}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-red-500/40 text-red-300 text-[10px] font-bold hover:bg-red-950/30 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
