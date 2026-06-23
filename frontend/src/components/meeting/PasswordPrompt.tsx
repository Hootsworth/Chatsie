import React, { useState } from 'react';
import { Button, Input, Card } from '../ui';
import { ShieldAlert, KeyRound, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import supabase from '../../services/supabase';

interface PasswordPromptProps {
  meetingCode: string;
  onSuccess: (meetingId: string) => void;
}

export const PasswordPrompt: React.FC<PasswordPromptProps> = ({ meetingCode, onSuccess }) => {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!passcode) {
      setError('Please enter the room passcode.');
      setIsLoading(false);
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL;

      if (!apiUrl || apiUrl === 'undefined' || apiUrl === 'null') {
        const { data: meeting, error: dbError } = await supabase
          .from('meetings')
          .select('id, passcode')
          .eq('code', meetingCode)
          .maybeSingle();

        if (dbError) {
          throw dbError;
        }

        if (!meeting) {
          setError('Meeting not found. Please verify the code.');
          return;
        }

        if (meeting.passcode === passcode) {
          onSuccess(meeting.id);
        } else {
          setError('Incorrect passcode. Please try again.');
        }
        return;
      }

      const response = await fetch(`${apiUrl}/api/verify-passcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: meetingCode, passcode })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        onSuccess(data.meetingId);
      } else {
        setError(data.error || 'Incorrect passcode. Please try again.');
      }
    } catch (err: any) {
      console.error('Error verifying passcode:', err);
      setError(err?.message || 'Failed to contact verification server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 transition-colors duration-200">
      <div className="w-full max-w-md">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="mt-4 text-3xl font-serif text-ink tracking-tight text-center">
            Passcode Required
          </h2>
          <p className="text-sm text-muted mt-1.5 text-center">
            This meeting is protected by an entry passcode.
          </p>
        </div>

        <Card className="p-6 bg-surface-card border-hairline">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 text-xs font-semibold rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <div className="relative">
              <KeyRound className="absolute left-3.5 top-[34px] h-4 w-4 text-muted-soft" />
              <Input
                label="Room Passcode"
                type="password"
                placeholder="Enter passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="pl-10 text-center tracking-widest text-lg font-bold placeholder:tracking-normal placeholder:font-normal bg-canvas border-hairline"
                disabled={isLoading}
                autoFocus
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10 rounded-md"
              isLoading={isLoading}
            >
              Verify & Join
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/"
                className="inline-flex items-center text-xs font-semibold text-primary hover:text-primary-active transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Back to Dashboard
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
};
