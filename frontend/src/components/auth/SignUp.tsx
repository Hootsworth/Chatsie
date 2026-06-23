import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Button, Input, Card } from '../ui';
import { User, Mail, KeyRound, UserCheck, UserPlus } from 'lucide-react';

export const SignUp: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const { signUp, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password || !username || !fullName) {
      setFormError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }

    try {
      await signUp(email, password, username, fullName);
      setIsSuccess(true);
      // Wait a few seconds then navigate to login, or let them click a button
      setTimeout(() => {
        navigate('/signin');
      }, 4000);
    } catch (err) {
      // Handled by store error
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Header */}
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
            Create account
          </h2>
          <p className="text-sm text-muted mt-1.5 text-center">
            Join VMeet and host high-fidelity video meetings.
          </p>
        </div>

        <Card className="p-6 md:p-8">
          {isSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <UserCheck className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-ink">Registration Successful!</h3>
              <p className="text-sm text-muted">
                Please check your inbox to confirm your email. Redirecting you to sign in...
              </p>
              <Link to="/signin" className="inline-block">
                <Button variant="secondary" size="sm">Go to Sign In</Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error || formError ? (
                <div className="p-3.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg border border-red-200">
                  {formError || error}
                </div>
              ) : null}

              <div className="relative">
                <User className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
                <Input
                  label="Full Name"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="pl-10 bg-canvas border-hairline"
                  disabled={isLoading}
                />
              </div>

              <div className="relative">
                <UserCheck className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
                <Input
                  label="Username"
                  type="text"
                  placeholder="johndoe_123"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 bg-canvas border-hairline"
                  disabled={isLoading}
                />
              </div>

              <div className="relative">
                <Mail className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
                <Input
                  label="Email Address"
                  type="email"
                  placeholder="john@example.com"
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

              <Button
                type="submit"
                className="w-full mt-2 h-10 rounded-md"
                isLoading={isLoading}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Sign Up
              </Button>
            </form>
          )}

          {!isSuccess && (
            <p className="text-center text-xs text-muted mt-6 font-semibold">
              Already have an account?{' '}
              <Link
                to="/signin"
                className="text-primary hover:text-primary-active transition-colors underline"
              >
                Sign In
              </Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
};
