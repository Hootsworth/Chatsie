import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { useMeetingStore } from '../../stores/meetingStore';
import type { Meeting } from '../../stores/meetingStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { applyVirtualBackgroundToStream } from '../../utils/mediaProcessors';
import { playSynthesizedSound, SOUND_DEFINITIONS } from '../../utils/soundSynthesizer';

import { signalingClient } from '../../services/signaling';
import { LiveKitRoom, useLocalParticipant, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';
import { createPortal } from 'react-dom';
import { PasswordPrompt } from './PasswordPrompt';
import { WaitingRoom } from './WaitingRoom';
import { VideoGrid } from './VideoGrid';
import { MeetingControls } from './MeetingControls';
import { ChatPanel } from './ChatPanel';
import { ParticipantPanel } from './ParticipantPanel';
import { TranscriptionPanel } from './TranscriptionPanel';
import { ReactionOverlay } from './ReactionOverlay';
import { WhiteboardPanel } from './WhiteboardPanel';
import { BreakoutModal } from './BreakoutModal';
import { Modal, Button } from '../ui';
import { DeviceSelector } from './DeviceSelector';
import { Copy, Check, Info, Users, Keyboard, Mic, MicOff, Video, VideoOff, Camera, User, ExternalLink, Lock, Unlock, Mail, Loader2, Settings } from 'lucide-react';

export const MeetingRoom: React.FC = () => {
  const { code: rawCode } = useParams<{ code: string }>();
  const code = rawCode?.trim().toLowerCase() || '';
  const navigate = useNavigate();
  
  const { user } = useUser();
  const { getToken } = useAuth();
  const {
    currentMeeting,
    myRole,
    participants,
    waitingStatus,
    isPasscodeGateRequired,
    isPasscodeGatePassed,
    setCurrentMeeting,
    setMyRole,
    setWaitingStatus,
    setPasscodeGateRequired,
    setPasscodeGatePassed,
    resetMeetingState,
    setChatMessages,
    setWaitingRoomList
  } = useMeetingStore();

  const {
    isMutedAudio,
    isMutedVideo,
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
    showCaptions,
    isNoiseSuppressionEnabled,
    virtualBackgroundMode
  } = useWebRTCStore();

  const [isLoadingMeeting, setIsLoadingMeeting] = useState(true);
  const [meetingError, setMeetingError] = useState<string | null>(null);

  const [guestUsername, setGuestUsername] = useState(() => {
    return sessionStorage.getItem(`guest_username_${code}`) || '';
  });
  const [guestId] = useState(() => {
    let id = sessionStorage.getItem(`guest_id_${code}`);
    if (!id) {
      id = 'guest-' + Math.random().toString(36).substring(2, 8);
      sessionStorage.setItem(`guest_id_${code}`, id);
    }
    return id;
  });

  // Pre-join Lobby states and refs
  const [isLobbyPassed, setIsLobbyPassed] = useState(() => {
    if (!code) return false;
    return sessionStorage.getItem(`lobby_passed_${code}`) === 'true';
  });
  const [isLobbySettingsOpen, setIsLobbySettingsOpen] = useState(false);
  const [lobbyStream, setLobbyStream] = useState<MediaStream | null>(null);
  const lobbyStreamRef = React.useRef<MediaStream | null>(null);

  // Sync ref with state
  React.useEffect(() => {
    lobbyStreamRef.current = lobbyStream;
  }, [lobbyStream]);

  // Guaranteed unmount cleanup
  React.useEffect(() => {
    return () => {
      if (lobbyStreamRef.current) {
        lobbyStreamRef.current.getTracks().forEach(track => track.stop());
        lobbyStreamRef.current = null;
      }
    };
  }, []);

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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.warn('Lobby: Failed to get both audio and video, trying audio-only...', err);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (err2) {
          console.warn('Lobby: Failed audio-only, trying video-only...', err2);
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
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
    if (isLobbyPassed || isLoadingMeeting || meetingError || (isPasscodeGateRequired && !isPasscodeGatePassed)) {
      if (lobbyStream) {
        lobbyStream.getTracks().forEach(track => track.stop());
        setLobbyStream(null);
      }
      return;
    }

    let active = true;
    let streamInstance: MediaStream | null = null;

    const startLobbyPreview = async () => {
      // Stop previous tracks first
      if (lobbyStream) {
        lobbyStream.getTracks().forEach(track => track.stop());
      }

      // If both are muted, we don't request any stream
      if (isMutedVideo && isMutedAudio) {
        setLobbyStream(null);
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {};

        if (!isMutedVideo) {
          const videoConstraints: MediaTrackConstraints = {
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 24 }
          };
          if (selectedVideoInput) {
            videoConstraints.deviceId = { exact: selectedVideoInput };
          }
          constraints.video = videoConstraints;
        } else {
          constraints.video = false;
        }

        if (!isMutedAudio) {
          const audioConstraints: MediaTrackConstraints = {};
          if (selectedAudioInput) {
            audioConstraints.deviceId = { exact: selectedAudioInput };
          }
          if (isNoiseSuppressionEnabled) {
            audioConstraints.noiseSuppression = true;
            audioConstraints.echoCancellation = true;
            audioConstraints.autoGainControl = true;
          }
          constraints.audio = audioConstraints;
        } else {
          constraints.audio = false;
        }

        let stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        if (constraints.video && virtualBackgroundMode !== 'none') {
          stream = await applyVirtualBackgroundToStream(stream, virtualBackgroundMode);
        }

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
  }, [
    selectedVideoInput,
    selectedAudioInput,
    isLobbyPassed,
    isLoadingMeeting,
    meetingError,
    isPasscodeGateRequired,
    isPasscodeGatePassed,
    isMutedVideo,
    isMutedAudio,
    isNoiseSuppressionEnabled,
    virtualBackgroundMode
  ]);

  const handleToggleLobbyAudio = () => {
    const nextState = !isMutedAudio;
    setAudioMute(nextState);
    if (code) {
      sessionStorage.setItem(`meeting_audio_muted_${code}`, String(nextState));
    }
  };

  const handleToggleLobbyVideo = () => {
    const nextState = !isMutedVideo;
    setVideoMute(nextState);
    if (code) {
      sessionStorage.setItem(`meeting_video_muted_${code}`, String(nextState));
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

  // LiveKit Integration
  const [activeRoomName, setActiveRoomName] = useState(code);
  const [liveKitToken, setLiveKitToken] = useState<string | null>(null);

  useEffect(() => {
    setActiveRoomName(code);
  }, [code]);

  const shouldConnectWebRTC = 
    currentMeeting && 
    isPasscodeGatePassed && 
    isLobbyPassed;

  useEffect(() => {
    if (shouldConnectWebRTC && !liveKitToken) {
      const fetchToken = async () => {
        try {
          const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
          let token = null;
          try {
            token = await getToken();
          } catch (e) {}
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${backendUrl}/api/livekit/token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              roomName: activeRoomName,
              participantIdentity: user?.id || guestId,
              participantName: user?.fullName || guestUsername || 'Guest User'
            })
          });
          const data = await res.json();
          if (data.token) {
            setLiveKitToken(data.token);
          }
        } catch (err) {
          console.error("Failed to fetch LiveKit token", err);
        }
      };
      fetchToken();
    }
  }, [shouldConnectWebRTC, liveKitToken, activeRoomName, user, guestId, guestUsername]);

  // Connect to custom signaling socket (Socket.IO / Supabase Realtime)
  useEffect(() => {
    if (!code || isLoadingMeeting || meetingError || (isPasscodeGateRequired && !isPasscodeGatePassed)) {
      return;
    }

    const handleWaitingStatus = ({ status }: any) => {
      setWaitingStatus(status);
      if (status === 'approved') {
        sessionStorage.setItem(`waiting_status_approved_${code}`, 'true');
      }
    };

    const handleKickedCommand = () => {
      sessionStorage.removeItem(`lobby_passed_${code}`);
      sessionStorage.removeItem(`passcode_passed_${code}`);
      sessionStorage.removeItem(`waiting_status_approved_${code}`);
      navigate(`/kicked?room=${code}`);
    };

    const handleWaitingRoomListUpdate = ({ participants }: any) => {
      setWaitingRoomList(participants);
    };

    const handleRoomLockToggled = ({ isLocked }: { isLocked: boolean }) => {
      setCurrentMeeting(
        useMeetingStore.getState().currentMeeting
          ? { ...useMeetingStore.getState().currentMeeting!, is_locked: isLocked }
          : null
      );
    };

    signalingClient.on('waiting-status', handleWaitingStatus);
    signalingClient.on('kicked-command', handleKickedCommand);
    signalingClient.on('waiting-room-list-update', handleWaitingRoomListUpdate);
    signalingClient.on('room-lock-toggled', handleRoomLockToggled);

    const isUserWaiting = waitingStatus === 'waiting';

    signalingClient.connect(code, {
      userId: user?.id || guestId,
      username: user?.fullName || guestUsername || 'Guest User',
      role: myRole,
      isWaiting: isUserWaiting
    });

    return () => {
      signalingClient.off('waiting-status', handleWaitingStatus);
      signalingClient.off('kicked-command', handleKickedCommand);
      signalingClient.off('waiting-room-list-update', handleWaitingRoomListUpdate);
      signalingClient.off('room-lock-toggled', handleRoomLockToggled);
      signalingClient.disconnect();
    };
  }, [
    code,
    isLoadingMeeting,
    meetingError,
    isPasscodeGateRequired,
    isPasscodeGatePassed,
    waitingStatus,
    user,
    guestId,
    guestUsername,
    myRole,
    navigate,
    setWaitingStatus,
    setWaitingRoomList,
    setCurrentMeeting
  ]);

  // Patch getUserMedia globally to apply noise suppression and virtual backgrounds automatically
  useEffect(() => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async (constraints) => {
      // 1. Apply Noise Suppression constraints if audio is requested and enabled
      if (constraints && constraints.audio) {
        if (typeof constraints.audio === 'boolean' && constraints.audio) {
          if (useWebRTCStore.getState().isNoiseSuppressionEnabled) {
            constraints.audio = {
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true
            };
          }
        } else if (typeof constraints.audio === 'object') {
          const audioConstraints = constraints.audio as MediaTrackConstraints;
          if (useWebRTCStore.getState().isNoiseSuppressionEnabled) {
            audioConstraints.noiseSuppression = true;
            audioConstraints.echoCancellation = true;
            audioConstraints.autoGainControl = true;
          }
        }
      }

      // Get raw stream from original getUserMedia
      let stream = await originalGetUserMedia(constraints);

      // 2. Apply Virtual Background if video is requested and enabled
      const bgMode = useWebRTCStore.getState().virtualBackgroundMode;
      if (constraints && constraints.video && bgMode !== 'none') {
        stream = await applyVirtualBackgroundToStream(stream, bgMode);
      }

      return stream;
    };

    return () => {
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
    };
  }, []);

  // Speech Recognition hook for transcribing local mic inputs
  useSpeechRecognition(isMutedAudio, showCaptions);

  // Load cached device mute state preferences on mount/code change
  useEffect(() => {
    if (!code) return;
    const cachedAudioMute = sessionStorage.getItem(`meeting_audio_muted_${code}`) === 'true';
    const cachedVideoMute = sessionStorage.getItem(`meeting_video_muted_${code}`) === 'true';
    setAudioMute(cachedAudioMute);
    setVideoMute(cachedVideoMute);
  }, [code]);

  // Load meeting metadata
  useEffect(() => {
    if (!code) return;
    resetMeetingState();

    const loadMeeting = async () => {
      setIsLoadingMeeting(true);
      setMeetingError(null);
      
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';
        let token = null;
        try {
          token = await getToken();
        } catch(e){}

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        let meetingRes = await fetch(`${backendUrl}/api/meetings/${code}`, { headers });
        let activeMeeting = null;
        let messages = [];

        if (meetingRes.status === 404) {
          const isPersonalRoom = code.startsWith('personal-');
          const ownerUsername = isPersonalRoom ? code.replace('personal-', '') : null;
          const isOwner = isPersonalRoom && user && user.id === ownerUsername;
          
          if (isOwner) {
            // Auto-create personal room
            const createRes = await fetch(`${backendUrl}/api/meetings`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                title: `${user.fullName}'s Personal Meeting Room`,
                code: code,
                isWaitingRoomEnabled: false
              })
            });
            if (!createRes.ok) {
              const errData = await createRes.json();
              throw new Error(errData.error || 'Failed to create personal room');
            }
            const data = await createRes.json();
            activeMeeting = data.meeting;
          } else {
            setMeetingError('Meeting not found. Please verify the code.');
            setIsLoadingMeeting(false);
            return;
          }
        } else if (!meetingRes.ok) {
          const errData = await meetingRes.json();
          throw new Error((errData.error || 'Failed to connect to database.') + (errData.details ? ` (${errData.details})` : ''));
        } else {
          const data = await meetingRes.json();
          activeMeeting = data.meeting;
          messages = data.messages || [];
        }

        setCurrentMeeting(activeMeeting as Meeting);

        // Determine if user is host or participant
        const isUserHost = user && activeMeeting.host_id === user.id;
        const resolvedRole = isUserHost ? 'host' : 'participant';
        setMyRole(resolvedRole);

        // Check if passcode is required
        if (activeMeeting.passcode && !isUserHost) {
          setPasscodeGateRequired(true);
          const wasPasscodePassed = sessionStorage.getItem(`passcode_passed_${code}`) === 'true';
          setPasscodeGatePassed(wasPasscodePassed);
        } else {
          setPasscodeGateRequired(false);
          setPasscodeGatePassed(true);
        }

        // Check if waiting room is needed
        if ((activeMeeting.is_waiting_room_enabled || activeMeeting.is_locked) && !isUserHost) {
          const wasWaitingStatusApproved = sessionStorage.getItem(`waiting_status_approved_${code}`) === 'true';
          setWaitingStatus(wasWaitingStatusApproved ? 'approved' : 'waiting');
        } else {
          setWaitingStatus('none');
        }

        if (messages.length > 0) {
          const chatMsgs = messages.map((m: any) => ({
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

  // Handle Leave Meeting
  const handleLeaveMeeting = async () => {
    const confirmLeave = window.confirm(
      myRole === 'host' 
        ? 'Do you want to end this meeting for all participants?' 
        : 'Are you sure you want to leave this meeting?'
    );

    if (!confirmLeave) return;

    if (myRole === 'host') {
      const provider = import.meta.env.VITE_SIGNALING_PROVIDER || 'supabase';
      if (provider === 'socketio') {
        participants.forEach(p => {
          // @ts-ignore
          signalingClient.kickPeerInRoom(code || '', p.socketId);
        });
      } else {
        participants.forEach(p => {
          signalingClient.kickPeer(p.socketId);
        });
      }

      const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';
      getToken().then((token) => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        fetch(`${backendUrl}/api/meetings/${code}/close`, {
          method: 'PATCH',
          headers
        }).catch(err => console.error("Failed to close meeting in background:", err));
      }).catch(err => console.error("Failed to get token for background close:", err));
    }

    if (code) {
      sessionStorage.removeItem(`lobby_passed_${code}`);
      sessionStorage.removeItem(`passcode_passed_${code}`);
      sessionStorage.removeItem(`waiting_status_approved_${code}`);
    }
    resetWebRTCState();
    resetMeetingState();
    navigate('/');
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
      <div className="relative min-h-screen lg:h-screen lg:max-h-screen flex flex-col justify-center items-center bg-canvas dark:bg-dark-950 text-body dark:text-gray-200 transition-colors duration-200 p-4 md:p-8 lg:overflow-hidden z-10 select-none">
        {/* Background drifting mesh glows */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute -top-[30%] -left-[20%] w-[60%] h-[60%] rounded-full bg-primary/5 dark:bg-primary/10 blur-[120px] animate-mesh-glow" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-primary/5 dark:bg-primary/5 blur-[100px] animate-mesh-glow" style={{ animationDelay: '-10s' }} />
        </div>

        <div className="relative z-10 w-full max-w-6xl flex flex-col lg:grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Typography & Preview */}
          <div className="w-full lg:col-span-7 space-y-6 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="space-y-2">
              <h1 className="text-4xl lg:text-5xl font-serif text-ink tracking-tight font-normal leading-tight">
                Ready to join?
              </h1>
              <p className="text-sm text-muted max-w-md">
                Configure your media devices and check your camera feed before connecting to the video sync.
              </p>
            </div>

            {/* Video preview container */}
            <div className="w-full max-w-xl aspect-video rounded-3xl bg-surface-dark-elevated overflow-hidden border border-hairline/30 flex items-center justify-center shadow-2xl relative">
              {lobbyStream && !isMutedVideo ? (
                <video
                  ref={lobbyVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center space-y-4 select-none text-on-dark-soft animate-fade-in">
                  <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center border border-primary/20 shadow-inner">
                    <User className="w-10 h-10" />
                  </div>
                  <span className="text-xs font-bold bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/5">
                    Your camera is off
                  </span>
                </div>
              )}

              {/* Status badges over video */}
              <div className="absolute bottom-4 left-4 flex items-center space-x-2 z-10">
                <div className={`p-2 rounded-xl border text-white backdrop-blur-md transition-all duration-300 ${
                  isMutedAudio ? 'bg-red-500/80 border-red-400/30' : 'bg-black/50 border-white/10'
                }`}>
                  {isMutedAudio ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </div>
                <div className={`p-2 rounded-xl border text-white backdrop-blur-md transition-all duration-300 ${
                  isMutedVideo ? 'bg-red-500/80 border-red-400/30' : 'bg-black/50 border-white/10'
                }`}>
                  {isMutedVideo ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                </div>
              </div>
            </div>

            {/* Micro-interactive media control buttons */}
            <div className="flex justify-center space-x-4 w-full max-w-xl">
              <button
                onClick={handleToggleLobbyAudio}
                className={`flex items-center justify-center w-14 h-14 rounded-full border transition-all duration-300 focus:outline-none cursor-pointer hover:scale-105 active:scale-95 ${
                  isMutedAudio
                    ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 shadow-lg shadow-red-500/5'
                    : 'bg-surface-card border-hairline text-ink hover:bg-surface-soft hover:shadow-md'
                }`}
                title={isMutedAudio ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMutedAudio ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              <button
                onClick={handleToggleLobbyVideo}
                className={`flex items-center justify-center w-14 h-14 rounded-full border transition-all duration-300 focus:outline-none cursor-pointer hover:scale-105 active:scale-95 ${
                  isMutedVideo
                    ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/20 shadow-lg shadow-red-500/5'
                    : 'bg-surface-card border-hairline text-ink hover:bg-surface-soft hover:shadow-md'
                }`}
                title={isMutedVideo ? 'Turn camera on' : 'Turn camera off'}
              >
                {isMutedVideo ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Right Column: Settings Glassmorphic Card */}
          <div className="w-full lg:col-span-5">
            <div className="relative backdrop-blur-xl bg-surface-card/60 dark:bg-dark-900/60 border border-hairline/40 dark:border-dark-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 flex flex-col justify-between">
              
              <div className="space-y-5">
                {/* Identity selector */}
                <div className="bg-surface-soft/60 dark:bg-dark-950/40 border border-hairline/45 dark:border-dark-800 rounded-2xl p-4.5 space-y-3.5">
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider block">Joining As</span>
                  {user ? (
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-sm font-bold shadow-inner">
                        {user.fullName?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <span className="text-sm font-extrabold text-ink">{user.fullName}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-inner">
                          {guestUsername.charAt(0).toUpperCase() || 'G'}
                        </div>
                        <input
                          type="text"
                          value={guestUsername}
                          onChange={(e) => {
                            setGuestUsername(e.target.value);
                            sessionStorage.setItem(`guest_username_${code}`, e.target.value);
                          }}
                          placeholder="Type your guest username..."
                          className="w-full bg-canvas dark:bg-dark-950 border border-hairline/80 dark:border-dark-800 rounded-xl px-4 py-2 text-sm text-ink focus:outline-none focus:border-primary font-bold placeholder-muted/50 transition-colors shadow-inner"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Media Hardware Settings Toggle button */}
                <button
                  onClick={() => setIsLobbySettingsOpen(true)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-surface-soft/40 dark:bg-dark-950/20 hover:bg-surface-soft/80 dark:hover:bg-dark-950/40 border border-hairline/30 dark:border-dark-800 rounded-2xl text-xs text-on-dark-soft hover:text-on-dark font-semibold transition-all cursor-pointer"
                >
                  <div className="flex items-center space-x-2">
                    <Camera className="w-4 h-4 text-primary" />
                    <span>Check Audio & Video Devices</span>
                  </div>
                  <Settings className="w-4 h-4 opacity-75" />
                </button>
              </div>

              {/* Join call button */}
              <button
                onClick={handleJoinCall}
                disabled={!user && !guestUsername.trim()}
                className={`w-full text-sm font-bold py-4 px-6 rounded-2xl transition-all duration-300 shadow-lg hover:scale-[1.02] active:scale-[0.98] focus:outline-none flex items-center justify-center space-x-2 cursor-pointer ${
                  (!user && !guestUsername.trim())
                    ? 'bg-muted/40 text-muted/80 border border-hairline/40 cursor-not-allowed shadow-none'
                    : 'bg-primary hover:bg-primary-active text-white shadow-primary/20 hover:shadow-primary/35'
                }`}
              >
                <span>Join Meeting</span>
              </button>

            </div>
          </div>
        </div>

        {/* Lobby Settings Modal */}
        <Modal
          isOpen={isLobbySettingsOpen}
          onClose={() => setIsLobbySettingsOpen(false)}
          title="Audio & Video Settings"
        >
          <div className="space-y-4">
            <DeviceSelector />
            <div className="mt-6 flex justify-end">
              <Button onClick={() => setIsLobbySettingsOpen(false)}>Done</Button>
            </div>
          </div>
        </Modal>
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

  // 6. Active Call Room Layout
  if (shouldConnectWebRTC && !liveKitToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-dark text-on-dark-soft">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-bold tracking-wide">Initializing secure connection...</span>
        </div>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={!isMutedVideo}
      audio={!isMutedAudio}
      token={liveKitToken || undefined}
      serverUrl={import.meta.env.VITE_LIVEKIT_URL}
      options={{
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: {
          simulcast: true,
        },
      }}
      data-lk-theme="default"
      className="h-screen w-screen overflow-hidden bg-surface-dark text-on-dark"
      style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}
    >
      <RoomAudioRenderer />
      <ActiveRoomContent
        code={code || ''}
        user={user}
        currentMeeting={currentMeeting}
        handleLeaveMeeting={handleLeaveMeeting}
        activeRoomName={activeRoomName}
        setActiveRoomName={setActiveRoomName}
        setLiveKitToken={setLiveKitToken}
      />
    </LiveKitRoom>
  );
};

// ----------------------------------------------------
// PIP MINI PORTAL COMPONENT
// ----------------------------------------------------
const PipCallView: React.FC<{ code: string; onClose: () => void }> = ({ code, onClose }) => {
  const { isMutedAudio, isMutedVideo, setAudioMute, setVideoMute } = useWebRTCStore();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();

  // Local state to track toggling state instantly inside the PiP viewport
  const [localMuteAudio, setLocalMuteAudio] = useState(
    isMicrophoneEnabled !== undefined ? !isMicrophoneEnabled : isMutedAudio
  );
  const [localMuteVideo, setLocalMuteVideo] = useState(
    isCameraEnabled !== undefined ? !isCameraEnabled : isMutedVideo
  );

  // Sync with actual track changes from the main window / SDK
  useEffect(() => {
    if (isMicrophoneEnabled !== undefined) {
      setLocalMuteAudio(!isMicrophoneEnabled);
    }
  }, [isMicrophoneEnabled]);

  useEffect(() => {
    if (isCameraEnabled !== undefined) {
      setLocalMuteVideo(!isCameraEnabled);
    }
  }, [isCameraEnabled]);

  const toggleAudio = () => {
    const nextState = localMuteAudio; // if currently muted (true), next state is unmuted (true)
    setLocalMuteAudio(!nextState); // Instant visual feedback
    localParticipant?.setMicrophoneEnabled(nextState);
    setAudioMute(!nextState);
    if (code) {
      sessionStorage.setItem(`meeting_audio_muted_${code}`, String(!nextState));
    }
  };

  const toggleVideo = () => {
    const nextState = localMuteVideo; // if currently muted (true), next state is unmuted (true)
    setLocalMuteVideo(!nextState); // Instant visual feedback
    localParticipant?.setCameraEnabled(nextState);
    setVideoMute(!nextState);
    if (code) {
      sessionStorage.setItem(`meeting_video_muted_${code}`, String(!nextState));
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col justify-between p-3 bg-surface-dark text-white overflow-hidden font-sans">
      <div className="flex-grow flex items-center justify-center min-h-0 bg-surface-dark-elevated rounded-xl border border-white/5 overflow-hidden relative">
        <VideoGrid />
      </div>

      <div className="flex items-center justify-center space-x-3.5 mt-2.5">
        <button
          onClick={toggleAudio}
          className={`p-2.5 rounded-xl transition-all duration-200 focus:outline-none cursor-pointer ${
            localMuteAudio 
              ? 'bg-red-600 hover:bg-red-700 text-white border border-transparent' 
              : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
          }`}
          title={localMuteAudio ? 'Unmute Mic' : 'Mute Mic'}
        >
          {localMuteAudio ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleVideo}
          className={`p-2.5 rounded-xl transition-all duration-200 focus:outline-none cursor-pointer ${
            localMuteVideo 
              ? 'bg-red-600 hover:bg-red-700 text-white border border-transparent' 
              : 'bg-surface-dark-soft hover:bg-surface-dark text-on-dark border border-white/10'
          }`}
          title={localMuteVideo ? 'Start Video' : 'Stop Video'}
        >
          {localMuteVideo ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </button>
        
        <button
          onClick={onClose}
          className="p-2.5 bg-surface-dark-soft hover:bg-surface-dark text-on-dark-soft border border-white/10 rounded-xl cursor-pointer"
          title="Return to Tab"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// ACTIVE ROOM CONTENT CONTAINER (NESTS INSIDE LIVEKITROOM)
// ----------------------------------------------------
const ActiveRoomContent: React.FC<{
  code: string;
  user: any;
  currentMeeting: any;
  handleLeaveMeeting: () => void;
  activeRoomName: string;
  setActiveRoomName: React.Dispatch<React.SetStateAction<string>>;
  setLiveKitToken: React.Dispatch<React.SetStateAction<string | null>>;
}> = ({
  code,
  user,
  currentMeeting,
  handleLeaveMeeting,
  activeRoomName,
  setActiveRoomName,
  setLiveKitToken
}) => {
  const {
    participants,
    isChatPanelOpen,
    isParticipantsPanelOpen,
    isTranscriptionPanelOpen,
    isWhiteboardOpen,
    isSettingsOpen,
    isShortcutsOpen,
    setSettingsOpen,
    setShortcutsOpen,
    addOrUpdateTranscript,
    myRole,
    addChatMessage,
    updateParticipantHand,
    setParticipants,
    addParticipant,
    removeParticipant,
    updateParticipantMute
  } = useMeetingStore();

  const {
    isMutedAudio,
    setAudioMute,
    setVideoMute,
    isPushToTalkEnabled,
    showCaptions,
    isNoiseSuppressionEnabled,
    virtualBackgroundMode
  } = useWebRTCStore();

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const { getToken } = useAuth();
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  // Breakout Rooms states
  const [isBreakoutActive, setIsBreakoutActive] = useState(false);
  const [breakoutTimeLeft, setBreakoutTimeLeft] = useState<number | null>(null);
  const [isBreakoutModalOpen, setIsBreakoutModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Soundboard states
  const [isSoundboardHUDOpen, setIsSoundboardHUDOpen] = useState(false);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);

  // Monitor tab visibility to suspend rendering/streaming when backgrounded
  useEffect(() => {
    const handleVisibility = () => {
      setIsTabVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Global Soundboard Hotkeys Listener
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Ignore if user is typing in inputs or textareas or contenteditables
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
      if (isInput) return;

      // Option + S (Alt + S) or Ctrl + S to toggle HUD
      const isToggleKey = (e.altKey || e.ctrlKey) && (e.key === 's' || e.key === 'S');
      if (isToggleKey) {
        e.preventDefault();
        setIsSoundboardHUDOpen(prev => !prev);
        return;
      }

      // Keys 1-8 to trigger sounds
      const sound = SOUND_DEFINITIONS.find(s => s.key === e.key);
      if (sound) {
        e.preventDefault();
        
        // Play locally
        playSynthesizedSound(sound.id);
        
        // Broadcast to peers
        signalingClient.sendSoundboardPlay(sound.id);

        // Highlight HUD key temporarily
        setActiveSoundId(sound.id);
        const timeout = setTimeout(() => setActiveSoundId(null), 300);
        return () => clearTimeout(timeout);
      }
    };

    window.addEventListener('keydown', handleGlobalKeys);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeys);
    };
  }, []);

  const handleToggleRoomLock = async () => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const nextLockedState = !currentMeeting?.is_locked;
      const res = await fetch(`${backendUrl}/api/meetings/${code}/lock`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ isLocked: nextLockedState })
      });

      if (res.ok) {
        signalingClient.sendRoomLockToggle(nextLockedState);
        useMeetingStore.getState().setCurrentMeeting(
          currentMeeting ? { ...currentMeeting, is_locked: nextLockedState } : null
        );
      } else {
        const data = await res.json();
        console.error("Failed to toggle meeting lock:", data.error);
      }
    } catch (err) {
      console.error("Error toggling meeting lock:", err);
    }
  };

  // Listen for breakout room events
  useEffect(() => {
    const handleBreakoutStarted = ({ assignments, durationSeconds }: { assignments: Record<string, string>; durationSeconds: number }) => {
      setIsBreakoutActive(true);
      setBreakoutTimeLeft(durationSeconds);

      const myUserId = user?.id;
      const assignedRoom = myUserId ? assignments[myUserId] : null;

      if (assignedRoom && assignedRoom !== activeRoomName) {
        setLiveKitToken(null);
        setActiveRoomName(assignedRoom);
      }
    };

    const handleBreakoutEnded = () => {
      setIsBreakoutActive(false);
      setBreakoutTimeLeft(null);

      if (activeRoomName !== code) {
        setLiveKitToken(null);
        setActiveRoomName(code);
      }
    };

    signalingClient.on('breakout-started', handleBreakoutStarted);
    signalingClient.on('breakout-ended', handleBreakoutEnded);

    return () => {
      signalingClient.off('breakout-started', handleBreakoutStarted);
      signalingClient.off('breakout-ended', handleBreakoutEnded);
    };
  }, [code, user, activeRoomName, setActiveRoomName, setLiveKitToken]);

  // Handle breakout timer countdown
  useEffect(() => {
    if (breakoutTimeLeft === null) return;
    if (breakoutTimeLeft <= 0) {
      if (myRole === 'host') {
        signalingClient.sendEndBreakout();
      } else {
        // Participant fallback auto-return
        setIsBreakoutActive(false);
        setBreakoutTimeLeft(null);
        if (activeRoomName !== code) {
          setLiveKitToken(null);
          setActiveRoomName(code);
        }
      }
      return;
    }

    const timer = setTimeout(() => {
      setBreakoutTimeLeft(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [breakoutTimeLeft, myRole, code, activeRoomName, setActiveRoomName, setLiveKitToken]);

  // Restart video track dynamically when virtual background configuration changes
  useEffect(() => {
    if (localParticipant && isCameraEnabled) {
      const restartVideo = async () => {
        try {
          await localParticipant.setCameraEnabled(false);
          await localParticipant.setCameraEnabled(true);
        } catch (err) {
          console.error('Failed to restart video track for background effect:', err);
        }
      };
      restartVideo();
    }
  }, [virtualBackgroundMode]);

  // Restart audio track dynamically when noise suppression configuration changes
  useEffect(() => {
    if (localParticipant && isMicrophoneEnabled) {
      const restartAudio = async () => {
        try {
          await localParticipant.setMicrophoneEnabled(false);
          await localParticipant.setMicrophoneEnabled(true);
        } catch (err) {
          console.error('Failed to restart audio track for noise suppression:', err);
        }
      };
      restartAudio();
    }
  }, [isNoiseSuppressionEnabled]);

  // State to track active captions for all speakers
  const [activeCaptions, setActiveCaptions] = useState<Record<string, { username: string; text: string; timestamp: number }>>({});

  // State for floating emoji reactions
  const [reactionList, setReactionList] = useState<Array<{ id: string; emoji: string }>>([]);

  // Caption listener for remote speaker captions
  useEffect(() => {
    const handleCaption = ({ senderUserId, username, text, isFinal }: { senderUserId: string; username: string; text: string; isFinal: boolean }) => {
      setActiveCaptions(prev => ({
        ...prev,
        [senderUserId]: {
          username,
          text,
          timestamp: Date.now()
        }
      }));
      addOrUpdateTranscript(senderUserId, username, text, isFinal);
    };

    signalingClient.on('caption', handleCaption);

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
  }, []);

  // Reaction listener — listens for emoji reactions from all peers
  useEffect(() => {
    const handleReaction = ({ senderUserId, type }: { senderUserId: string; type: string }) => {
      setReactionList(prev => [
        ...prev,
        { id: `${senderUserId}-${Date.now()}-${Math.random()}`, emoji: type }
      ]);
    };

    signalingClient.on('reaction', handleReaction);
    return () => {
      signalingClient.off('reaction', handleReaction);
    };
  }, []);

  // Real-time Chat, Hand Raise and Remote Mute commands listeners
  useEffect(() => {
    const handleChatReceived = (message: any) => {
      addChatMessage(message);
    };

    const handleHandRaised = ({ userId, isRaised }: { userId: string; isRaised: boolean }) => {
      updateParticipantHand(userId, isRaised);
    };

    const handleMuteCommand = ({ type }: { type: 'audio' | 'video' }) => {
      if (type === 'audio') {
        localParticipant?.setMicrophoneEnabled(false);
        setAudioMute(true);
        if (code) {
          sessionStorage.setItem(`meeting_audio_muted_${code}`, 'true');
        }
      } else if (type === 'video') {
        localParticipant?.setCameraEnabled(false);
        setVideoMute(true);
        if (code) {
          sessionStorage.setItem(`meeting_video_muted_${code}`, 'true');
        }
      }
    };

    const handleRoomParticipants = ({ participants: peerList }: { participants: any[] }) => {
      setParticipants(peerList);
    };

    const handlePeerJoined = (peer: any) => {
      addParticipant(peer);
    };

    const handlePeerLeft = ({ userId }: { userId: string }) => {
      removeParticipant(userId);
    };

    const handlePeerMutedStatus = ({ userId, type, isMuted }: { userId: string; type: 'audio' | 'video'; isMuted: boolean }) => {
      updateParticipantMute(userId, type, isMuted);
    };

    const handleSoundboardPlay = ({ soundId }: { soundId: string }) => {
      playSynthesizedSound(soundId);
      setActiveSoundId(soundId);
      setTimeout(() => setActiveSoundId(null), 300);
    };

    signalingClient.on('chat-received', handleChatReceived);
    signalingClient.on('hand-raised', handleHandRaised);
    signalingClient.on('mute-command', handleMuteCommand);
    signalingClient.on('room-participants', handleRoomParticipants);
    signalingClient.on('peer-joined', handlePeerJoined);
    signalingClient.on('peer-left', handlePeerLeft);
    signalingClient.on('peer-muted-status', handlePeerMutedStatus);
    signalingClient.on('soundboard-play', handleSoundboardPlay);

    return () => {
      signalingClient.off('chat-received', handleChatReceived);
      signalingClient.off('hand-raised', handleHandRaised);
      signalingClient.off('mute-command', handleMuteCommand);
      signalingClient.off('room-participants', handleRoomParticipants);
      signalingClient.off('peer-joined', handlePeerJoined);
      signalingClient.off('peer-left', handlePeerLeft);
      signalingClient.off('peer-muted-status', handlePeerMutedStatus);
      signalingClient.off('soundboard-play', handleSoundboardPlay);
    };
  }, [
    localParticipant,
    code,
    addChatMessage,
    updateParticipantHand,
    setAudioMute,
    setVideoMute,
    setParticipants,
    addParticipant,
    removeParticipant,
    updateParticipantMute,
    setActiveSoundId
  ]);

  // Handle incoming unread chat notification
  useEffect(() => {
    if (useMeetingStore.getState().chatMessages.length > 0 && !isChatPanelOpen) {
      setHasUnreadChat(true);
    }
  }, [useMeetingStore.getState().chatMessages.length, isChatPanelOpen]);

  const handleCopyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setHasCopiedCode(true);
    setTimeout(() => setHasCopiedCode(false), 2000);
  };

  // ----------------------------------------------------
  // Typing while muted suggestion feature
  // ----------------------------------------------------
  const [showMuteSuggestion, setShowMuteSuggestion] = useState(false);
  const muteSuggestionTimeoutRef = useRef<any>(null);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT';
      const isPassword = isInput && (target as HTMLInputElement).type === 'password';
      const isTyping = (isInput && !isPassword) || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
      
      if (isTyping && isMutedAudio) {
        setShowMuteSuggestion(true);

        if (muteSuggestionTimeoutRef.current) {
          clearTimeout(muteSuggestionTimeoutRef.current);
        }
        muteSuggestionTimeoutRef.current = setTimeout(() => {
          setShowMuteSuggestion(false);
        }, 3000);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (muteSuggestionTimeoutRef.current) {
        clearTimeout(muteSuggestionTimeoutRef.current);
      }
    };
  }, [isMutedAudio]);

  // ----------------------------------------------------
  // Push-to-Talk (Hold Space) Feature
  // ----------------------------------------------------
  const isHoldingSpaceRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPushToTalkEnabled) return;
      if (e.key !== ' ' && e.code !== 'Space') return;
      if (e.repeat) return; // Ignore repeat events

      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
      if (isTyping) return;

      e.preventDefault(); // Stop page scrolling

      // If currently muted
      if (!isMicrophoneEnabled) {
        localParticipant?.setMicrophoneEnabled(true);
        setAudioMute(false);
        isHoldingSpaceRef.current = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isPushToTalkEnabled) return;
      if (e.key !== ' ' && e.code !== 'Space') return;

      if (isHoldingSpaceRef.current) {
        localParticipant?.setMicrophoneEnabled(false);
        setAudioMute(true);
        isHoldingSpaceRef.current = false;
        
        if (code) {
          sessionStorage.setItem(`meeting_audio_muted_${code}`, 'true');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPushToTalkEnabled, isMicrophoneEnabled, localParticipant, code]);

  // ----------------------------------------------------
  // Document Picture-in-Picture (PiP) Feature
  // ----------------------------------------------------
  const [pipWindow, setPipWindow] = useState<any>(null);
  const [pipContainer, setPipContainer] = useState<HTMLDivElement | null>(null);

  const togglePip = async () => {
    if (!('documentPictureInPicture' in window)) {
      alert("Document Picture-in-Picture is not supported in this browser.");
      return;
    }
    const pipApi = (window as any).documentPictureInPicture;

    if (pipApi.window) {
      pipApi.window.close();
      setPipWindow(null);
      setPipContainer(null);
      return;
    }

    try {
      const w = await pipApi.requestWindow({
        width: 380,
        height: 340,
      });

      // Copy styles
      const allStyleSheets = Array.from(document.styleSheets);
      allStyleSheets.forEach((styleSheet) => {
        try {
          if (styleSheet.cssRules) {
            const newStyleEl = w.document.createElement('style');
            const cssTexts = Array.from(styleSheet.cssRules)
              .map((rule) => rule.cssText)
              .join('\n');
            newStyleEl.appendChild(w.document.createTextNode(cssTexts));
            w.document.head.appendChild(newStyleEl);
          }
        } catch (e) {
          if (styleSheet.href) {
            const newLinkEl = w.document.createElement('link');
            newLinkEl.rel = 'stylesheet';
            newLinkEl.href = styleSheet.href;
            w.document.head.appendChild(newLinkEl);
          }
        }
      });

      // Theme setting
      if (document.documentElement.classList.contains('dark')) {
        w.document.documentElement.classList.add('dark');
        w.document.body.classList.add('dark', 'bg-surface-dark');
      } else {
        w.document.body.classList.add('bg-canvas');
      }

      const container = w.document.createElement('div');
      container.id = 'pip-root';
      container.style.height = '100%';
      container.style.width = '100%';
      w.document.body.appendChild(container);

      setPipWindow(w);
      setPipContainer(container);

      w.addEventListener('pagehide', () => {
        setPipWindow(null);
        setPipContainer(null);
      });
    } catch (err) {
      console.error('Failed to open Document Picture-in-Picture:', err);
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const pipApi = (window as any).documentPictureInPicture;
        if (pipApi?.window) {
          pipApi.window.close();
          setPipWindow(null);
          setPipContainer(null);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const pipApi = (window as any).documentPictureInPicture;
      if (pipApi?.window) {
        pipApi.window.close();
      }
    };
  }, []);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden font-sans transition-colors duration-200">
      
      {/* Floating Emoji Reaction Overlay */}
      <ReactionOverlay reactions={reactionList} />

      {/* Breakout rooms notification banner */}
      {isBreakoutActive && breakoutTimeLeft !== null && (
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 text-white text-center py-2.5 px-6 text-xs font-bold flex items-center justify-between z-40 animate-in slide-in-from-top duration-300">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-white animate-ping" />
            <span>
              {activeRoomName === code 
                ? "Breakout Rooms are in progress. You are remaining in the Main Room." 
                : `You are currently in Breakout Room: ${activeRoomName.replace(code + '-breakout-', 'Room ')}`}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="bg-black/25 px-2.5 py-1 rounded-md font-mono tracking-wider">
              Time remaining: {Math.floor(breakoutTimeLeft / 60)}:{(breakoutTimeLeft % 60).toString().padStart(2, '0')}
            </span>
            {myRole === 'host' && (
              <button
                onClick={() => signalingClient.sendEndBreakout()}
                className="bg-white text-orange-700 px-3.5 py-1 rounded-lg text-[10px] font-black hover:bg-orange-50 active:scale-95 transition-all shadow-md cursor-pointer border border-transparent"
              >
                End Breakout Rooms
              </button>
            )}
          </div>
        </div>
      )}
      
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
              className="p-0.5 hover:text-primary rounded transition-colors cursor-pointer"
              title="Copy meeting link"
            >
              {hasCopiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            {myRole === 'host' && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="p-0.5 hover:text-primary rounded transition-colors cursor-pointer ml-1.5 border-l border-white/10 pl-1.5"
                title="Invite via Email"
              >
                <Mail className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-3.5 text-xs font-bold text-on-dark-soft">
          {myRole === 'host' && (
            <>
              <button
                onClick={handleToggleRoomLock}
                className={`flex items-center space-x-1.5 p-1 hover:bg-surface-dark-soft rounded-md transition-all cursor-pointer ${
                  currentMeeting?.is_locked
                    ? 'text-red-500 hover:text-red-400'
                    : 'text-emerald-500 hover:text-emerald-400'
                }`}
                title={currentMeeting?.is_locked ? "Unlock Meeting" : "Lock Meeting"}
              >
                {currentMeeting?.is_locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{currentMeeting?.is_locked ? 'Locked' : 'Unlocked'}</span>
              </button>
              <button
                onClick={() => setIsBreakoutModalOpen(true)}
                className="flex items-center space-x-1 hover:text-on-dark p-1 rounded-md hover:bg-surface-dark-soft transition-all cursor-pointer text-primary"
                title="Breakout Rooms Control"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Breakouts</span>
              </button>
            </>
          )}
          {myRole !== 'host' && (
            <div className="flex items-center space-x-1 text-on-dark-soft p-1">
              {currentMeeting?.is_locked ? <Lock className="w-3.5 h-3.5 text-red-500" /> : <Unlock className="w-3.5 h-3.5 text-emerald-500" />}
              <span className="hidden sm:inline">{currentMeeting?.is_locked ? 'Locked' : 'Unlocked'}</span>
            </div>
          )}

          <button
            onClick={() => setShortcutsOpen(true)}
            className="flex items-center space-x-1 hover:text-on-dark p-1 rounded-md hover:bg-surface-dark-soft transition-all cursor-pointer"
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
        
        {/* Central area: Video grid or Whiteboard */}
        <div className="flex-grow flex flex-col min-h-0 overflow-y-auto no-scrollbar relative">
          {isWhiteboardOpen ? (
            <div className="flex-grow p-4 min-h-0">
              <WhiteboardPanel />
            </div>
          ) : isTabVisible ? (
            <VideoGrid />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center bg-surface-dark-elevated text-on-dark-soft border border-white/5 rounded-2xl m-4 p-8 select-none">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-3.5 border border-primary/20 animate-pulse">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-xs font-bold text-on-dark mb-1">
                Background Tab Suspend
              </h3>
              <p className="text-[10px] text-on-dark-soft text-center max-w-[240px]">
                Video streams are temporarily paused to conserve power and CPU while you are in another tab.
              </p>
            </div>
          )}

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
              username={user?.fullName || 'Guest User'} 
            />
          </div>
        )}

        {isParticipantsPanelOpen && (
          <div className="w-full md:w-80 flex-shrink-0 animate-in slide-in-from-right duration-250 z-20">
            <ParticipantPanel />
          </div>
        )}

        {isTranscriptionPanelOpen && (
          <div className="w-full md:w-80 flex-shrink-0 animate-in slide-in-from-right duration-250 z-20">
            <TranscriptionPanel />
          </div>
        )}
      </div>

      {/* Soundboard HUD Overlay */}
      {isSoundboardHUDOpen && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="backdrop-blur-md bg-surface-dark-elevated/90 border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col space-y-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-2">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">🔊 Live Soundboard</span>
                <span className="text-[10px] text-on-dark-soft bg-surface-dark-soft px-1.5 py-0.5 rounded">Hotkeys Only</span>
              </div>
              <span className="text-[10px] text-on-dark-soft">
                Press <kbd className="bg-surface-dark-soft px-1.5 py-0.5 rounded border border-white/10 text-white font-mono text-[9px] font-black">
                  {typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? '⌥ + S' : 'Alt + S'}
                </kbd> to close
              </span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {SOUND_DEFINITIONS.map((sound) => {
                const isActive = activeSoundId === sound.id;
                return (
                  <div
                    key={sound.id}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-[11px] transition-all duration-200 ${
                      isActive
                        ? 'bg-primary border-primary-active scale-95 shadow-lg shadow-primary/20 text-white'
                        : 'bg-surface-dark-soft/50 border-white/5 text-on-dark-soft hover:bg-surface-dark-soft hover:text-on-dark'
                    }`}
                  >
                    <span className="truncate font-bold">{sound.name}</span>
                    <kbd className={`px-2 py-0.5 rounded font-mono text-[10px] font-black ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : 'bg-surface-dark border border-white/10 text-on-dark-soft'
                    }`}>
                      {sound.key}
                    </kbd>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom meeting control bar */}
      <MeetingControls
        onLeave={handleLeaveMeeting}
        hasUnreadMessages={hasUnreadChat}
        markChatRead={() => setHasUnreadChat(false)}
        onTogglePip={togglePip}
      />

      {/* Muted typing suggestion banner */}
      {showMuteSuggestion && (
        <div className="absolute bottom-24 left-6 z-40 bg-primary border border-primary/20 text-white px-4 py-3 rounded-xl shadow-xl flex items-center space-x-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <MicOff className="w-4 h-4 text-white/90" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-white">Your mic is muted</span>
            <span className="text-[10px] text-white/85">Would you like to unmute to speak?</span>
          </div>
          <button
            onClick={() => {
              localParticipant?.setMicrophoneEnabled(true);
              setAudioMute(false);
              if (code) {
                sessionStorage.setItem(`meeting_audio_muted_${code}`, 'false');
              }
              setShowMuteSuggestion(false);
            }}
            className="ml-2 px-2.5 py-1 bg-white text-primary text-[10px] font-black rounded-lg hover:bg-white/90 transition-all cursor-pointer"
          >
            Unmute
          </button>
        </div>
      )}

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

      {/* BREAKOUT ROOMS MODAL */}
      <Modal
        isOpen={isBreakoutModalOpen}
        onClose={() => setIsBreakoutModalOpen(false)}
        title="Breakout Rooms Configuration"
      >
        <BreakoutModal
          onClose={() => setIsBreakoutModalOpen(false)}
          isBreakoutActive={isBreakoutActive}
          onEndBreakout={() => {
            signalingClient.sendEndBreakout();
            setIsBreakoutModalOpen(false);
          }}
        />
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

      {/* RENDER PICTURE IN PICTURE PORTAL */}
      {pipContainer && createPortal(
        <PipCallView 
          code={code}
          onClose={() => {
            if (pipWindow) pipWindow.close();
          }} 
        />,
        pipContainer
      )}

      {/* EMAIL INVITATION MODAL */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        title="Invite via Email"
      >
        <InviteModalContent code={code || ''} onClose={() => setIsInviteModalOpen(false)} />
      </Modal>
    </div>
  );
};

// ----------------------------------------------------
// EMAIL INVITATION MODAL CONTENT COMPONENT
// ----------------------------------------------------
const InviteModalContent: React.FC<{ code: string; onClose: () => void }> = ({ code, onClose }) => {
  const { getToken } = useAuth();
  const [email, setEmail] = useState('');
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      setLookupResult(null);
      return;
    }

    setIsSearching(true);
    timeoutRef.current = setTimeout(async () => {
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [email, getToken]);

  const handleSendInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    setInviteStatus('sending');
    setErrorMessage(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${backendUrl}/api/meetings/${code}/invite`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: trimmed })
      });

      if (res.ok) {
        setInviteStatus('success');
      } else {
        const data = await res.json();
        setInviteStatus('error');
        setErrorMessage(data.error || 'Failed to send invitation');
      }
    } catch (err: any) {
      setInviteStatus('error');
      setErrorMessage(err.message || 'Failed to send invitation');
    }
  };

  if (inviteStatus === 'success') {
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
          <Check className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-ink">Invitation Sent Successfully</h3>
          <p className="text-xs text-muted">A styled email invitation was sent to <span className="font-bold text-body-strong">{email}</span> with details to join this meeting room.</p>
        </div>
        <div className="pt-2">
          <Button onClick={onClose} className="w-full">Done</Button>
        </div>
      </div>
    );
  }

  const isValidEmail = email.trim().includes('@') && email.trim().length > 3;

  return (
    <div className="space-y-5 py-2">
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase text-muted tracking-wider">Email Address</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          className="w-full bg-canvas border border-hairline rounded-lg px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:border-primary placeholder-muted/50"
          disabled={inviteStatus === 'sending'}
        />
      </div>

      {/* User Search & Resolution Preview */}
      <div className="bg-surface-soft border border-hairline/60 rounded-xl p-4 min-h-[82px] flex items-center justify-center">
        {isSearching ? (
          <div className="flex items-center space-x-2 text-xs font-bold text-muted animate-pulse">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <span>Searching Chatsie database...</span>
          </div>
        ) : lookupResult ? (
          <div className="w-full flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0">
              <img
                src={lookupResult.imageUrl}
                alt={lookupResult.name}
                className="w-10 h-10 rounded-full border border-hairline bg-surface-dark flex-shrink-0 object-cover"
              />
              <div className="truncate">
                <span className="text-xs font-bold text-ink block truncate">{lookupResult.name}</span>
                <span className="text-[9px] font-black uppercase tracking-wider block mt-0.5 text-muted">
                  {lookupResult.exists ? 'Registered Chatsie User' : 'Non-registered Guest'}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 ml-3">
              <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                lookupResult.exists 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                  : 'bg-stone-500/10 border-stone-500/20 text-muted'
              }`}>
                {lookupResult.exists ? 'Member' : 'Guest'}
              </span>
            </div>
          </div>
        ) : (
          <span className="text-xs text-muted/80 text-center leading-relaxed">
            Enter a valid email address to search user directory and preview invitation card.
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3 text-xs font-bold">
          {errorMessage}
        </div>
      )}

      <div className="flex space-x-3 justify-end pt-2 border-t border-hairline">
        <Button variant="secondary" onClick={onClose} disabled={inviteStatus === 'sending'}>
          Cancel
        </Button>
        <Button
          onClick={handleSendInvite}
          disabled={!isValidEmail || inviteStatus === 'sending'}
          className="flex items-center space-x-1"
        >
          {inviteStatus === 'sending' && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
          <span>Send Invitation</span>
        </Button>
      </div>
    </div>
  );
};

export default MeetingRoom;
