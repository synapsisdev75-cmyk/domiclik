import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import {
  completeGoogleRedirect,
  isActiveOpsAdmin,
  saveCustomerPhone,
  signInWithApple,
  signInWithGoogle,
  signOutCustomer,
  subscribeAuth,
  upsertCustomerProfile,
  userToProfile,
  type CustomerProfile,
} from './firebase';
import { opsTowerUrl } from './config';

type AuthContextValue = {
  user: User | null;
  profile: CustomerProfile | null;
  loading: boolean;
  error: string | null;
  /** Admin activo en Firestore: puede abrir la torre, pero NO se fuerza redirect (evita pantalla en blanco). */
  isOpsAdmin: boolean;
  opsUrl: string;
  signIn: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
  setPhone: (phone: string) => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpsAdmin, setIsOpsAdmin] = useState(false);

  useEffect(() => {
    void completeGoogleRedirect()
      .then((user) => {
        if (user) setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error al volver de Google');
      });
    const unsub = subscribeAuth(async (next) => {
      try {
        setUser(next);
        if (next) {
          const p = userToProfile(next);
          setProfile(p);
          const admin = await isActiveOpsAdmin(next.email);
          setIsOpsAdmin(admin);
          try {
            await upsertCustomerProfile(p);
          } catch (err) {
            console.warn('[auth] no se pudo guardar perfil cliente', err);
          }
        } else {
          setProfile(null);
          setIsOpsAdmin(false);
        }
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión';
      setError(message);
    }
  }, []);

  const signInApple = useCallback(async () => {
    setError(null);
    try {
      await signInWithApple();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al iniciar sesión con Apple';
      setError(message);
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    await signOutCustomer();
  }, []);

  const setPhone = useCallback(
    async (phone: string) => {
      if (!user) {
        saveCustomerPhone(phone);
        return;
      }
      saveCustomerPhone(phone, user.uid);
      const next = { ...userToProfile(user), phone };
      setProfile(next);
      await upsertCustomerProfile(next);
    },
    [user],
  );

  const opsUrl = `${opsTowerUrl()}?role=admin`;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      error,
      isOpsAdmin,
      opsUrl,
      signIn,
      signInApple,
      signOut,
      setPhone,
      clearError: () => setError(null),
    }),
    [user, profile, loading, error, isOpsAdmin, opsUrl, signIn, signInApple, signOut, setPhone],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
