import React from 'react';
import { ParticipantTile, useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Monitor } from 'lucide-react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';

export const VideoGrid: React.FC = () => {
  const { localParticipant } = useLocalParticipant();
  const participantsList = useMeetingStore(state => state.participants);
  const isLocalHandRaised = useMeetingStore(state => state.isLocalHandRaised);

  // Fetch all camera and screenshare tracks (both local and remote)
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  // Track timestamps of recent reaction events per user ID
  const [recentReactors, setRecentReactors] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const handleReaction = ({ senderUserId }: { senderUserId: string }) => {
      setRecentReactors(prev => ({
        ...prev,
        [senderUserId]: Date.now()
      }));
    };
    signalingClient.on('reaction', handleReaction);
    return () => {
      signalingClient.off('reaction', handleReaction);
    };
  }, []);

  // Helper to extract initials for placeholder avatars
  const getInitials = (name?: string, identity?: string) => {
    const base = name || identity || 'Anon';
    const parts = base.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return base.substring(0, 2).toUpperCase();
  };

  // Dynamic aspect ratio calculation to make horizontal video feeds slightly vertical
  // As the count increases from 1 to 6, tiles shift from landscape (16:9) to square (1:1) to portrait (3:4)
  const getDynamicAspectRatio = (count: number) => {
    if (count <= 1) return undefined;
    if (count === 2) return '1.2';
    if (count === 3) return '1.0';
    if (count === 4) return '0.9';
    if (count === 5) return '0.8';
    return '0.75'; // 6 or more
  };

  // Sort tracks to prioritize screensharing tracks
  const sortedTracks = [...tracks].sort((a, b) => {
    const aIsScreen = a.source === Track.Source.ScreenShare;
    const bIsScreen = b.source === Track.Source.ScreenShare;
    if (aIsScreen && !bIsScreen) return -1;
    if (!aIsScreen && bIsScreen) return 1;
    return a.participant.identity.localeCompare(b.participant.identity);
  });

  const cameraTracks = sortedTracks.filter(t => t.source === Track.Source.Camera);
  const screenshareTracks = sortedTracks.filter(t => t.source === Track.Source.ScreenShare);

  const cameraOnTracks = cameraTracks.filter(t => t.participant.isCameraEnabled);
  const cameraOffTracks = cameraTracks.filter(t => !t.participant.isCameraEnabled);

  // Helper to check if a participant is active (speaking, hand raised, or reacting)
  const isParticipantActive = (identity: string) => {
    const track = cameraTracks.find(t => t.participant.identity === identity);
    const isSpeaking = track?.participant.isSpeaking;
    const isHandRaised = identity === localParticipant?.identity
      ? isLocalHandRaised
      : participantsList.find(sp => sp.userId === identity)?.isHandRaised;
    const lastReacted = recentReactors[identity] || 0;
    const isReacting = Date.now() - lastReacted < 5000;
    return !!(isSpeaking || isHandRaised || isReacting);
  };

  // Determine which camera tracks to render
  const getVisibleCameraTracks = () => {
    if (cameraOnTracks.length <= 6) {
      // Small call: show all camera tracks (both video-on and video-off)
      return cameraTracks;
    }

    // Large call: limit visible video-on tracks to at most 6
    const selectedOnTracks: typeof cameraTracks = [];

    // 1. Local participant (if camera is enabled) must always be shown
    const localOnTrack = cameraOnTracks.find(t => t.participant.isLocal);
    if (localOnTrack) {
      selectedOnTracks.push(localOnTrack);
    }

    // 2. Active remote camera-on tracks (speaking, hand-raised, reacting)
    const activeRemoteOnTracks = cameraOnTracks.filter(
      t => !t.participant.isLocal && isParticipantActive(t.participant.identity)
    );
    activeRemoteOnTracks.forEach(t => {
      if (selectedOnTracks.length < 6) {
        selectedOnTracks.push(t);
      }
    });

    // 3. Fill remaining slots up to 6 with inactive camera-on tracks in stable order
    const inactiveRemoteOnTracks = cameraOnTracks.filter(
      t => !t.participant.isLocal && !isParticipantActive(t.participant.identity)
    );
    inactiveRemoteOnTracks.forEach(t => {
      if (selectedOnTracks.length < 6 && !selectedOnTracks.some(existing => existing.participant.identity === t.participant.identity)) {
        selectedOnTracks.push(t);
      }
    });

    // 4. For camera-off tracks, only show them if they are active (speaking, hand raised, reacting) or the local participant
    const visibleOffTracks = cameraOffTracks.filter(t => {
      if (t.participant.isLocal) return true;
      return isParticipantActive(t.participant.identity);
    });

    return [...selectedOnTracks, ...visibleOffTracks];
  };

  const visibleCameraTracks = getVisibleCameraTracks();
  const finalTracks = [...screenshareTracks, ...visibleCameraTracks].sort((a, b) => {
    const aIsScreen = a.source === Track.Source.ScreenShare;
    const bIsScreen = b.source === Track.Source.ScreenShare;
    if (aIsScreen && !bIsScreen) return -1;
    if (!aIsScreen && bIsScreen) return 1;
    return a.participant.identity.localeCompare(b.participant.identity);
  });

  const videoOnCount = cameraOnTracks.length;
  const trackCount = finalTracks.length;

  let gridClass = "grid gap-4 w-full h-full";
  if (trackCount === 1) {
    gridClass += " grid-cols-1 auto-rows-fr";
  } else if (trackCount === 2) {
    gridClass += " grid-cols-1 md:grid-cols-2 auto-rows-fr";
  } else if (trackCount === 3) {
    gridClass += " grid-cols-1 md:grid-cols-3 auto-rows-fr";
  } else if (trackCount === 4) {
    gridClass += " grid-cols-1 md:grid-cols-2 auto-rows-fr";
  } else {
    gridClass += " grid-cols-1 md:grid-cols-3 auto-rows-fr";
  }

  const aspectRatio = getDynamicAspectRatio(videoOnCount);
  const aspectRatioStyle = aspectRatio 
    ? { aspectRatio, width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%' }
    : { width: '100%', height: '100%' };

  return (
    <div className="absolute inset-0 p-4">
      <div className={gridClass}>
        {finalTracks.map((track) => {
          const isLocalScreenShare = track.source === Track.Source.ScreenShare && track.participant.isLocal;
          const isMe = track.participant.isLocal;
          const isSpeaking = track.participant.isSpeaking;
          const isHandRaised = isMe 
            ? isLocalHandRaised 
            : participantsList.find(sp => sp.userId === track.participant.identity)?.isHandRaised;
          
          const isCameraOff = track.source === Track.Source.Camera && !track.participant.isCameraEnabled;

          const renderContent = () => {
            if (isLocalScreenShare) {
              return (
                <div 
                  className="relative w-full h-full rounded-2xl bg-surface-dark-elevated border border-white/5 flex flex-col items-center justify-center p-6 text-center text-on-dark overflow-hidden shadow-2xl"
                >
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

            if (isCameraOff) {
              const brandColors = [
                'bg-brand-pink text-white border-brand-pink/30',
                'bg-brand-lavender text-brand-teal border-brand-lavender/30',
                'bg-brand-peach text-brand-teal border-brand-peach/30',
                'bg-brand-ochre text-brand-teal border-brand-ochre/30',
                'bg-brand-coral text-white border-brand-coral/30'
              ];
              const colorIndex = (track.participant.identity?.length || 0) % brandColors.length;
              const avatarStyle = brandColors[colorIndex];

              return (
                <div 
                  style={aspectRatioStyle}
                  className={`relative rounded-3xl overflow-hidden bg-surface-dark-elevated border border-white/5 shadow-md shadow-black/10 flex flex-col items-center justify-center p-4 transition-all duration-300 ${
                    isSpeaking 
                      ? 'scale-[1.015] ring-4 ring-brand-mint shadow-2xl shadow-brand-mint/30 z-10' 
                      : ''
                  }`}
                >
                  {isHandRaised && (
                    <div className="absolute top-3 left-3 bg-amber-500/90 backdrop-blur-sm text-white text-[9px] font-black tracking-wider uppercase px-2.5 py-1.5 rounded-lg shadow-md flex items-center space-x-1.5 z-20 animate-pulse border border-amber-400/20">
                      <span>✋ Hand Raised</span>
                    </div>
                  )}

                  <div className="absolute w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />

                  <div className={`relative w-20 h-20 rounded-full ${avatarStyle} flex items-center justify-center shadow-2xl backdrop-blur-md transition-transform duration-300`}>
                    <span className="text-2xl font-semibold tracking-wider font-display">
                      {getInitials(track.participant.name, track.participant.identity)}
                    </span>
                  </div>

                  <div className="absolute bottom-3 left-3 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-md text-[10px] text-on-dark font-bold border border-white/5">
                    {track.participant.name || track.participant.identity} {isMe ? '(You)' : ''}
                  </div>
                </div>
              );
            }

            return (
              <div 
                style={aspectRatioStyle}
                className={`relative rounded-3xl overflow-hidden transition-all duration-300 [&_video]:object-cover [&_video]:w-full [&_video]:h-full ${
                  isSpeaking 
                    ? 'scale-[1.015] ring-4 ring-brand-mint shadow-2xl shadow-brand-mint/30 z-10' 
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
          };

          return (
            <div 
              key={`${track.participant.identity}-${track.source}`}
              className="w-full h-full flex items-center justify-center animate-in fade-in zoom-in-95 duration-300"
            >
              {renderContent()}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VideoGrid;
