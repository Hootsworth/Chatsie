import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { SignIn } from './components/auth/SignIn';
import { SignUp } from './components/auth/SignUp';
import { ForgotPassword } from './components/auth/ForgotPassword';
import { ResetPassword } from './components/auth/ResetPassword';
import { Dashboard } from './components/dashboard/Dashboard';
import { MeetingRoom } from './components/meeting/MeetingRoom';
import { Card, Button } from './components/ui';
import { AlertTriangle, Home } from 'lucide-react';

// ----------------------------------------------------
// PROTECTED ROUTE WRAPPER
// ----------------------------------------------------
interface ProtectedRouteProps {
  children: React.ReactElement;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-950 text-gray-500 transition-colors duration-200">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-brand-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-bold tracking-wide">Authenticating...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return children;
};

// ----------------------------------------------------
// KICKED PAGE COMPONENT
// ----------------------------------------------------
const KickedPage: React.FC = () => {
  const navigate = useNavigateHelper();
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-dark-950 px-4 transition-colors duration-200">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto border border-red-100 dark:border-red-900/40 shadow-lg shadow-red-500/5 mb-6">
          <AlertTriangle className="w-8 h-8" />
        </div>

        <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight">
          Removed from Meeting
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-xs mx-auto">
          The host has removed you from this meeting room session.
        </p>

        <Card className="p-6 mt-6">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400">
            If you believe this was an error, please contact the host for a new link or passcode.
          </p>
          <div className="mt-6 pt-4 border-t border-gray-150 dark:border-dark-800">
            <Button onClick={navigate} className="w-full">
              <Home className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

// Simple hook to navigation outside route contexts
function useNavigateHelper() {
  const navigate = React.useCallback(() => {
    window.location.href = '/';
  }, []);
  return navigate;
}

// ----------------------------------------------------
// MAIN APP ROUTING COMPONENT
// ----------------------------------------------------
export const App: React.FC = () => {
  const initializeAuth = useAuthStore((state) => state.initialize);

  // Initialize Auth state on mount
  useEffect(() => {
    initializeAuth();

    // Initialize theme from local storage
    const isDark = document.documentElement.classList.contains('dark') || 
                   localStorage.getItem('theme') === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [initializeAuth]);

  return (
    <Router>
      <Routes>
        {/* Auth routes */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/kicked" element={<KickedPage />} />

        {/* Protected Dashboard */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Protected Video Meeting Room */}
        <Route
          path="/room/:code"
          element={
            <ProtectedRoute>
              <MeetingRoom />
            </ProtectedRoute>
          }
        />

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;
