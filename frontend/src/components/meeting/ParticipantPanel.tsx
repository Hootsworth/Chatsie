import React, { useState, useEffect, useRef } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { useParticipants, useLocalParticipant } from '@livekit/components-react';
import { useAuth } from '@clerk/clerk-react';
import { 
  Hand, MicOff, VideoOff, Trash2, Check, X, ShieldAlert, 
  VolumeX, Lock, Unlock, MousePointer, MessageSquare, MonitorOff, 
  Users, Loader2, UserPlus 
} from 'lucide-react';

interface ParticipantPanelProps {
  onBreakoutClick?: () => void;
}

export const ParticipantPanel: React.FC<ParticipantPanelProps> = ({ onBreakoutClick }) => {
  const {
    myRole,
    waitingRoomList,
    participants,
    isLocalHandRaised,
    currentMeeting,
    isMultiplayerCursorEnabled,
    isChatLocked,
    isScreenShareLocked
  } = useMeetingStore();

  const allParticipants = useParticipants();
  const { localParticipant } = useRoomLocalParticipant();
  const { getToken } = useAuth();

  // Tab state: 'list' | 'controls' (Host only)
  const [activeTab, setActiveTab] = useState<'list' | 'controls'>('list');

  // Invite form state
  const [emailInput, setEmailInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<any>(null);

  const isHost = myRole === 'host';

  const handleMutePeer = (socketId: string, type: 'audio' | 'video') => {
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

  const handleAdmitAll = () => {
    waitingRoomList.forEach((waiter) => {
      signalingClient.waitingRoomAction(waiter.userId, 'approve');
    });
  };

  const handleDenyAll = () => {
    const confirmation = window.confirm('Deny every participant currently in the waiting room?');
    if (!confirmation) return;
    waitingRoomList.forEach((waiter) => {
      signalingClient.waitingRoomAction(waiter.userId, 'deny');
    });
  };

  const handleMuteAll = (type: 'audio' | 'video') => {
    allParticipants.forEach((p) => {
      const isMe = p.identity === localParticipant?.identity;
      if (!isMe) {
        signalingClient.mutePeer(p.identity, type);
      }
    });
  };

  const handleLowerAllHands = () => {
    signalingClient.sendLowerAllHands();
  };

  // Toggle Lock
  const handleToggleRoomLock = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${backendUrl}/api/meetings/${currentMeeting?.code}/lock`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ isLocked: !currentMeeting?.is_locked })
      });
      if (res.ok) {
        signalingClient.sendRoomLockToggle(!currentMeeting?.is_locked);
      }
    } catch (err) {
      console.error('Failed to toggle room lock:', err);
    }
  };

  // Invite user database lookup
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    const trimmed = emailInput.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setLookupResult(null);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
        const token = await getToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${backendUrl}/api/users/lookup?email=${encodeURIComponent(trimmed)}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setLookupResult(data);
        }
      } catch (err) {
        console.error('Error looking up user:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [emailInput, getToken]);

  // Send Gmail invitation
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) return;

    setInviteStatus('sending');
    setInviteError(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${backendUrl}/api/meetings/${currentMeeting?.code}/invite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: trimmed })
      });

      if (res.ok) {
        setInviteStatus('success');
        setEmailInput('');
        setTimeout(() => setInviteStatus('idle'), 3000);
      } else {
        const data = await res.json();
        setInviteStatus('error');
        setInviteError(data.error || 'Failed to send invitation');
      }
    } catch (err: any) {
      setInviteStatus('error');
      setInviteError(err.message || 'Failed to send invitation');
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#1e2022] text-[#e3e2e6] overflow-hidden select-none">
      
      {/* M3 Segmented Navigation Tabs */}
      <div className="flex bg-[#131417] p-1 border-b border-white/[0.08] flex-shrink-0 gap-1">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-2 text-[11px] font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'list' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Participants
        </button>
        {isHost && (
          <button
            onClick={() => setActiveTab('controls')}
            className={`flex-1 py-2 text-[11px] font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'controls' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            Host Rules
          </button>
        )}
      </div>

      {/* TAB CONTENT: ACTIVE PARTICIPANTS */}
      {activeTab === 'list' && (
        <div className="flex-1 flex flex-col min-h-0 bg-[#1e2022]">
          {/* Waiting Room queue */}
          {isHost && waitingRoomList.length > 0 && (
            <div className="border-b border-white/[0.08] p-4 bg-amber-500/5 flex-shrink-0">
              <h3 className="font-bold text-[10px] text-amber-400 uppercase tracking-wider flex items-center mb-3">
                <ShieldAlert className="w-3.5 h-3.5 mr-1.5" />
                Waiting Room ({waitingRoomList.length})
              </h3>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={handleAdmitAll}
                  className="py-1.5 bg-[#c4eed0] hover:bg-[#e0f8e9] text-[#072711] rounded-full text-[10px] font-bold transition-all cursor-pointer"
                >
                  Admit All
                </button>
                <button
                  onClick={handleDenyAll}
                  className="py-1.5 bg-[#f2b8b5] hover:bg-[#f9dedc] text-[#601410] rounded-full text-[10px] font-bold transition-all cursor-pointer"
                >
                  Deny All
                </button>
              </div>
              <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                {waitingRoomList.map((waiter) => (
                  <div key={waiter.userId} className="flex items-center justify-between p-2.5 bg-[#131417] border border-white/5 rounded-xl text-xs">
                    <span className="font-bold text-white/90 truncate mr-2">{waiter.username}</span>
                    <div className="flex space-x-1 flex-shrink-0">
                      <button
                        onClick={() => handleWaitingAction(waiter.userId, 'approve')}
                        className="p-1 bg-[#c4eed0] hover:bg-[#e0f8e9] text-[#072711] rounded-full cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleWaitingAction(waiter.userId, 'deny')}
                        className="p-1 bg-[#f2b8b5] hover:bg-[#f9dedc] text-[#601410] rounded-full cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Participants List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#1e2022]">
            {allParticipants.map((p) => {
              const isMe = p.identity === localParticipant?.identity;
              const isHandRaised = isMe 
                ? isLocalHandRaised 
                : participants.find(sp => sp.userId === p.identity)?.isHandRaised;
              const isTargetHost = p.identity === currentMeeting?.host_id;
              const canMute = !isMe && (isHost || !isTargetHost);

              return (
                <div key={p.identity} className="flex items-center justify-between text-xs py-1 group">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 ${
                      isMe ? 'bg-[#a8c7fa]/20 text-[#a8c7fa]' : 'bg-[#303134] text-white'
                    }`}>
                      {p.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <div className="truncate">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white/90 truncate">{isMe ? 'Me' : p.name}</span>
                        {isHandRaised && <span className="text-amber-400 font-bold animate-bounce">✋</span>}
                      </div>
                      <span className="text-[9px] text-white/50 font-bold block">
                        {p.identity === currentMeeting?.host_id ? 'Meeting Host' : ''}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    {!p.isMicrophoneEnabled && <MicOff className="w-3.5 h-3.5 text-red-400" />}
                    {!p.isCameraEnabled && <VideoOff className="w-3.5 h-3.5 text-red-400" />}

                    {!isMe && (canMute || isHost) && (
                      <div className="hidden group-hover:flex items-center space-x-1 pl-1 bg-[#1e2022]">
                        {canMute && p.isMicrophoneEnabled && (
                          <button
                            onClick={() => handleMutePeer(p.identity, 'audio')}
                            className="p-1.5 text-white/60 hover:text-red-400 hover:bg-white/5 rounded-full cursor-pointer"
                            title="Mute Audio"
                          >
                            <VolumeX className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canMute && p.isCameraEnabled && (
                          <button
                            onClick={() => handleMutePeer(p.identity, 'video')}
                            className="p-1.5 text-white/60 hover:text-red-400 hover:bg-white/5 rounded-full cursor-pointer"
                            title="Mute Video"
                          >
                            <VideoOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {isHost && (
                          <button
                            onClick={() => handleKickPeer(p.identity)}
                            className="p-1.5 text-white/60 hover:text-red-400 hover:bg-white/5 rounded-full cursor-pointer"
                            title="Remove User"
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

          {/* Email Invite Box at the bottom */}
          <div className="p-4 border-t border-white/[0.08] bg-[#131417] flex-shrink-0 space-y-3">
            <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-wider flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-[#a8c7fa]" />
              Invite Guest via Email
            </h4>
            <form onSubmit={handleSendInvite} className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="colleague@example.com"
                required
                className="flex-1 bg-[#1e2022] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#a8c7fa]"
                disabled={inviteStatus === 'sending'}
              />
              <button
                type="submit"
                disabled={!emailInput.trim().includes('@') || inviteStatus === 'sending'}
                className="px-4 bg-[#a8c7fa] hover:bg-[#c4eed0] text-[#062e6f] rounded-full font-bold text-xs disabled:opacity-40 transition-all cursor-pointer flex-shrink-0"
              >
                Invite
              </button>
            </form>

            {/* Invite Status overlays */}
            {isSearching && (
              <div className="text-[9px] text-white/40 flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin text-[#a8c7fa]" />
                <span>Searching user records...</span>
              </div>
            )}

            {lookupResult && (
              <div className="p-2.5 bg-[#1e2022] border border-white/5 rounded-xl flex items-center justify-between text-[10px]">
                <div className="truncate pr-2">
                  <span className="font-bold block truncate text-white">{lookupResult.name}</span>
                  <span className="text-white/40">{lookupResult.exists ? 'Registered Member' : 'External Email'}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold border ${
                  lookupResult.exists ? 'bg-[#c4eed0]/10 border-[#c4eed0]/25 text-[#c4eed0]' : 'bg-white/5 border-white/10 text-white/50'
                }`}>
                  {lookupResult.exists ? 'Member' : 'Guest'}
                </span>
              </div>
            )}

            {inviteStatus === 'success' && (
              <div className="text-[10px] text-emerald-400 font-medium">
                ✓ Invitation email sent successfully!
              </div>
            )}
            {inviteStatus === 'error' && (
              <div className="text-[10px] text-red-400">
                ⚠ {inviteError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT: HOST CONTROLS */}
      {activeTab === 'controls' && isHost && (
        <div className="flex-1 overflow-y-auto p-4 space-y-5 bg-[#1e2022] text-left">
          
          <div className="space-y-1 pb-2 border-b border-white/[0.08]">
            <h3 className="text-xs font-bold text-white">Active Moderation Policies</h3>
            <p className="text-[10px] text-white/50">Apply locking rules to this current active room session.</p>
          </div>

          {/* Quick Participant controls */}
          <div className="space-y-3">
            <h4 className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Global Commands</h4>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleMuteAll('audio')}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-[#131417] hover:bg-white/5 text-white border border-white/5 text-[10px] font-bold transition-all cursor-pointer"
              >
                <VolumeX className="w-4 h-4 text-[#a8c7fa]" />
                Mute Mic All
              </button>
              <button
                onClick={() => handleMuteAll('video')}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-[#131417] hover:bg-white/5 text-white border border-white/5 text-[10px] font-bold transition-all cursor-pointer"
              >
                <VideoOff className="w-4 h-4 text-[#a8c7fa]" />
                Cameras Off
              </button>
              <button
                onClick={handleLowerAllHands}
                className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-[#131417] hover:bg-white/5 text-white border border-white/5 text-[10px] font-bold transition-all cursor-pointer"
              >
                <Hand className="w-4 h-4 text-[#fde293]" />
                Lower Hands
              </button>
            </div>
          </div>

          <div className="w-full h-px bg-white/[0.08]" />

          {/* Moderation settings checkboxes */}
          <div className="space-y-4">
            <h4 className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Room Policies</h4>
            
            {/* Lock Room Toggle */}
            <div className="flex items-start space-x-3 p-3.5 bg-[#131417] border border-white/10 rounded-[20px]">
              <input
                type="checkbox"
                id="host-lock-room"
                checked={!!currentMeeting?.is_locked}
                onChange={handleToggleRoomLock}
                className="rounded border-white/20 bg-white/5 text-[#a8c7fa] focus:ring-0 w-4 h-4 mt-0.5 cursor-pointer accent-[#a8c7fa]"
              />
              <div className="flex-1">
                <label htmlFor="host-lock-room" className="text-xs font-bold text-white select-none cursor-pointer flex items-center gap-1.5">
                  {currentMeeting?.is_locked ? <Lock className="w-3.5 h-3.5 text-[#f2b8b5]" /> : <Unlock className="w-3.5 h-3.5 text-[#c4eed0]" />}
                  Lock Meeting Room
                </label>
                <p className="text-[10px] text-white/50 leading-normal mt-0.5">
                  Stops any new participants from entering the meeting lobby or waiting room.
                </p>
              </div>
            </div>

            {/* Lock Chat Toggle */}
            <div className="flex items-start space-x-3 p-3.5 bg-[#131417] border border-white/10 rounded-[20px]">
              <input
                type="checkbox"
                id="host-lock-chat"
                checked={!!isChatLocked}
                onChange={() => signalingClient.sendModerationPolicy({ isChatLocked: !isChatLocked })}
                className="rounded border-white/20 bg-white/5 text-[#a8c7fa] focus:ring-0 w-4 h-4 mt-0.5 cursor-pointer accent-[#a8c7fa]"
              />
              <div className="flex-1">
                <label htmlFor="host-lock-chat" className="text-xs font-bold text-white select-none cursor-pointer flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-[#a8c7fa]" />
                  Lock Participant Chat
                </label>
                <p className="text-[10px] text-white/50 leading-normal mt-0.5">
                  Prevents non-hosts from posting messages or questions in the meeting chat window.
                </p>
              </div>
            </div>

            {/* Lock Screen Share Toggle */}
            <div className="flex items-start space-x-3 p-3.5 bg-[#131417] border border-white/10 rounded-[20px]">
              <input
                type="checkbox"
                id="host-lock-screen"
                checked={!!isScreenShareLocked}
                onChange={() => signalingClient.sendModerationPolicy({ isScreenShareLocked: !isScreenShareLocked })}
                className="rounded border-white/20 bg-white/5 text-[#a8c7fa] focus:ring-0 w-4 h-4 mt-0.5 cursor-pointer accent-[#a8c7fa]"
              />
              <div className="flex-1">
                <label htmlFor="host-lock-screen" className="text-xs font-bold text-white select-none cursor-pointer flex items-center gap-1.5">
                  <MonitorOff className="w-3.5 h-3.5 text-[#a8c7fa]" />
                  Lock Screen Sharing
                </label>
                <p className="text-[10px] text-white/50 leading-normal mt-0.5">
                  Only allows meeting hosts to share their screen. Blocks other participants.
                </p>
              </div>
            </div>

            {/* Enable Cursors Toggle */}
            <div className="flex items-start space-x-3 p-3.5 bg-[#131417] border border-white/10 rounded-[20px]">
              <input
                type="checkbox"
                id="host-cursors"
                checked={!!isMultiplayerCursorEnabled}
                onChange={() => signalingClient.sendMultiplayerCursorsToggle(!isMultiplayerCursorEnabled)}
                className="rounded border-white/20 bg-white/5 text-[#a8c7fa] focus:ring-0 w-4 h-4 mt-0.5 cursor-pointer accent-[#a8c7fa]"
              />
              <div className="flex-1">
                <label htmlFor="host-cursors" className="text-xs font-bold text-white select-none cursor-pointer flex items-center gap-1.5">
                  <MousePointer className="w-3.5 h-3.5 text-[#ffd6f8]" />
                  Multiplayer Cursors
                </label>
                <p className="text-[10px] text-white/50 leading-normal mt-0.5">
                  Shows live cursor indicators of other participants over active screenshares.
                </p>
              </div>
            </div>

            {/* Breakout Rooms Trigger button */}
            {onBreakoutClick && (
              <div className="p-3.5 bg-[#131417] border border-white/10 rounded-[20px] space-y-2">
                <div className="flex items-start space-x-2">
                  <Users className="w-4 h-4 mt-0.5 text-[#a8c7fa]" />
                  <div>
                    <h5 className="text-xs font-bold text-white">Split Meeting into Breakout Rooms</h5>
                    <p className="text-[10px] text-white/50 leading-normal mt-0.5">
                      Distribute active callers into smaller sub-rooms for focused workshops.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onBreakoutClick}
                  className="w-full py-2 bg-[#a8c7fa] text-[#062e6f] rounded-full text-xs font-bold transition-all cursor-pointer"
                >
                  Configure Breakout Rooms
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

// Safe wrapper hook to handle cases when we are outside a RoomContext safely
function useRoomLocalParticipant() {
  try {
    return useLocalParticipant();
  } catch(e) {
    return { localParticipant: null };
  }
}

export default ParticipantPanel;
