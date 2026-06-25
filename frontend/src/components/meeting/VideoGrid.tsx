import React from 'react';
import { ParticipantTile, useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Monitor } from 'lucide-react';
import { useMeetingStore } from '../../stores/meetingStore';

export const VideoGrid: React.FC = () => {
  const { localParticipant } = useLocalParticipant();
  const participantsList = useMeetingStore(state => state.participants);
  // Fetch all camera and screenshare tracks (both local and remote)
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  // Sort tracks to prioritize:
  // 1. Screensharing tracks (always show screenshares first)
  // 2. Stable participant order (keeps tiles static instead of shifting when people speak)
  const sortedTracks = [...tracks].sort((a, b) => {
    // Screenshares take highest precedence
    const aIsScreen = a.source === Track.Source.ScreenShare;
    const bIsScreen = b.source === Track.Source.ScreenShare;
    if (aIsScreen && !bIsScreen) return -1;
    if (!aIsScreen && bIsScreen) return 1;

    // Stable sort by identity
    return a.participant.identity.localeCompare(b.participant.identity);
  });

  const trackCount = sortedTracks.length;
  let gridClass = "grid gap-4 w-full h-full";
  if (trackCount === 1) {
    gridClass += " grid-cols-1 auto-rows-fr";
  } else if (trackCount === 2) {
    gridClass += " grid-cols-1 md:grid-cols-2 auto-rows-fr";
  } else if (trackCount === 3 || trackCount === 4) {
    gridClass += " grid-cols-1 md:grid-cols-2 auto-rows-fr";
  } else {
    gridClass += " grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr";
  }

  const isLocalHandRaised = useMeetingStore(state => state.isLocalHandRaised);

  return (
    <div className="absolute inset-0 p-4">
      <div className={gridClass}>
        {sortedTracks.map((track) => {
          const isLocalScreenShare = track.source === Track.Source.ScreenShare && track.participant.isLocal;
          
          if (isLocalScreenShare) {
            return (
              <div 
                key={`${track.participant.identity}-local-screenshare`}
                className="relative rounded-2xl bg-surface-dark-elevated border border-white/5 flex flex-col items-center justify-center p-6 text-center text-on-dark overflow-hidden shadow-2xl"
              >
                {/* Decorative background pulse */}
                <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none" />
                
                <div className="w-14 h-14 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4 border border-primary/20 shadow-inner">
                  <Monitor className="w-7 h-7" />
                </div>
                
                <h3 className="text-sm font-bold text-on-dark mb-1">
                  You are presenting your screen
                </h3>
                <p className="text-[10px] text-on-dark-soft mb-5 max-w-[200px]">
                  Your screen is visible to other participants in this meeting room.
                </p>
                
                <button
                  onClick={() => localParticipant?.setScreenShareEnabled(false)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white text-[10px] font-black rounded-lg transition-all shadow-md shadow-red-600/10 cursor-pointer"
                >
                  Stop Presenting
                </button>
              </div>
            );
          }
          
          const isSpeaking = track.participant.isSpeaking;
          const isMe = track.participant.isLocal;
          const isHandRaised = isMe 
            ? isLocalHandRaised 
            : participantsList.find(sp => sp.userId === track.participant.identity)?.isHandRaised;

          return (
            <div 
              key={`${track.participant.identity}-${track.source}`}
              className={`relative rounded-3xl overflow-hidden transition-all duration-300 [&_video]:object-cover [&_video]:w-full [&_video]:h-full ${
                isSpeaking 
                  ? 'scale-[1.015] ring-4 ring-emerald-500/80 shadow-2xl shadow-emerald-500/30 z-10' 
                  : 'border border-white/5 shadow-md shadow-black/10'
              }`}
            >
              {isHandRaised && (
                <div className="absolute top-3 left-3 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black tracking-wider uppercase px-2.5 py-1.5 rounded-lg shadow-md flex items-center space-x-1.5 z-20 animate-pulse border border-amber-400/20">
                  <span>✋ Hand Raised</span>
                </div>
              )}
              <ParticipantTile trackRef={track} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VideoGrid;
