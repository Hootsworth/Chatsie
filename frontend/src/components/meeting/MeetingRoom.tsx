import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useMeetingStore } from '../../stores/meetingStore';
import type { Meeting } from '../../stores/meetingStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import supabase from '../../services/supabase';
import { signalingClient } from '../../services/signaling';
import { PasswordPrompt } from './PasswordPrompt';
import { WaitingRoom } from './WaitingRoom';
import { VideoGrid } from './VideoGrid';
import { MeetingControls } from './MeetingControls';
import { ChatPanel } from './ChatPanel';
import { ParticipantPanel } from './ParticipantPanel';
import { TranscriptionPanel } from './TranscriptionPanel';
import { ReactionOverlay } from './ReactionOverlay';
import { Modal, Button } from '../ui';
import { DeviceSelector } from './DeviceSelector';
import { Copy, Check, Info, Users, Keyboard, Mic, MicOff, Video, VideoOff, Camera, User } from 'lucide-react';

export const MeetingRoom: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  
  const { user, profile } = useAuthStore();
  const {
    currentMeeting,
    myRole,
    participants,
    waitingStatus,
    isPasscodeGateRequired,
    isPasscodeGatePassed,
    isChatPanelOpen,
    isParticipantsPanelOpen,
    isTranscriptionPanelOpen,
    isSettingsOpen,
    isShortcutsOpen,
    setCurrentMeeting,
    setMyRole,
    setWaitingStatus,
    setPasscodeGateRequired,
    setPasscodeGatePassed,
    setSettingsOpen,
    setShortcutsOpen,
    resetMeetingState,
    setChatMessages,
    addOrUpdateTranscript
  } = useMeetingStore();

  const {
    localStream,
    screenShareStream,
    isScreenSharing,
    isMutedAudio,
    isMutedVideo,
    remoteStreams,
    activeSpeaker,
    connectionQuality,
    resetWebRTCState,
    selectedAudioInput,
    selectedVideoInput,
    selectedAudioOutput,
    setAudioMute,
    setVideoMute,
    setDevices,
    setSelectedAudioInput,
    setSelectedVideoInput,
    setSelectedAudioOutput,
    showCaptions
  } = useWebRTCStore();

  const [isLoadingMeeting, setIsLoadingMeeting] = useState(true);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  // Pre-join Lobby states and refs
  const [isLobbyPassed, setIsLobbyPassed] = useState(() => {
    if (!code) return false;
    return sessionStorage.getItem(`lobby_passed_${code}`) === 'true';
  });
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
  const lobbyVideoRef = React.useCallback((node: HTMLVideoElement | null) => {
    if (node && lobbyStream) {
      node.srcObject = lobbyStream;
    }
  }, [lobbyStream]);

  // Helper to fetch devices inside the lobby
  const getDevicesForLobby = async () => {
    try {
      if (!navigator.mediaDevices) {
        console.warn('navigator.mediaDevices is not supported in this context.');
        return;
      }

      // Try requesting both permissions, fallback if device is missing
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch (err) {
        console.warn('Lobby: Failed to get both audio and video, trying audio-only...', err);
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err2) {
          console.warn('Lobby: Failed audio-only, trying video-only...', err2);
          try {
            await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (err3) {
            console.warn('Lobby: Failed all media permission attempts. Listing default labels.', err3);
          }
        }
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audio: any[] = [];
      const video: any[] = [];
      const speaker: any[] = [];
      
      devices.forEach(device => {
        const payload = { deviceId: device.deviceId, label: device.label || `${device.kind} (Default)` };
        if (device.kind === 'audioinput') audio.push(payload);
        else if (device.kind === 'videoinput') video.push(payload);
        else if (device.kind === 'audiooutput') speaker.push(payload);
      });
      
      setDevices(audio, video, speaker);
      
      // Auto select first device if none is selected
      if (audio.length > 0 && !selectedAudioInput) {
        setSelectedAudioInput(audio[0].deviceId);
      }
      if (video.length > 0 && !selectedVideoInput) {
        setSelectedVideoInput(video[0].deviceId);
      }
      if (speaker.length > 0 && !selectedAudioOutput) {
        setSelectedAudioOutput(speaker[0].deviceId);
      }
    } catch (error) {
      console.error('Error fetching media devices in lobby:', error);
    }
  };

  // Lobby stream setup
  useEffect(() => {
    if (isLobbyPassed || isLoadingMeeting || meetingError || (isPasscodeGateRequired && !isPasscodeGatePassed)) return;

    let active = true;
    let streamInstance: MediaStream | null = null;

    const startLobbyPreview = async () => {
      // Stop previous tracks first
      if (lobbyStream) {
        lobbyStream.getTracks().forEach(track => track.stop());
      }

      try {
        const videoConstraints: MediaTrackConstraints = {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 24 }
        };
        if (selectedVideoInput) {
          videoConstraints.deviceId = { exact: selectedVideoInput };
        }

        const audioConstraints: MediaTrackConstraints = {};
        if (selectedAudioInput) {
          audioConstraints.deviceId = { exact: selectedAudioInput };
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        });

        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        // Apply initial mute states on tracks
        stream.getAudioTracks().forEach(track => {
          track.enabled = !isMutedAudio;
        });
        stream.getVideoTracks().forEach(track => {
          track.enabled = !isMutedVideo;
        });

        streamInstance = stream;
        setLobbyStream(stream);
      } catch (err) {
        console.error('Failed to get lobby preview stream:', err);
      }
    };

    getDevicesForLobby().then(() => {
      startLobbyPreview();
    });

    return () => {
      active = false;
      if (streamInstance) {
        streamInstance.getTracks().forEach(track => track.stop());
      }
    };
  }, [selectedVideoInput, selectedAudioInput, isLobbyPassed, isLoadingMeeting, meetingError, isPasscodeGateRequired, isPasscodeGatePassed]);



  const handleToggleLobbyAudio = () => {
    const nextState = !isMutedAudio;
    setAudioMute(nextState);
    if (lobbyStream) {
      lobbyStream.getAudioTracks().forEach(track => {
        track.enabled = !nextState;
      });
    }
  };

  const handleToggleLobbyVideo = () => {
    const nextState = !isMutedVideo;
    setVideoMute(nextState);
    if (lobbyStream) {
      lobbyStream.getVideoTracks().forEach(track => {
        track.enabled = !nextState;
      });
    }
  };

  const handleJoinCall = () => {
    if (lobbyStream) {
      lobbyStream.getTracks().forEach(track => track.stop());
      setLobbyStream(null);
    }
    setIsLobbyPassed(true);
    if (code) {
      sessionStorage.setItem(`lobby_passed_${code}`, 'true');
    }
  };

  // Invoke WebRTC Hook (only once security criteria are met: passcode verified AND lobby passed)
  const shouldConnectWebRTC = 
    currentMeeting && 
    isPasscodeGatePassed && 
    isLobbyPassed;

  const webrtc = useWebRTC(
    shouldConnectWebRTC ? code || '' : '',
    user?.id || 'guest-' + Math.random().toString(36).substring(2, 8),
    profile?.full_name || 'Guest User'
  );

  const {
    toggleAudio,
    toggleVideo,
    toggleScreenShare
  } = webrtc;

  // Speech Recognition hook for transcribing local mic inputs
  useSpeechRecognition(isMutedAudio, showCaptions);

  // State to track active captions for all speakers
  const [activeCaptions, setActiveCaptions] = useState<Record<string, { username: string; text: string; timestamp: number }>>({});

  // State for floating emoji reactions
  const [reactionList, setReactionList] = useState<Array<{ id: string; emoji: string }>>([]);

  // Caption listener for remote speaker captions
  useEffect(() => {
    if (!shouldConnectWebRTC) return;

    const handleCaption = ({ senderId, username, text, isFinal }: { senderId: string; username: string; text: string; isFinal: boolean }) => {
      // 1. Update transient overlay captions
      setActiveCaptions(prev => ({
        ...prev,
        [senderId]: {
          username,
          text,
          timestamp: Date.now()
        }
      }));

      // 2. Update persistent transcript log
      addOrUpdateTranscript(senderId, username, text, isFinal);
    };

    signalingClient.on('caption', handleCaption);

    // Setup interval to prune old captions after 5 seconds of silence
    const interval = setInterval(() => {
      const now = Date.now();
      setActiveCaptions(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(key => {
          if (now - next[key].timestamp > 5000) {
            delete next[key];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);

    return () => {
      signalingClient.off('caption', handleCaption);
      clearInterval(interval);
    };
  }, [shouldConnectWebRTC]);

  // Reaction listener — listens for emoji reactions from all peers
  useEffect(() => {
    if (!shouldConnectWebRTC) return;

    const handleReaction = ({ senderId, type }: { senderId: string; type: string }) => {
      setReactionList(prev => [
        ...prev,
        { id: `${senderId}-${Date.now()}-${Math.random()}`, emoji: type }
      ]);
    };

    signalingClient.on('reaction', handleReaction);
    return () => {
      signalingClient.off('reaction', handleReaction);
    };
  }, [shouldConnectWebRTC]);

  // Keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts if user is typing in a form input or chat input
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      
      if (key === 'm') {
        e.preventDefault();
        toggleAudio();
      } else if (key === 'v') {
        e.preventDefault();
        toggleVideo();
      } else if (key === 's') {
        e.preventDefault();
        toggleScreenShare();
      } else if (key === 'c') {
        e.preventDefault();
        const chatBtn = document.querySelector('[title="Meeting Chat"]') as HTMLButtonElement;
        chatBtn?.click();
      } else if (key === 'p') {
        e.preventDefault();
        const partBtn = document.querySelector('[title="Participants List"]') as HTMLButtonElement;
        partBtn?.click();
      } else if (key === 'h') {
        e.preventDefault();
        const handBtn = document.querySelector('[title="Lower Hand"], [title="Raise Hand"]') as HTMLButtonElement;
        handBtn?.click();
      } else if (key === 'escape') {
        setSettingsOpen(false);
        setShortcutsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleAudio, toggleVideo, toggleScreenShare, setSettingsOpen, setShortcutsOpen]);

  // Load meeting metadata
  useEffect(() => {
    if (!code) return;
    resetMeetingState();

    const loadMeeting = async () => {
      setIsLoadingMeeting(true);
      setMeetingError(null);
      
      try {
        const { data: meeting, error: dbError } = await supabase
          .from('meetings')
          .select('*')
          .eq('code', code)
          .maybeSingle();

        if (dbError) throw dbError;

        if (!meeting) {
          setMeetingError('Meeting not found. Please verify the code.');
          setIsLoadingMeeting(false);
          return;
        }

        setCurrentMeeting(meeting as Meeting);

        // Determine if user is host or participant
        const isUserHost = user && meeting.host_id === user.id;
        const resolvedRole = isUserHost ? 'host' : 'participant';
        setMyRole(resolvedRole);

        // Check if passcode is required
        if (meeting.passcode && !isUserHost) {
          setPasscodeGateRequired(true);
          const wasPasscodePassed = sessionStorage.getItem(`passcode_passed_${code}`) === 'true';
          setPasscodeGatePassed(wasPasscodePassed);
        } else {
          setPasscodeGateRequired(false);
          setPasscodeGatePassed(true);
        }

        // Check if waiting room is needed
        if (meeting.is_waiting_room_enabled && !isUserHost) {
          const wasWaitingStatusApproved = sessionStorage.getItem(`waiting_status_approved_${code}`) === 'true';
          setWaitingStatus(wasWaitingStatusApproved ? 'approved' : 'waiting');
        } else {
          setWaitingStatus('none');
        }

        // Load persistent chat history from Supabase
        const { data: messages, error: msgError } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('meeting_id', meeting.id)
          .order('created_at', { ascending: true });

        if (msgError) {
          console.warn('Could not fetch chat history:', msgError);
        } else if (messages) {
          const chatMsgs = messages.map(m => ({
            id: m.id,
            senderId: m.user_id || 'guest',
            userId: m.user_id || 'guest',
            username: m.sender_name,
            text: m.message,
            timestamp: new Date(m.created_at).getTime()
          }));
          setChatMessages(chatMsgs);
        }

      } catch (err: any) {
        console.error('Error loading meeting details:', err);
        setMeetingError(err.message || 'Failed to connect to database.');
      } finally {
        setIsLoadingMeeting(false);
      }
    };

    loadMeeting();
  }, [code, user]);

  // Handle incoming unread chat notification
  useEffect(() => {
    if (useMeetingStore.getState().chatMessages.length > 0 && !isChatPanelOpen) {
      setHasUnreadChat(true);
    }
  }, [useMeetingStore.getState().chatMessages.length, isChatPanelOpen]);




  // Handle Leave Meeting
  const handleLeaveMeeting = async () => {
    const confirmLeave = window.confirm(
      myRole === 'host' 
        ? 'Do you want to end this meeting for all participants?' 
        : 'Are you sure you want to leave this meeting?'
    );

    if (!confirmLeave) return;

    if (myRole === 'host') {
      // Host closes room in signaling server
      const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
      if (provider === 'socketio') {
        // Kick everyone
        participants.forEach(p => {
          // @ts-ignore
          signalingClient.kickPeerInRoom(code || '', p.socketId);
        });
      } else {
        participants.forEach(p => {
          signalingClient.kickPeer(p.socketId);
        });
      }

      // Close room in db
      try {
        await supabase
          .from('meetings')
          .update({ is_active: false })
          .eq('code', code || '');
      } catch (e) {
        console.error(e);
      }
    }

    // Stop streams & clean up
    if (code) {
      sessionStorage.removeItem(`lobby_passed_${code}`);
      sessionStorage.removeItem(`passcode_passed_${code}`);
      sessionStorage.removeItem(`waiting_status_approved_${code}`);
    }
    resetWebRTCState();
    resetMeetingState();
    navigate('/');
  };

  const handleCopyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setHasCopiedCode(true);
    setTimeout(() => setHasCopiedCode(false), 2000);
  };

  // 1. Loading State
  if (isLoadingMeeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-dark text-on-dark-soft">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-bold tracking-wide">Connecting to room...</span>
        </div>
      </div>
    );
  }

  // 2. Error State
  if (meetingError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-dark text-center px-4">
        <div className="max-w-md space-y-4">
          <div className="text-red-500 text-3xl">⚠️</div>
          <h2 className="text-lg font-black text-on-dark">{meetingError}</h2>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary hover:bg-primary-active text-white rounded-lg text-sm font-bold shadow-md transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // 3. Passcode Gate Prompt
  if (isPasscodeGateRequired && !isPasscodeGatePassed) {
    return (
      <PasswordPrompt 
        meetingCode={code || ''} 
        onSuccess={() => {
          setPasscodeGatePassed(true);
          if (code) {
            sessionStorage.setItem(`passcode_passed_${code}`, 'true');
          }
        }} 
      />
    );
  }

  // 4. Pre-Join Lobby View
  if (!isLobbyPassed) {
    return (
      <div className="min-h-screen bg-canvas text-body font-sans transition-colors duration-200 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-surface-card border border-hairline rounded-2xl shadow-sm p-6 md:p-10 space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-serif text-ink tracking-tight font-normal leading-tight">
              Ready to join?
            </h1>
            <p className="text-sm text-muted">
              Configure your hardware and check your video preview before entering the meeting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
            {/* Left: Video Preview & Onscreen toggles */}
            <div className="space-y-4">
              <div className="relative aspect-video rounded-xl bg-surface-dark overflow-hidden border border-hairline flex items-center justify-center shadow-inner">
                {lobbyStream && !isMutedVideo ? (
                  <video
                    ref={lobbyVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center space-y-3.5 z-0 select-none text-on-dark-soft">
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center border border-primary/20 shadow-inner">
                      <User className="w-8 h-8" />
                    </div>
                    <span className="text-xs font-bold bg-black/30 px-2.5 py-1 rounded-md backdrop-blur-sm">
                      Camera is off
                    </span>
                  </div>
                )}

                {/* On-screen mic/video indicators */}
                <div className="absolute bottom-3 left-3 flex items-center space-x-2 z-10">
                  <div className={`p-1.5 rounded-lg border text-white backdrop-blur-sm ${
                    isMutedAudio ? 'bg-red-500/80 border-red-400/30' : 'bg-black/40 border-white/10'
                  }`}>
                    {isMutedAudio ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </div>
                  <div className={`p-1.5 rounded-lg border text-white backdrop-blur-sm ${
                    isMutedVideo ? 'bg-red-500/80 border-red-400/30' : 'bg-black/40 border-white/10'
                  }`}>
                    {isMutedVideo ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex justify-center space-x-4">
                <button
                  onClick={handleToggleLobbyAudio}
                  className={`flex items-center justify-center p-3.5 rounded-xl border transition-all duration-200 focus:outline-none cursor-pointer ${
                    isMutedAudio
                      ? 'bg-red-500/10 border-red-200 text-red-600 hover:bg-red-500/20 shadow-sm shadow-red-500/5'
                      : 'bg-canvas border-hairline text-body hover:bg-surface-soft'
                  }`}
                  title={isMutedAudio ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMutedAudio ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <button
                  onClick={handleToggleLobbyVideo}
                  className={`flex items-center justify-center p-3.5 rounded-xl border transition-all duration-200 focus:outline-none cursor-pointer ${
                    isMutedVideo
                      ? 'bg-red-500/10 border-red-200 text-red-600 hover:bg-red-500/20 shadow-sm shadow-red-500/5'
                      : 'bg-canvas border-hairline text-body hover:bg-surface-soft'
                  }`}
                  title={isMutedVideo ? 'Turn camera on' : 'Turn camera off'}
                >
                  {isMutedVideo ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Right: Device configurations & Join CTA */}
            <div className="space-y-6 flex flex-col justify-between h-full min-h-[220px]">
              <div className="space-y-4">
                <div className="bg-surface-soft border border-hairline/60 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-1">Joining As</span>
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                      {profile?.full_name?.charAt(0).toUpperCase() || 'G'}
                    </div>
                    <span className="text-sm font-bold text-ink">{profile?.full_name || 'Guest User'}</span>
                  </div>
                </div>

                <div className="border border-hairline/60 rounded-xl p-4 bg-canvas space-y-4">
                  <h3 className="font-serif text-lg font-normal text-ink flex items-center border-b border-hairline pb-2">
                    <Camera className="w-4 h-4 mr-2 text-primary" /> Audio & Video Settings
                  </h3>
                  <DeviceSelector />
                </div>
              </div>

              <button
                onClick={handleJoinCall}
                className="w-full mt-4 bg-primary hover:bg-primary-active text-white text-sm font-bold py-3.5 px-6 rounded-xl transition-all duration-200 shadow-md shadow-primary/10 active:scale-[0.98] focus:outline-none flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Join Meeting</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 5. Waiting Room Queue
  if (waitingStatus === 'waiting') {
    return <WaitingRoom meetingTitle={currentMeeting?.title || 'Meeting'} />;
  }

  if (waitingStatus === 'denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-dark text-center px-4">
        <div className="max-w-md space-y-4">
          <div className="text-red-500 text-3xl">🚫</div>
          <h2 className="text-lg font-black text-on-dark">Entry Denied</h2>
          <p className="text-sm text-on-dark-soft">The meeting host did not approve your entry request.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold shadow-md hover:bg-primary-active"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // 5. Active Call Room Layout
  return (
    <div className="h-screen flex flex-col bg-surface-dark text-on-dark overflow-hidden font-sans transition-colors duration-200">
      
      {/* Floating Emoji Reaction Overlay */}
      <ReactionOverlay reactions={reactionList} />
      
      {/* Room Header bar */}
      <header className="bg-surface-dark-elevated border-b border-white/5 px-6 py-3 flex items-center justify-between z-35">
        <div className="flex items-center space-x-3 truncate">
          <div className="flex items-center space-x-2 text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded-md">
            <Info className="w-3.5 h-3.5" />
            <span className="truncate max-w-[200px]">{currentMeeting?.title}</span>
          </div>
          <div className="hidden md:flex items-center space-x-1.5 text-xs text-on-dark-soft font-bold bg-surface-dark-soft px-2 py-1 rounded-md">
            <span>{code}</span>
            <button
              onClick={handleCopyRoomLink}
              className="p-0.5 hover:text-primary rounded transition-colors"
              title="Copy meeting link"
            >
              {hasCopiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-3.5 text-xs font-bold text-on-dark-soft">
          <button
            onClick={() => setShortcutsOpen(true)}
            className="flex items-center space-x-1 hover:text-on-dark p-1 rounded-md hover:bg-surface-dark-soft transition-all"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="w-4 h-4" />
            <span className="hidden sm:inline">Shortcuts</span>
          </button>
          <div className="flex items-center space-x-1 bg-surface-dark-soft px-2.5 py-1 rounded-md">
            <Users className="w-3.5 h-3.5" />
            <span>{participants.length + 1} active</span>
          </div>
        </div>
      </header>

      {/* Main conference body (grid + sidebars) */}
      <div className="flex-grow flex relative min-h-0 bg-surface-dark">
        
        {/* Central area: Video grid */}
        <div className="flex-grow flex flex-col min-h-0 overflow-y-auto no-scrollbar relative">
          <VideoGrid
            localStream={localStream}
            screenShareStream={screenShareStream}
            isScreenSharing={isScreenSharing}
            remoteStreams={remoteStreams}
            participants={participants}
            myUsername={profile?.full_name || 'Guest User'}
            isMutedAudio={isMutedAudio}
            isMutedVideo={isMutedVideo}
            isHandRaised={false} // Hand status managed via button and state hook
            activeSpeaker={activeSpeaker}
            connectionQuality={connectionQuality}
          />

          {/* Live Captions Overlay */}
          {showCaptions && Object.keys(activeCaptions).length > 0 && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-25 max-w-2xl w-full px-4 space-y-2 pointer-events-none select-none">
              {Object.values(activeCaptions).map((caption, idx) => (
                <div
                  key={idx}
                  className="bg-black/75 backdrop-blur-sm border border-white/10 px-4 py-2.5 rounded-xl text-center shadow-lg transition-all duration-300 animate-in fade-in slide-in-from-bottom-2"
                >
                  <span className="text-primary font-bold text-xs mr-2">{caption.username}:</span>
                  <span className="text-white text-sm font-medium">{caption.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar panels */}
        {isChatPanelOpen && (
          <div className="w-full md:w-80 flex-shrink-0 animate-in slide-in-from-right duration-250 z-20">
            <ChatPanel 
              roomId={code || ''} 
              userId={user?.id || ''} 
              username={profile?.full_name || 'Guest User'} 
            />
          </div>
        )}

        {isParticipantsPanelOpen && (
          <div className="w-full md:w-80 flex-shrink-0 animate-in slide-in-from-right duration-250 z-20">
            <ParticipantPanel roomId={code || ''} />
          </div>
        )}

        {isTranscriptionPanelOpen && (
          <div className="w-full md:w-80 flex-shrink-0 animate-in slide-in-from-right duration-250 z-20">
            <TranscriptionPanel />
          </div>
        )}
      </div>

      {/* Bottom meeting control bar */}
      <MeetingControls
        toggleAudio={toggleAudio}
        toggleVideo={toggleVideo}
        toggleScreenShare={toggleScreenShare}
        onLeave={handleLeaveMeeting}
        hasUnreadMessages={hasUnreadChat}
        markChatRead={() => setHasUnreadChat(false)}
      />

      {/* DEVICE CONFIG MODAL */}
      <Modal
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Device Hardware Configuration"
      >
        <DeviceSelector />
        <div className="mt-6 flex justify-end">
          <Button onClick={() => setSettingsOpen(false)}>Done</Button>
        </div>
      </Modal>

      {/* KEYBOARD SHORTCUTS MODAL */}
      <Modal
        isOpen={isShortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        title="Keyboard Shortcuts Guide"
      >
        <div className="space-y-4 text-xs font-semibold py-2">
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-muted">Toggle Microphone</span>
            <kbd className="px-2 py-0.5 bg-surface-card border border-hairline rounded-md text-ink">M</kbd>
          </div>
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-muted">Toggle Video Camera</span>
            <kbd className="px-2 py-0.5 bg-surface-card border border-hairline rounded-md text-ink">V</kbd>
          </div>
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-muted">Toggle Screen Share</span>
            <kbd className="px-2 py-0.5 bg-surface-card border border-hairline rounded-md text-ink">S</kbd>
          </div>
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-muted">Toggle Chat Panel</span>
            <kbd className="px-2 py-0.5 bg-surface-card border border-hairline rounded-md text-ink">C</kbd>
          </div>
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-muted">Toggle Participants List</span>
            <kbd className="px-2 py-0.5 bg-surface-card border border-hairline rounded-md text-ink">P</kbd>
          </div>
          <div className="flex justify-between pb-1">
            <span className="text-muted">Raise / Lower Hand</span>
            <kbd className="px-2 py-0.5 bg-surface-card border border-hairline rounded-md text-ink">H</kbd>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => setShortcutsOpen(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
};
export default MeetingRoom;
