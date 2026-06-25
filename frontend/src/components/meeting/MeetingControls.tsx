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
    setLocalHandRaised
  } = useMeetingStore();

  const { setAudioMute, setVideoMute } = useWebRTCStore();

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const allParticipants = useParticipants(); // LiveKit participants
  const [showCaptions, setCaptionsEnabled] = React.useState(false);

  // Reaction picker popover state
  const [isReactionPickerOpen, setIsReactionPickerOpen] = React.useState(false);
  const reactionPickerRef = React.useRef<HTMLDivElement>(null);

  // Close reaction picker on click outside
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
  const toggleScreenShare = () => localParticipant?.setScreenShareEnabled(!isScreenShareEnabled);

  const handleRaiseHand = () => {
    const nextState = !isLocalHandRaised;
    setLocalHandRaised(nextState);
    signalingClient.raiseHand(nextState); // Fallback to custom signaling for hand raise
  };

  const handleToggleChat = () => {
    toggleChatPanel();
    if (!isChatPanelOpen) {
      markChatRead();
    }
  };

  const handleSendReaction = (emoji: string) => {
    signalingClient.sendReaction(emoji); // Fallback to custom signaling for reactions
    setIsReactionPickerOpen(false);
  };

  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-canvas border border-hairline px-6 py-3 flex items-center justify-between text-ink select-none z-30 rounded-pill shadow-sm transition-all duration-300 hover:scale-[1.01] hover:bg-surface-dark-elevated/85 ${className}`}>
      
      {/* Left section: Info */}
      <div className="hidden lg:flex items-center space-x-1 text-[10px] uppercase font-bold tracking-wider text-emerald-500 mr-2 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
        <span>Live</span>
      </div>

      {/* Middle section: Action Controls */}
      <div className="flex items-center space-x-3.5 mx-auto">
        
        {/* Toggle Audio */}
        <button
          onClick={toggleAudio}
          className={`p-3 rounded-full transition-all duration-200 focus:outline-none ${
            !isMicrophoneEnabled 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-canvas border border-hairline text-ink hover:bg-block-cream'
          }`}
          title={!isMicrophoneEnabled ? 'Unmute Mic' : 'Mute Mic'}
        >
          {!isMicrophoneEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Video */}
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-full transition-all duration-200 focus:outline-none ${
            !isCameraEnabled 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-canvas border border-hairline text-ink hover:bg-block-cream'
          }`}
          title={!isCameraEnabled ? 'Start Video' : 'Stop Video'}
        >
          {!isCameraEnabled ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Toggle Screen Share */}
        <button
          onClick={toggleScreenShare}
          className={`p-3 rounded-full transition-all duration-200 focus:outline-none ${
            isScreenShareEnabled 
              ? 'bg-primary hover:bg-primary-active text-white' 
              : 'bg-canvas border border-hairline text-ink hover:bg-block-cream'
          }`}
          title={isScreenShareEnabled ? 'Stop Screen Sharing' : 'Share Screen'}
        >
          {isScreenShareEnabled ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Toggle Raise Hand */}
        <button
          onClick={handleRaiseHand}
          className={`p-3 rounded-full transition-all duration-200 focus:outline-none ${
            isLocalHandRaised 
              ? 'bg-amber-500 hover:bg-amber-600 text-white' 
              : 'bg-canvas border border-hairline text-ink hover:bg-block-cream'
          }`}
          title={isLocalHandRaised ? 'Lower Hand' : 'Raise Hand'}
        >
          <Hand className="w-5 h-5" />
        </button>

        {/* Reactions Picker */}
        <div className="relative" ref={reactionPickerRef}>
          <button
            onClick={() => setIsReactionPickerOpen(!isReactionPickerOpen)}
            className={`p-3 rounded-full transition-all duration-200 focus:outline-none ${
              isReactionPickerOpen 
                ? 'bg-primary hover:bg-primary-active text-white' 
                : 'bg-canvas border border-hairline text-ink hover:bg-block-cream'
            }`}
            title="Send Reaction"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Popover emoji picker */}
          {isReactionPickerOpen && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-canvas border border-hairline rounded-lg p-2.5 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
              <div className="flex items-center space-x-1.5">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleSendReaction(emoji)}
                    className="text-2xl p-2 rounded-xl hover:bg-white/10 hover:scale-125 transition-all duration-150 active:scale-95 cursor-pointer"
                    title={`Send ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Toggle Captions */}
        <button
          onClick={() => setCaptionsEnabled(!showCaptions)}
          className={`p-3 rounded-full transition-all duration-200 focus:outline-none ${
            showCaptions 
              ? 'bg-primary hover:bg-primary-active text-white' 
              : 'bg-canvas border border-hairline text-ink hover:bg-block-cream'
          }`}
          title={showCaptions ? 'Hide Captions' : 'Show Captions'}
        >
          <Captions className="w-5 h-5" />
        </button>

        {/* Leave Meeting (Danger) */}
        <button
          onClick={onLeave}
          className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg shadow-red-600/25 transition-all duration-200 active:scale-95 focus:outline-none"
          title={myRole === 'host' ? 'End Meeting for All' : 'Leave Meeting'}
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>

      {/* Right section: Sidebar Toggles & Settings */}
      <div className="flex items-center space-x-3.5">
        
        {/* Chat Toggle Button */}
        <button
          onClick={handleToggleChat}
          className={`p-2.5 rounded-lg transition-all relative ${
            isChatPanelOpen 
              ? 'bg-block-lime border border-hairline text-ink' 
              : 'hover:bg-block-cream text-ink'
          }`}
          title="Meeting Chat"
        >
          <MessageSquare className="w-5 h-5" />
          {hasUnreadMessages && !isChatPanelOpen && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping" />
          )}
        </button>

        {/* Participants Toggle Button */}
        <button
          onClick={toggleParticipantsPanel}
          className={`p-2.5 rounded-lg transition-all flex items-center space-x-1.5 relative ${
            isParticipantsPanelOpen 
              ? 'bg-block-lime border border-hairline text-ink' 
              : 'hover:bg-block-cream text-ink'
          }`}
          title="Participants List"
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-bold bg-block-lilac text-ink px-1.5 py-0.5 rounded border border-hairline">
            {allParticipants.length}
          </span>
        </button>
      </div>
    </div>
  );
};
export default MeetingControls;
