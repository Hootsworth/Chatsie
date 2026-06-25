import React from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { useParticipants, useLocalParticipant } from '@livekit/components-react';
import { MicOff, VideoOff, Trash2, Check, X, ShieldAlert, VolumeX } from 'lucide-react';

export const ParticipantPanel: React.FC = () => {
  const {
    myRole,
    waitingRoomList,
    participants,
    isLocalHandRaised,
    currentMeeting
  } = useMeetingStore();

  const allParticipants = useParticipants();
  const { localParticipant } = useLocalParticipant();

  const handleMutePeer = (socketId: string, type: 'audio' | 'video') => {
    // Custom signaling for remote muting
    signalingClient.mutePeer(socketId, type);
  };

  const handleKickPeer = (socketId: string) => {
    const confirmation = window.confirm('Are you sure you want to remove this participant from the meeting?');
    if (!confirmation) return;
    signalingClient.kickPeer(socketId);
  };

  const handleWaitingAction = (userId: string, action: 'approve' | 'deny') => {
    signalingClient.waitingRoomAction(userId, action);
  };

  const isHost = myRole === 'host';

  return (
    <div className="w-full h-full flex flex-col bg-[#202124] text-[#e8eaed] z-20 overflow-y-auto">
      
      {/* 1. WAITING ROOM QUEUE (HOST ONLY) */}
      {isHost && waitingRoomList.length > 0 && (
        <div className="border-b border-white/[0.06] p-4 bg-amber-500/5">
          <h3 className="font-bold text-[11px] text-amber-400 uppercase tracking-widest flex items-center mb-3">
            <ShieldAlert className="w-4 h-4 mr-1.5" />
            Waiting Room ({waitingRoomList.length})
          </h3>
          
          <div className="space-y-2.5">
            {waitingRoomList.map((waiter) => (
              <div 
                key={waiter.userId}
                className="flex items-center justify-between p-2.5 bg-[#292b2f] rounded-lg border border-amber-500/20 text-xs"
              >
                <span className="font-bold text-[#e8eaed] truncate mr-2">
                  {waiter.username}
                </span>
                <div className="flex space-x-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleWaitingAction(waiter.userId, 'approve')}
                    className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors cursor-pointer"
                    title="Admit"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleWaitingAction(waiter.userId, 'deny')}
                    className="p-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors cursor-pointer"
                    title="Deny"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. ACTIVE PARTICIPANTS HEADER */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <h3 className="font-bold text-xs text-[#e8eaed] uppercase tracking-wider">
          Participants
        </h3>
        <span className="px-2 py-0.5 bg-[#3c4043] text-[#e8eaed] rounded text-[10px] font-bold">
          {allParticipants.length}
        </span>
      </div>

      {/* 3. ACTIVE PARTICIPANTS LIST */}
      <div className="flex-grow p-4 space-y-3.5 bg-[#202124]">
        
        {/* Participants (Local & Remote) */}
        {allParticipants.map((p) => {
          const isMe = p.identity === localParticipant?.identity;
          const isHandRaised = isMe 
            ? isLocalHandRaised 
            : participants.find(sp => sp.userId === p.identity)?.isHandRaised;
          
          const isTargetHost = p.identity === currentMeeting?.host_id;
          const canMute = !isMe && (isHost || !isTargetHost);
          
          return (
            <div 
              key={p.identity}
              className="flex items-center justify-between text-xs py-1 group"
            >
              {/* Meta */}
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${isMe ? 'bg-[#8ab4f8]/20 text-[#8ab4f8]' : 'bg-[#3c4043] text-[#e8eaed]'}`}>
                  {p.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-[#e8eaed] truncate">{isMe ? 'Me' : p.name}</span>
                    {isHandRaised && <span className="text-amber-400 font-bold animate-bounce" title="Hand Raised">✋</span>}
                  </div>
                  <span className="text-[10px] text-[#9aa0a6] font-semibold block">{p.identity === currentMeeting?.host_id ? '@host' : ''}</span>
                </div>
              </div>

              {/* Actions / Status */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                
                {/* Static status icons */}
                {!p.isMicrophoneEnabled && <MicOff className="w-3.5 h-3.5 text-red-500" />}
                {!p.isCameraEnabled && <VideoOff className="w-3.5 h-3.5 text-red-500" />}

                {/* Control Actions (visible on hover/mobile) */}
                {!isMe && (canMute || isHost) && (
                  <div className="hidden group-hover:flex items-center space-x-1 pl-1 bg-[#202124] text-[#e8eaed]">
                    {/* Remote Mute Audio */}
                    {canMute && p.isMicrophoneEnabled && (
                      <button
                        onClick={() => handleMutePeer(p.identity, 'audio')}
                        className="p-1 text-[#9aa0a6] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                        title="Mute Audio"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Remote Mute Video */}
                    {canMute && p.isCameraEnabled && (
                      <button
                        onClick={() => handleMutePeer(p.identity, 'video')}
                        className="p-1 text-[#9aa0a6] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                        title="Mute Video"
                      >
                        <VideoOff className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Kick Peer */}
                    {isHost && (
                      <button
                        onClick={() => handleKickPeer(p.identity)}
                        className="p-1 text-[#9aa0a6] hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                        title="Remove from meeting"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default ParticipantPanel;
