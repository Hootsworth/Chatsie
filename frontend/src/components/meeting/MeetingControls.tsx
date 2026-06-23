import React from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { signalingClient } from '../../services/signaling';
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
  Settings,
  PhoneOff,
  Captions,
  FileText,
  Smile
} from 'lucide-react';

const REACTION_EMOJIS = ['👍', '👏', '❤️', '🎉', '😂', '🔥', '🤔', '😮'];

interface MeetingControlsProps {
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  onLeave: () => void;
  hasUnreadMessages: boolean;
  markChatRead: () => void;
}

export const MeetingControls: React.FC<MeetingControlsProps> = ({
  toggleAudio,
  toggleVideo,
  toggleScreenShare,
  onLeave,
  hasUnreadMessages,
  markChatRead
}) => {
  const {
    myRole,
    participants,
    isChatPanelOpen,
    isParticipantsPanelOpen,
    isTranscriptionPanelOpen,
    toggleChatPanel,
    toggleParticipantsPanel,
    toggleTranscriptionPanel,
    setSettingsOpen
  } = useMeetingStore();

  const {
    isMutedAudio,
    isMutedVideo,
    isScreenSharing,
    showCaptions,
    setCaptionsEnabled
  } = useWebRTCStore();

  // Local state for hand raised
  const [isHandRaised, setIsHandRaised] = React.useState(false);
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

  const handleRaiseHand = () => {
    const nextState = !isHandRaised;
    setIsHandRaised(nextState);
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

  return (
    <div className="bg-surface-dark-elevated/90 border-t border-white/5 px-6 py-4 flex items-center justify-between text-white select-none z-30">
      
      {/* Left section: Info */}
      <div className="hidden sm:block text-xs text-on-dark-soft font-bold">
        <span>Mesh P2P Connection</span>
        <span className="mx-2">•</span>
        <span className="text-emerald-500 font-extrabold">Active</span>
      </div>

      {/* Middle section: Action Controls */}
      <div className="flex items-center space-x-3.5 mx-auto">
        
        {/* Toggle Audio */}
        <button
          onClick={toggleAudio}
          className={`p-3 rounded-xl transition-all duration-200 focus:outline-none ${
            isMutedAudio 
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20' 
              : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
          }`}
          title={isMutedAudio ? 'Unmute Mic' : 'Mute Mic'}
        >
          {isMutedAudio ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Toggle Video */}
        <button
          onClick={toggleVideo}
          className={`p-3 rounded-xl transition-all duration-200 focus:outline-none ${
            isMutedVideo 
              ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20' 
              : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
          }`}
          title={isMutedVideo ? 'Start Video' : 'Stop Video'}
        >
          {isMutedVideo ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* Toggle Screen Share */}
        <button
          onClick={toggleScreenShare}
          className={`p-3 rounded-xl transition-all duration-200 focus:outline-none ${
            isScreenSharing 
              ? 'bg-primary hover:bg-primary-active text-white shadow-lg shadow-primary/20' 
              : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
          }`}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
        >
          {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
        </button>

        {/* Toggle Raise Hand */}
        <button
          onClick={handleRaiseHand}
          className={`p-3 rounded-xl transition-all duration-200 focus:outline-none ${
            isHandRaised 
              ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20' 
              : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
          }`}
          title={isHandRaised ? 'Lower Hand' : 'Raise Hand'}
        >
          <Hand className="w-5 h-5" />
        </button>

        {/* Reactions Picker */}
        <div className="relative" ref={reactionPickerRef}>
          <button
            onClick={() => setIsReactionPickerOpen(!isReactionPickerOpen)}
            className={`p-3 rounded-xl transition-all duration-200 focus:outline-none ${
              isReactionPickerOpen 
                ? 'bg-primary hover:bg-primary-active text-white shadow-lg shadow-primary/20' 
                : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
            }`}
            title="Send Reaction"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Popover emoji picker */}
          {isReactionPickerOpen && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-surface-dark-elevated border border-white/10 rounded-2xl p-2.5 shadow-2xl shadow-black/40 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
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
          className={`p-3 rounded-xl transition-all duration-200 focus:outline-none ${
            showCaptions 
              ? 'bg-primary hover:bg-primary-active text-white shadow-lg shadow-primary/20' 
              : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
          }`}
          title={showCaptions ? 'Hide Captions' : 'Show Captions'}
        >
          <Captions className="w-5 h-5" />
        </button>

        {/* Leave Meeting (Danger) */}
        <button
          onClick={onLeave}
          className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-lg shadow-red-600/25 transition-all duration-200 active:scale-95 focus:outline-none"
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
              ? 'bg-primary/20 text-primary border border-primary/30' 
              : 'hover:bg-surface-dark-soft text-on-dark-soft'
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
              ? 'bg-primary/20 text-primary border border-primary/30' 
              : 'hover:bg-surface-dark-soft text-on-dark-soft'
          }`}
          title="Participants List"
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] font-bold bg-surface-dark-soft text-on-dark px-1.5 py-0.5 rounded border border-white/10">
            {participants.length + 1}
          </span>
        </button>

        {/* Transcription Toggle Button */}
        <button
          onClick={toggleTranscriptionPanel}
          className={`p-2.5 rounded-lg transition-all relative ${
            isTranscriptionPanelOpen 
              ? 'bg-primary/20 text-primary border border-primary/30' 
              : 'hover:bg-surface-dark-soft text-on-dark-soft'
          }`}
          title="Live Transcription"
        >
          <FileText className="w-5 h-5" />
        </button>

        {/* Device Settings Toggle Button */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2.5 hover:bg-surface-dark-soft text-on-dark-soft rounded-lg transition-colors"
          title="Device Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
export default MeetingControls;

