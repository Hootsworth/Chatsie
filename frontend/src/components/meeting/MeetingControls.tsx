import React from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { signalingClient } from '../../services/signaling';
import { useLocalParticipant, useParticipants } from '@livekit/components-react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MonitorOff,
  Hand,
  MessageSquare,
  Users,
  PhoneOff,
  Captions,
  Smile
} from 'lucide-react';

const REACTION_EMOJIS = ['👍', '👏', '❤️', '🎉', '😂', '🔥', '🤔', '😮'];

interface MeetingControlsProps {
  onLeave: () => void;
  hasUnreadMessages: boolean;
  markChatRead: () => void;
  className?: string;
}

export const MeetingControls: React.FC<MeetingControlsProps> = ({
  onLeave,
  hasUnreadMessages,
  markChatRead,
  className = ''
}) => {
  const {
    myRole,
    isChatPanelOpen,
    isParticipantsPanelOpen,
    toggleChatPanel,
    toggleParticipantsPanel,
    currentMeeting,
    isLocalHandRaised,
    setLocalHandRaised,
    isScreenShareLocked
  } = useMeetingStore();

  const { setAudioMute, setVideoMute } = useWebRTCStore();

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const allParticipants = useParticipants();
  const [showCaptions, setCaptionsEnabled] = React.useState(false);

  const [isReactionPickerOpen, setIsReactionPickerOpen] = React.useState(false);
  const reactionPickerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) {
        setIsReactionPickerOpen(false);
      }
    };
    if (isReactionPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isReactionPickerOpen]);

  const toggleAudio = () => {
    const nextState = !isMicrophoneEnabled;
    localParticipant?.setMicrophoneEnabled(nextState);
    setAudioMute(!nextState);
    const code = currentMeeting?.code;
    if (code) {
      sessionStorage.setItem(`meeting_audio_muted_${code}`, String(!nextState));
    }
  };

  const toggleVideo = () => {
    const nextState = !isCameraEnabled;
    localParticipant?.setCameraEnabled(nextState);
    setVideoMute(!nextState);
    const code = currentMeeting?.code;
    if (code) {
      sessionStorage.setItem(`meeting_video_muted_${code}`, String(!nextState));
    }
  };
  const isShareBlocked = isScreenShareLocked && myRole !== 'host';
  const toggleScreenShare = () => {
    if (isShareBlocked) return;
    localParticipant?.setScreenShareEnabled(!isScreenShareEnabled, {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    }
  });
  };

  const handleRaiseHand = () => {
    const nextState = !isLocalHandRaised;
    setLocalHandRaised(nextState);
    signalingClient.raiseHand(nextState);
  };

  const handleToggleChat = () => {
    toggleChatPanel();
    if (!isChatPanelOpen) {
      markChatRead();
    }
  };

  const handleSendReaction = (emoji: string) => {
    signalingClient.sendReaction(emoji);
    setIsReactionPickerOpen(false);
  };

  /* ── Shared pill-button style ── */
  const basePill = 'ctrl-pill focus:outline-none';
  const defaultPill = `${basePill} ctrl-pill--default`;
  const activePill  = `${basePill} ctrl-pill--active`;
  const dangerPill  = `${basePill} ctrl-pill--danger`;
  const mutedPill   = `${basePill} ctrl-pill--muted`;
  const handPill    = `${basePill} ctrl-pill--hand`;

  return (
    <div className={`fixed bottom-0 left-0 right-0 flex items-center justify-center py-4 px-6 z-30 transition-all duration-300 ${className}`}>
      <div className="controls-bar flex items-center gap-2 rounded-full px-4 py-2.5">

        {/* ── Core Media ── */}
        <button onClick={toggleAudio} className={!isMicrophoneEnabled ? mutedPill : defaultPill} title={!isMicrophoneEnabled ? 'Unmute Mic' : 'Mute Mic'}>
          {!isMicrophoneEnabled ? <MicOff className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
        </button>

        <button onClick={toggleVideo} className={!isCameraEnabled ? mutedPill : defaultPill} title={!isCameraEnabled ? 'Start Video' : 'Stop Video'}>
          {!isCameraEnabled ? <VideoOff className="w-[18px] h-[18px]" /> : <Video className="w-[18px] h-[18px]" />}
        </button>

        <button onClick={toggleScreenShare} disabled={isShareBlocked} className={`${isScreenShareEnabled ? activePill : defaultPill} disabled:opacity-40 disabled:cursor-not-allowed`} title={isShareBlocked ? 'Screen sharing is locked by host' : isScreenShareEnabled ? 'Stop Sharing' : 'Share Screen'}>
          {isScreenShareEnabled ? <MonitorOff className="w-[18px] h-[18px]" /> : <Monitor className="w-[18px] h-[18px]" />}
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* ── Auxiliary ── */}
        <button onClick={handleRaiseHand} className={isLocalHandRaised ? handPill : defaultPill} title={isLocalHandRaised ? 'Lower Hand' : 'Raise Hand'}>
          <Hand className="w-[18px] h-[18px]" />
        </button>

        <div className="relative" ref={reactionPickerRef}>
          <button onClick={() => setIsReactionPickerOpen(!isReactionPickerOpen)} className={isReactionPickerOpen ? activePill : defaultPill} title="Send Reaction">
            <Smile className="w-[18px] h-[18px]" />
          </button>
          {isReactionPickerOpen && (
            <div className="reaction-picker absolute bottom-full mb-3 left-1/2 -translate-x-1/2 px-2 py-1.5 flex items-center gap-0.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
              {REACTION_EMOJIS.map((emoji) => (
                <button key={emoji} onClick={() => handleSendReaction(emoji)} className="text-xl p-1.5 rounded-full hover:bg-white/10 hover:scale-125 transition-all duration-100 active:scale-95 cursor-pointer">
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        <button onClick={() => setCaptionsEnabled(!showCaptions)} className={showCaptions ? activePill : defaultPill} title={showCaptions ? 'Hide Captions' : 'Show Captions'}>
          <Captions className="w-[18px] h-[18px]" />
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* ── Sidebar toggles ── */}
        <button onClick={handleToggleChat} className={`${isChatPanelOpen ? activePill : defaultPill} relative`} title="Meeting Chat">
          <MessageSquare className="w-[18px] h-[18px]" />
          {hasUnreadMessages && !isChatPanelOpen && (
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#ea4335] rounded-full border-2 border-[#202124]" />
          )}
        </button>

        <button onClick={toggleParticipantsPanel} className={`${isParticipantsPanelOpen ? activePill : defaultPill} relative`} title="Participants">
          <Users className="w-[18px] h-[18px]" />
          <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-[#9aa0a6]">{allParticipants.length}</span>
        </button>

        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* ── Leave ── */}
        <button onClick={onLeave} className={dangerPill} title={myRole === 'host' ? 'End Meeting for All' : 'Leave Meeting'}>
          <PhoneOff className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
};
export default MeetingControls;
