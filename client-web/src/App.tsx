import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatbotPlaceholder } from './components/ChatbotPlaceholder';
import { AuthProvider } from './lib/auth';
import { HomePage } from './pages/HomePage';
import { TrackingPage } from './pages/TrackingPage';
import { TransportistaPage } from './pages/TransportistaPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/seguimiento" element={<TrackingPage />} />
          <Route path="/seguimiento/:code" element={<TrackingPage />} />
          <Route path="/transportista" element={<TransportistaPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ChatbotPlaceholder />
      </BrowserRouter>
    </AuthProvider>
  );
}
