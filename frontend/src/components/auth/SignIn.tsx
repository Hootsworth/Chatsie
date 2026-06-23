import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Button, Input, Card } from '../ui';
import { KeyRound, Mail, LogIn } from 'lucide-react';

export const SignIn: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { signIn, signInWithGoogle, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  // Clear errors when leaving page
  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password) {
      setFormError('Please fill in all fields.');
      return;
    }

    try {
      await signIn(email, password);
      navigate('/'); // Go to dashboard
    } catch (err: any) {
      // Handled by store error
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      // Handled by store error
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center space-x-2">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-primary fill-current">
              <path d="M12,2 C12.5,7.5 16.5,11.5 22,12 C16.5,12.5 12.5,16.5 12,22 C11.5,16.5 7.5,12.5 2,12 C7.5,11.5 11.5,7.5 12,2 Z" />
            </svg>
            <span className="font-serif text-2xl font-normal tracking-tight text-ink">
              VMeet
            </span>
          </div>
          <h2 className="mt-4 text-3xl font-serif text-ink tracking-tight text-center">
            Welcome back
          </h2>
          <p className="text-sm text-muted mt-1.5 text-center">
            Production-quality peer connections, instantly.
          </p>
        </div>

        <Card className="p-6 md:p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error || formError ? (
              <div className="p-3.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg border border-red-200">
                {formError || error}
              </div>
            ) : null}

            <div className="relative">
              <Mail className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
              <Input
                label="Email Address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-canvas border-hairline"
                disabled={isLoading}
              />
            </div>

            <div className="relative">
              <KeyRound className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-canvas border-hairline"
                disabled={isLoading}
              />
            </div>

            <div className="flex items-center justify-end text-xs font-semibold">
              <Link
                to="/forgot-password"
                className="text-primary hover:text-primary-active transition-colors"
              >
                Forgot Password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full h-10 rounded-md"
              isLoading={isLoading}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          </form>

          <div className="relative flex py-4 items-center">
            <div className="flex-grow border-t border-hairline"></div>
            <span className="flex-shrink mx-4 text-xs font-semibold text-muted-soft uppercase tracking-widest">
              or
            </span>
            <div className="flex-grow border-t border-hairline"></div>
          </div>

          <Button
            variant="secondary"
            onClick={handleGoogleSignIn}
            className="w-full h-10 rounded-md text-xs"
            disabled={isLoading}
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </Button>

          <p className="text-center text-xs text-muted mt-6 font-semibold">
            Don't have an account?{' '}
            <Link
              to="/signup"
              className="text-primary hover:text-primary-active transition-colors underline"
            >
              Sign Up
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
};
