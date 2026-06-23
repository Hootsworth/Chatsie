import React from 'react';
import { Card, Button } from '../ui';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface WaitingRoomProps {
  meetingTitle: string;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ meetingTitle }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 transition-colors duration-200">
      <div className="w-full max-w-md text-center">
        
        {/* Loader Icon */}
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto border border-primary/20 shadow-lg shadow-primary/5 mb-6">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>

        <h2 className="text-3xl font-serif text-ink tracking-tight text-center">
          Waiting Room
        </h2>
        <p className="text-sm text-muted mt-2 max-w-xs mx-auto">
          You are in the queue for <span className="font-semibold text-body-strong">{meetingTitle}</span>.
        </p>

        <Card className="p-6 mt-6 bg-surface-card border-hairline">
          <p className="text-sm font-semibold text-body-strong">
            Please wait, the meeting host will let you in shortly.
          </p>
          
          <div className="mt-6 pt-4 border-t border-hairline">
            <Link to="/">
              <Button variant="secondary" size="sm" className="w-full h-10 rounded-md">
                <ArrowLeft className="w-4 h-4 mr-2" /> Cancel & Return to Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};
export default WaitingRoom;
