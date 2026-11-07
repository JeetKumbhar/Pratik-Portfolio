import AppRoutes from './routes/AppRoutes';
import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <AppRoutes />
      </SettingsProvider>
    </AuthProvider>
  );
}
