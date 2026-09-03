import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatbotPlaceholder } from './components/ChatbotPlaceholder';
import { BottomNav } from './components/BottomNav';
import { AuthProvider } from './lib/auth';
import { HomePage } from './pages/HomePage';
import { TrackingPage } from './pages/TrackingPage';
import { TransportistaPage } from './pages/TransportistaPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Padding inferior en móvil para que el contenido no quede bajo el BottomNav */}
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
      </BrowserRouter>
    </AuthProvider>
  );
}
