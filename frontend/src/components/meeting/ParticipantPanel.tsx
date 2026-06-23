import React from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { signalingClient } from '../../services/signaling';
import { Badge } from '../ui';
import { MicOff, VideoOff, Hand, Trash2, Check, X, ShieldAlert, VolumeX, Shield } from 'lucide-react';

interface ParticipantPanelProps {
  roomId: string;
}

export const ParticipantPanel: React.FC<ParticipantPanelProps> = ({ roomId }) => {
  const {
    myRole,
    participants,
    waitingRoomList
  } = useMeetingStore();

  const {
    isMutedAudio,
    isMutedVideo
  } = useWebRTCStore();

  const handleMutePeer = (socketId: string, type: 'audio' | 'video') => {
    const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
    if (provider === 'socketio') {
      // @ts-ignore
      signalingClient.mutePeerInRoom(roomId, socketId, type);
    } else {
      signalingClient.mutePeer(socketId, type);
    }
  };

  const handleKickPeer = (socketId: string) => {
    const confirmation = window.confirm('Are you sure you want to remove this participant from the meeting?');
    if (!confirmation) return;

    const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
    if (provider === 'socketio') {
      // @ts-ignore
      signalingClient.kickPeerInRoom(roomId, socketId);
    } else {
      signalingClient.kickPeer(socketId);
    }
  };

  const handleWaitingAction = (socketId: string, action: 'approve' | 'deny') => {
    const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
    if (provider === 'socketio') {
      // @ts-ignore
      signalingClient.waitingRoomActionInRoom(roomId, socketId, action);
    } else {
      signalingClient.waitingRoomAction(socketId, action);
    }
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
                key={waiter.socketId}
                className="flex items-center justify-between p-2.5 bg-surface-dark-soft rounded-lg border border-amber-500/20 text-xs"
              >
                <span className="font-bold text-on-dark truncate mr-2">
                  {waiter.username}
                </span>
                <div className="flex space-x-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleWaitingAction(waiter.socketId, 'approve')}
                    className="p-1 bg-emerald-500 hover:bg-emerald-600 text-white rounded transition-colors"
                    title="Admit"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleWaitingAction(waiter.socketId, 'deny')}
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
        <Badge>{participants.length + 1}</Badge>
      </div>

      {/* 3. ACTIVE PARTICIPANTS LIST */}
      <div className="flex-grow p-4 space-y-3.5">
        
        {/* Local Participant Card */}
        <div className="flex items-center justify-between text-xs py-1">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-7 h-7 bg-primary/20 text-primary rounded-full flex items-center justify-center font-bold">
              Y
            </div>
            <div className="truncate">
              <span className="font-bold text-on-dark truncate">Me</span>
              <span className="text-[10px] text-on-dark-soft font-semibold block">@{isHost ? 'host' : 'participant'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
            {isHost && <Shield className="w-3.5 h-3.5 text-primary" />}
            {isMutedAudio && <MicOff className="w-3.5 h-3.5 text-red-500" />}
            {isMutedVideo && <VideoOff className="w-3.5 h-3.5 text-red-500" />}
          </div>
        </div>

        {/* Remote Participants */}
        {participants.map((p) => (
          <div 
            key={p.socketId}
            className="flex items-center justify-between text-xs py-1 group"
          >
            {/* Meta */}
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-7 h-7 bg-surface-dark-soft text-on-dark rounded-full flex items-center justify-center font-bold">
                {p.username.charAt(0).toUpperCase()}
              </div>
              <div className="truncate">
                <span className="font-bold text-on-dark truncate">{p.username}</span>
                <span className="text-[10px] text-on-dark-soft font-semibold block">@{p.role}</span>
              </div>
            </div>

            {/* Actions / Status */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* Hand raised status */}
              {p.isHandRaised && <Hand className="w-3.5 h-3.5 text-amber-500 fill-current animate-bounce" />}
              
              {/* Static status icons */}
              {p.isMutedAudio && <MicOff className="w-3.5 h-3.5 text-red-500" />}
              {p.isMutedVideo && <VideoOff className="w-3.5 h-3.5 text-red-500" />}
              {p.role === 'host' && <Shield className="w-3.5 h-3.5 text-primary" />}

              {/* Host Control Actions (visible on hover/mobile for host only) */}
              {isHost && p.role !== 'host' && (
                <div className="hidden group-hover:flex items-center space-x-1 pl-1 bg-surface-dark">
                  {/* Remote Mute Audio */}
                  {!p.isMutedAudio && (
                    <button
                      onClick={() => handleMutePeer(p.socketId, 'audio')}
                      className="p-1 text-on-dark-soft hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Mute Audio"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Remote Mute Video */}
                  {!p.isMutedVideo && (
                    <button
                      onClick={() => handleMutePeer(p.socketId, 'video')}
                      className="p-1 text-on-dark-soft hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                      title="Mute Video"
                    >
                      <VideoOff className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {/* Kick Peer */}
                  <button
                    onClick={() => handleKickPeer(p.socketId)}
                    className="p-1 text-on-dark-soft hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                    title="Remove from meeting"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
export default ParticipantPanel;
