import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CookieBanner } from './components/CookieBanner';
import { ChatbotPlaceholder } from './components/ChatbotPlaceholder';
import { BottomNav } from './components/BottomNav';
import { AppBottomNav } from './components/AppBottomNav';
import { AuthProvider } from './lib/auth';
import { hasSeenWelcome, isNativeApp } from './lib/appNav';
import { AppHomePage } from './pages/AppHomePage';
import { AppTrackingPage } from './pages/AppTrackingPage';
import { HelpPage } from './pages/HelpPage';
import { HomePage } from './pages/HomePage';
import { NotificationsPage } from './pages/NotificationsPage';
import { OrdersPage } from './pages/OrdersPage';
import { ProfilePage } from './pages/ProfilePage';
import { SolicitarPage } from './pages/SolicitarPage';
import { TrackingPage } from './pages/TrackingPage';
import { TransportistaPage } from './pages/TransportistaPage';
import { WelcomePage } from './pages/WelcomePage';

const NATIVE = isNativeApp();

function WelcomeRedirect({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (NATIVE && !hasSeenWelcome() && location.pathname !== '/welcome') {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

/** UI original para PC / navegador. */
function WebShell() {
  return (
    <div className="domi-web">
      <div className="pb-16 sm:pb-0">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/seguimiento" element={<TrackingPage />} />
          <Route path="/seguimiento/:code" element={<TrackingPage />} />
          <Route path="/transportista" element={<TransportistaPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <BottomNav />
      <ChatbotPlaceholder />
      <CookieBanner />
    </div>
  );
}

/** Rediseño solo en la app nativa (APK). */
function NativeShell() {
  const location = useLocation();
  const hideChrome = location.pathname === '/welcome';

  return (
    <WelcomeRedirect>
      <div className={hideChrome ? '' : 'pb-28'}>
        <Routes>
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/" element={<AppHomePage />} />
          <Route path="/solicitar" element={<SolicitarPage />} />
          <Route path="/seguimiento" element={<AppTrackingPage />} />
          <Route path="/seguimiento/:code" element={<AppTrackingPage />} />
          <Route path="/pedidos" element={<OrdersPage />} />
          <Route path="/transportista" element={<TransportistaPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
          <Route path="/ayuda" element={<HelpPage />} />
          <Route path="/notificaciones" element={<NotificationsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!hideChrome ? <AppBottomNav /> : null}
      {!hideChrome ? <ChatbotPlaceholder /> : null}
    </WelcomeRedirect>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>{NATIVE ? <NativeShell /> : <WebShell />}</BrowserRouter>
    </AuthProvider>
  );
}
