import React from 'react';
import { ParticipantTile, useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Monitor } from 'lucide-react';

export const VideoGrid: React.FC = () => {
  const { localParticipant } = useLocalParticipant();
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
  // 2. Active speakers (speaking === true)
  // 3. Other participants
  const sortedTracks = [...tracks].sort((a, b) => {
    // Screenshares take highest precedence
    const aIsScreen = a.source === Track.Source.ScreenShare;
    const bIsScreen = b.source === Track.Source.ScreenShare;
    if (aIsScreen && !bIsScreen) return -1;
    if (!aIsScreen && bIsScreen) return 1;

    // Active speakers take next precedence
    const aIsSpeaking = a.participant.isSpeaking;
    const bIsSpeaking = b.participant.isSpeaking;
    if (aIsSpeaking && !bIsSpeaking) return -1;
    if (!aIsSpeaking && bIsSpeaking) return 1;

    return 0;
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

  return (
    <div className="w-full h-full p-4 relative">
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
          return (
            <div 
              key={`${track.participant.identity}-${track.source}`}
              className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
                isSpeaking 
                  ? 'ring-4 ring-emerald-500 shadow-lg shadow-emerald-500/20' 
                  : 'border border-white/5'
              }`}
            >
              <ParticipantTile trackRef={track} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VideoGrid;
