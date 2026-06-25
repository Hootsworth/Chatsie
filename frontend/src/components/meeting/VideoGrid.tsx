import React from 'react';
import { ParticipantTile, useTracks, useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Monitor } from 'lucide-react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';

/* ── Soft avatar palette for camera-off tiles ── */
const AVATAR_COLORS = [
  { bg: '#4285f4', text: '#ffffff' },  // Google Blue
  { bg: '#ea4335', text: '#ffffff' },  // Red
  { bg: '#fbbc04', text: '#202124' },  // Yellow
  { bg: '#34a853', text: '#ffffff' },  // Green
  { bg: '#a142f4', text: '#ffffff' },  // Purple
  { bg: '#fa7b17', text: '#ffffff' },  // Orange
];

export const VideoGrid: React.FC = () => {
  const { localParticipant } = useLocalParticipant();
  const participantsList = useMeetingStore(state => state.participants);
  const isLocalHandRaised = useMeetingStore(state => state.isLocalHandRaised);

  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  const [recentReactors, setRecentReactors] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    const handleReaction = ({ senderUserId }: { senderUserId: string }) => {
      setRecentReactors(prev => ({ ...prev, [senderUserId]: Date.now() }));
    };
    signalingClient.on('reaction', handleReaction);
    return () => { signalingClient.off('reaction', handleReaction); };
  }, []);

  const getInitials = (name?: string, identity?: string) => {
    const base = name || identity || 'Anon';
    const parts = base.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return base.substring(0, 2).toUpperCase();
  };

  const sortedTracks = [...tracks].sort((a, b) => {
    const aS = a.source === Track.Source.ScreenShare;
    const bS = b.source === Track.Source.ScreenShare;
    if (aS && !bS) return -1;
    if (!aS && bS) return 1;
    return a.participant.identity.localeCompare(b.participant.identity);
  });

  const cameraTracks = sortedTracks.filter(t => t.source === Track.Source.Camera);
  const screenshareTracks = sortedTracks.filter(t => t.source === Track.Source.ScreenShare);
  const cameraOnTracks = cameraTracks.filter(t => t.participant.isCameraEnabled);
  const cameraOffTracks = cameraTracks.filter(t => !t.participant.isCameraEnabled);

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

  const getVisibleCameraTracks = () => {
    if (cameraOnTracks.length <= 6) return cameraTracks;
    const selected: typeof cameraTracks = [];
    const localOn = cameraOnTracks.find(t => t.participant.isLocal);
    if (localOn) selected.push(localOn);
    cameraOnTracks.filter(t => !t.participant.isLocal && isParticipantActive(t.participant.identity)).forEach(t => { if (selected.length < 6) selected.push(t); });
    cameraOnTracks.filter(t => !t.participant.isLocal && !isParticipantActive(t.participant.identity)).forEach(t => { if (selected.length < 6 && !selected.some(e => e.participant.identity === t.participant.identity)) selected.push(t); });
    const visibleOff = cameraOffTracks.filter(t => t.participant.isLocal || isParticipantActive(t.participant.identity));
    return [...selected, ...visibleOff];
  };

  const finalTracks = [...screenshareTracks, ...getVisibleCameraTracks()].sort((a, b) => {
    const aS = a.source === Track.Source.ScreenShare;
    const bS = b.source === Track.Source.ScreenShare;
    if (aS && !bS) return -1;
    if (!aS && bS) return 1;
    return a.participant.identity.localeCompare(b.participant.identity);
  });

  const count = finalTracks.length;

  /* ── Responsive grid classes ── */
  let gridCls = 'grid gap-2 w-full h-full p-2';
  if (count === 1)      gridCls += ' grid-cols-1';
  else if (count === 2) gridCls += ' grid-cols-1 md:grid-cols-2';
  else if (count <= 4)  gridCls += ' grid-cols-2';
  else                  gridCls += ' grid-cols-2 md:grid-cols-3';

  return (
    <div className="absolute inset-0">
      <div className={gridCls}>
        {finalTracks.map((track) => {
          const isLocalScreen = track.source === Track.Source.ScreenShare && track.participant.isLocal;
          const isMe = track.participant.isLocal;
          const isSpeaking = track.participant.isSpeaking;
          const isHandRaised = isMe
            ? isLocalHandRaised
            : participantsList.find(sp => sp.userId === track.participant.identity)?.isHandRaised;
          const isCameraOff = track.source === Track.Source.Camera && !track.participant.isCameraEnabled;

          const speakingRing = isSpeaking ? 'ring-2 ring-[#8ab4f8] ring-offset-2 ring-offset-[#202124]' : '';
          const displayName = track.participant.name || track.participant.identity;

          if (isLocalScreen) {
            return (
              <div key={`${track.participant.identity}-${track.source}`} className="w-full h-full flex items-center justify-center">
                <div className={`relative w-full h-full rounded-xl bg-[#292b2f] flex flex-col items-center justify-center ${speakingRing}`}>
                  <div className="w-12 h-12 rounded-full bg-[#8ab4f8]/20 flex items-center justify-center mb-3">
                    <Monitor className="w-6 h-6 text-[#8ab4f8]" />
                  </div>
                  <p className="text-sm font-medium text-[#e8eaed] mb-1">You are presenting</p>
                  <p className="text-xs text-[#9aa0a6] mb-4">Others can see your screen</p>
                  <button
                    onClick={() => localParticipant?.setScreenShareEnabled(false)}
                    className="px-4 py-2 bg-[#ea4335] hover:bg-[#d93025] text-white text-xs font-semibold rounded-full transition-colors cursor-pointer"
                  >
                    Stop presenting
                  </button>
                </div>
              </div>
            );
          }

          if (isCameraOff) {
            const colorIdx = (track.participant.identity?.length || 0) % AVATAR_COLORS.length;
            const palette = AVATAR_COLORS[colorIdx];
            return (
              <div key={`${track.participant.identity}-${track.source}`} className="w-full h-full flex items-center justify-center">
                <div className={`relative w-full h-full rounded-xl bg-[#292b2f] flex flex-col items-center justify-center transition-all ${speakingRing}`}>
                  {isHandRaised && (
                    <div className="absolute top-2 left-2 bg-[#fbbc04] text-[#202124] text-[10px] font-bold px-2 py-1 rounded-full z-10">
                      ✋ Raised
                    </div>
                  )}
                  <div
                    className="w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center text-xl md:text-2xl font-semibold select-none"
                    style={{ backgroundColor: palette.bg, color: palette.text }}
                  >
                    {getInitials(track.participant.name, track.participant.identity)}
                  </div>
                  <span className="mt-2.5 text-xs font-medium text-[#e8eaed] truncate max-w-[80%]">
                    {displayName} {isMe ? '(You)' : ''}
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={`${track.participant.identity}-${track.source}`} className="w-full h-full flex items-center justify-center">
              <div className={`relative w-full h-full rounded-xl overflow-hidden bg-[#292b2f] transition-all [&_video]:object-cover [&_video]:w-full [&_video]:h-full ${speakingRing}`}>
                {isHandRaised && (
                  <div className="absolute top-2 left-2 bg-[#fbbc04] text-[#202124] text-[10px] font-bold px-2 py-1 rounded-full z-10">
                    ✋ Raised
                  </div>
                )}
                <ParticipantTile trackRef={track} />
                <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-md text-[11px] text-[#e8eaed] font-medium z-10">
                  {displayName} {isMe ? '(You)' : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VideoGrid;
