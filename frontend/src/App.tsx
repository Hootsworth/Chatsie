import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, SignIn, SignUp } from '@clerk/clerk-react';
import { Dashboard } from './components/dashboard/Dashboard';
import { MeetingRoom } from './components/meeting/MeetingRoom';
import { Card, Button } from './components/ui';
import { AlertTriangle, Home } from 'lucide-react';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key. Please set VITE_CLERK_PUBLISHABLE_KEY in your .env.local file");
}

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
    window.location.href = import.meta.env.BASE_URL;
  }, []);
  return navigate;
}

const ClerkWithRoutes = () => {
  const navigate = useNavigate();
  return (
    <ClerkProvider 
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      <Routes>
        {/* Auth routes using Clerk Components */}
        <Route 
          path="/signin/*" 
          element={
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-950">
              <SignIn routing="virtual" signUpUrl="/Chatsie/signup" fallbackRedirectUrl="/Chatsie/" />
            </div>
          } 
        />
        <Route 
          path="/signup/*" 
          element={
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-950">
              <SignUp routing="virtual" signInUrl="/Chatsie/signin" fallbackRedirectUrl="/Chatsie/" />
            </div>
          } 
        />
        <Route path="/kicked" element={<KickedPage />} />

        {/* Protected Dashboard */}
        <Route
          path="/"
          element={
            <>
              <SignedIn>
                <Dashboard />
              </SignedIn>
              <SignedOut>
                <Navigate to="/signin" replace />
              </SignedOut>
            </>
          }
        />

        {/* Video Meeting Room (Public / Guest Allowed) */}
        <Route path="/room/:code" element={<MeetingRoom />} />

        {/* Fallback redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ClerkProvider>
  );
};

// ----------------------------------------------------
// MAIN APP ROUTING COMPONENT
// ----------------------------------------------------
export const App: React.FC = () => {
  useEffect(() => {
    // Initialize theme from local storage
    const isDark = document.documentElement.classList.contains('dark') || 
                   localStorage.getItem('theme') === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <Router basename={import.meta.env.BASE_URL}>
      <ClerkWithRoutes />
    </Router>
  );
};

export default App;
