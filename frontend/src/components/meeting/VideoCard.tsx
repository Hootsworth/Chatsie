import React, { useRef, useEffect } from 'react';
import { MicOff, Hand, Signal, User, Monitor } from 'lucide-react';
import { Card } from '../ui';

interface VideoCardProps {
  stream: MediaStream | null;
  username: string;
  isLocal?: boolean;
  isScreenShare?: boolean;
  isMutedAudio: boolean;
  isMutedVideo: boolean;
  isHandRaised: boolean;
  isActiveSpeaker: boolean;
  connectionQuality?: 'good' | 'fair' | 'poor' | 'disconnected';
}

export const VideoCard: React.FC<VideoCardProps> = ({
  stream,
  username,
  isLocal = false,
  isScreenShare = false,
  isMutedAudio,
  isMutedVideo,
  isHandRaised,
  isActiveSpeaker,
  connectionQuality = 'good'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      if (stream) {
        videoRef.current.srcObject = stream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [stream]);

  // Connection quality icon color
  const signalColors = {
    good: 'text-emerald-500',
    fair: 'text-amber-500',
    poor: 'text-red-500',
    disconnected: 'text-gray-500'
  };

  return (
    <Card 
      className={`relative w-full h-full aspect-video md:aspect-auto md:h-full bg-surface-dark rounded-xl border overflow-hidden flex items-center justify-center transition-all duration-300 ${
        isActiveSpeaker ? 'active-speaker-ring border-transparent' : 'border-white/5'
      }`}
    >
      
      {/* Hand Raised overlay indicator */}
      {isHandRaised && (
        <div className="absolute top-3.5 left-3.5 z-10 bg-amber-500 text-white p-2 rounded-xl shadow-lg border border-amber-400/50 animate-bounce">
          <Hand className="w-4.5 h-4.5 fill-current" />
        </div>
      )}

      {/* Connection Quality indicator (top right) */}
      {!isLocal && (
        <div 
          className="absolute top-3.5 right-3.5 z-10 bg-black/45 backdrop-blur-md p-1.5 rounded-lg border border-white/5"
          title={`Connection quality: ${connectionQuality}`}
        >
          <Signal className={`w-3.5 h-3.5 ${signalColors[connectionQuality]}`} />
        </div>
      )}

      {/* Video Feed */}
      {stream && !isMutedVideo ? (
        isLocal && isScreenShare ? (
          /* Prevent infinite mirror preview for local user */
          <div className="flex flex-col items-center justify-center space-y-4 z-0 select-none p-6 text-center text-on-dark-soft animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center border border-primary/20 shadow-inner">
              <Monitor className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="font-serif text-lg font-normal text-on-dark">You are presenting your screen</h4>
              <p className="text-[11px] max-w-xs leading-relaxed text-on-dark-soft">
                To avoid an infinite feedback loop (hall of mirrors), your screen preview is hidden here. Other participants can see your screen.
              </p>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal} // Critical: mute local loopback to avoid audio feedback
            className={`w-full h-full object-cover rounded-xl ${isLocal && !isScreenShare ? 'transform scale-x-[-1]' : ''}`}
          />
        )
      ) : (
        /* Video Off placeholder avatar */
        <div className="flex flex-col items-center justify-center space-y-3.5 z-0 select-none">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center border border-primary/20 shadow-inner">
            <User className="w-8 h-8" />
          </div>
          <span className="text-xs font-bold text-on-dark-soft tracking-wide bg-black/30 px-2.5 py-1 rounded-md backdrop-blur-sm">
            {username}
          </span>
        </div>
      )}

      {/* Name and audio muted status bar (bottom left overlay) */}
      <div className="absolute bottom-3.5 left-3.5 z-10 bg-black/40 backdrop-blur-sm border border-white/5 px-2.5 py-1.5 rounded-lg flex items-center space-x-2 text-white">
        <span className="text-xs font-bold max-w-[120px] truncate">
          {username} {isLocal && '(You)'}
        </span>
        {isMutedAudio && (
          <span className="text-red-500 bg-red-500/10 p-0.5 rounded border border-red-500/20">
            <MicOff className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </Card>
  );
};
export default VideoCard;
