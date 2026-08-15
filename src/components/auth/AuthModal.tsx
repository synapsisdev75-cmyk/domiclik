import React, { useState } from 'react';
import { auth, LOGIN_ROLE_KEY } from '../../lib/firebase';
import { startGoogleSignInRedirect, describeAuthError } from '../../lib/googleAuth';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { X, Lock, Mail, ShieldCheck, Bike, Sparkles, UserCheck } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: (email: string, role: 'admin' | 'driver') => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'driver'>('admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        const res = await createUserWithEmailAndPassword(auth, email, password);
        if (res.user.email) onAuthenticated(res.user.email, role);
      } else {
        const res = await signInWithEmailAndPassword(auth, email, password);
        if (res.user.email) onAuthenticated(res.user.email, role);
      }
      onClose();
    } catch (err: any) {
      const code = err?.code || '';
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password'
          ? 'Correo o contraseña incorrectos.'
          : 'No se pudo autenticar con Firebase.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    sessionStorage.setItem(LOGIN_ROLE_KEY, role);
    try {
      await startGoogleSignInRedirect();
    } catch (err: unknown) {
      setLoading(false);
      setError(describeAuthError(err));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f1115]/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#161920] border border-[#2d3139] rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-[#11141a] hover:bg-[#2d3139] text-slate-400 hover:text-white transition border border-[#2d3139]"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-emerald-400 p-0.5 mx-auto mb-3">
            <div className="w-full h-full bg-[#11141a] rounded-[14px] flex items-center justify-center text-xl">
              🛵
            </div>
          </div>
          <h3 className="text-xl font-bold text-white">
            {isRegister ? 'Crear Cuenta en DomiClick' : 'Acceso Restringido DomiClick'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Plataforma de Logística y Transporte en Villavicencio
          </p>
        </div>

        {/* Role Selection */}
        <div className="grid grid-cols-2 gap-2 bg-[#11141a] p-1.5 rounded-2xl border border-[#2d3139] mb-4 text-xs font-bold">
          <button
            type="button"
            onClick={() => setRole('admin')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              role === 'admin'
                ? 'bg-[#f59e0b] text-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Administrador</span>
          </button>

          <button
            type="button"
            onClick={() => setRole('driver')}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 ${
              role === 'driver'
                ? 'bg-emerald-500 text-black shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>Motorizado</span>
          </button>
        </div>

        {/* Google Sign-In */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-[#11141a] hover:bg-[#1a1d23] text-white font-bold py-3 px-4 rounded-xl text-xs border border-[#2d3139] transition flex items-center justify-center gap-2 mb-4"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Ingresar con Google</span>
        </button>

        <div className="relative text-center my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#2d3139]" />
          </div>
          <span className="relative bg-[#161920] px-3 text-[10px] text-slate-500 uppercase font-bold">
            o con correo
          </span>
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleEmailAuth} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Correo Electrónico</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@domiclick.com"
              className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#11141a] border border-[#2d3139] rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-[#f59e0b]"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#f59e0b] hover:bg-[#d98206] text-black font-extrabold py-3 px-4 rounded-xl text-xs transition shadow-lg shadow-amber-500/20"
          >
            {isRegister ? 'Registrar Cuenta' : 'Iniciar Sesión'}
          </button>
        </form>

        <div className="text-center mt-4 pt-3 border-t border-[#2d3139] text-[11px]">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-slate-400 hover:text-[#f59e0b] font-medium"
          >
            {isRegister ? '¿Ya tienes cuenta? Inicia Sesión' : '¿No tienes cuenta? Regístrate aquí'}
          </button>
        </div>
      </div>
    </div>
  );
};
