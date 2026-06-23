import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Button, Input, Card } from '../ui';
import { Mail, ArrowLeft, Send } from 'lucide-react';

export const ForgotPassword: React.FC = () => {
  const [email, setEmail] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);

  const { resetPassword, isLoading, error, clearError } = useAuthStore();

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email) {
      setFormError('Please enter your email address.');
      return;
    }

    try {
      await resetPassword(email);
      setIsSent(true);
    } catch (err) {
      // Handled by store error
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        {/* Branding */}
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
            Reset Password
          </h2>
          <p className="text-sm text-muted mt-1.5 text-center">
            We will send you instructions to reset your password.
          </p>
        </div>

        <Card className="p-6 md:p-8">
          {isSent ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <Send className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ink">Email Sent!</h3>
              <p className="text-sm text-muted">
                Check your inbox at <span className="font-semibold text-body-strong">{email}</span> for a link to reset your password.
              </p>
              <Link to="/signin" className="inline-block mt-4">
                <Button variant="secondary" size="sm" className="h-10 rounded-md">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Sign In
                </Button>
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

              <Button
                type="submit"
                className="w-full mt-2 h-10 rounded-md"
                isLoading={isLoading}
              >
                Send Recovery Email
              </Button>

              <div className="text-center pt-2">
                <Link
                  to="/signin"
                  className="inline-flex items-center text-xs font-semibold text-primary hover:text-primary-active transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};
