import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import supabase from '../../services/supabase';
import { Button, Input, Card } from '../ui';
import { KeyRound, CheckCircle2, ArrowRight } from 'lucide-react';

export const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) throw updateError;
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred during password reset.');
    } finally {
      setIsLoading(false);
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
            Create New Password
          </h2>
          <p className="text-sm text-muted mt-1.5 text-center">
            Enter your new secure password below.
          </p>
        </div>

        <Card className="p-6 md:p-8">
          {isSuccess ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-ink">Password Changed!</h3>
              <p className="text-sm text-muted">
                Your password has been successfully updated. You can now sign in with your new credentials.
              </p>
              <Link to="/signin" className="inline-block mt-2">
                <Button className="w-full h-10 rounded-md">
                  Go to Sign In <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error ? (
                <div className="p-3.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg border border-red-200">
                  {error}
                </div>
              ) : null}

              <div className="relative">
                <KeyRound className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
                <Input
                  label="New Password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 bg-canvas border-hairline"
                  disabled={isLoading}
                />
              </div>

              <div className="relative">
                <KeyRound className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
                <Input
                  label="Confirm New Password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10 bg-canvas border-hairline"
                  disabled={isLoading}
                />
              </div>

              <Button
                type="submit"
                className="w-full mt-2 h-10 rounded-md"
                isLoading={isLoading}
              >
                Reset Password
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
};
