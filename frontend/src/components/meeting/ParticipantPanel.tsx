import React from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { useParticipants, useLocalParticipant } from '@livekit/components-react';
import { Badge } from '../ui';
import { MicOff, VideoOff, Trash2, Check, X, ShieldAlert, VolumeX } from 'lucide-react';

export const ParticipantPanel: React.FC = () => {
  const {
    myRole,
    waitingRoomList,
    participants,
    isLocalHandRaised
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
    <div className="w-full h-full flex flex-col bg-surface-dark border-l border-white/5 z-20 overflow-y-auto">
      
      {/* 1. WAITING ROOM QUEUE (HOST ONLY) */}
      {isHost && waitingRoomList.length > 0 && (
        <div className="border-b border-white/5 p-4 bg-amber-500/5">
          <h3 className="font-bold text-[11px] text-amber-500 uppercase tracking-widest flex items-center mb-3">
            <ShieldAlert className="w-4 h-4 mr-1.5" />
            Waiting Room ({waitingRoomList.length})
          </h3>
          
          <div className="space-y-2.5">
            {waitingRoomList.map((waiter) => (
              <div 
                key={waiter.userId}
                className="flex items-center justify-between p-2.5 bg-surface-dark-soft rounded-lg border border-amber-500/20 text-xs"
              >
                <span className="font-bold text-on-dark truncate mr-2">
                  {waiter.username}
                </span>
                <div className="flex space-x-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleWaitingAction(waiter.userId, 'approve')}
                    className="p-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
                    title="Admit"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleWaitingAction(waiter.userId, 'deny')}
                    className="p-1 bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
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
      <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
        <h3 className="font-bold text-sm text-on-dark uppercase tracking-wider">
          Participants
        </h3>
        <Badge>{allParticipants.length}</Badge>
      </div>

      {/* 3. ACTIVE PARTICIPANTS LIST */}
      <div className="flex-grow p-4 space-y-3.5">
        
        {/* Participants (Local & Remote) */}
        {allParticipants.map((p) => {
          const isMe = p.identity === localParticipant?.identity;
          const isHandRaised = isMe 
            ? isLocalHandRaised 
            : participants.find(sp => sp.userId === p.identity)?.isHandRaised;
          
          return (
            <div 
              key={p.identity}
              className="flex items-center justify-between text-xs py-1 group"
            >
              {/* Meta */}
              <div className="flex items-center space-x-2.5 min-w-0">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold ${isMe ? 'bg-primary/20 text-primary' : 'bg-surface-dark-soft text-on-dark'}`}>
                  {p.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-on-dark truncate">{isMe ? 'Me' : p.name}</span>
                    {isHandRaised && <span className="text-amber-500 font-bold" title="Hand Raised">✋</span>}
                  </div>
                  <span className="text-[10px] text-on-dark-soft font-semibold block">{isMe && isHost ? '@host' : ''}</span>
                </div>
              </div>

              {/* Actions / Status */}
              <div className="flex items-center space-x-2 flex-shrink-0">
                
                {/* Static status icons */}
                {!p.isMicrophoneEnabled && <MicOff className="w-3.5 h-3.5 text-red-500" />}
                {!p.isCameraEnabled && <VideoOff className="w-3.5 h-3.5 text-red-500" />}

                {/* Host Control Actions (visible on hover/mobile for host only) */}
                {isHost && !isMe && (
                  <div className="hidden group-hover:flex items-center space-x-1 pl-1 bg-surface-dark">
                    {/* Remote Mute Audio */}
                    {p.isMicrophoneEnabled && (
                      <button
                        onClick={() => handleMutePeer(p.identity, 'audio')}
                        className="p-1 text-on-dark-soft hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        title="Mute Audio"
                      >
                        <VolumeX className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Remote Mute Video */}
                    {p.isCameraEnabled && (
                      <button
                        onClick={() => handleMutePeer(p.identity, 'video')}
                        className="p-1 text-on-dark-soft hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        title="Mute Video"
                      >
                        <VideoOff className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Kick Peer */}
                    <button
                      onClick={() => handleKickPeer(p.identity)}
                      className="p-1 text-on-dark-soft hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Remove from meeting"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
