import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { useMeetingStore } from '../../stores/meetingStore';
import type { Meeting } from '../../stores/meetingStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { applyVirtualBackgroundToStream } from '../../utils/mediaProcessors';

import { signalingClient } from '../../services/signaling';
import { LiveKitRoom, useLocalParticipant } from '@livekit/components-react';
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
import { Copy, Check, Info, Users, Keyboard, Mic, MicOff, Video, VideoOff, Camera, User, ExternalLink } from 'lucide-react';

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
    setChatMessages
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

  // Pre-join Lobby states and refs
  const [isLobbyPassed, setIsLobbyPassed] = useState(() => {
    if (!code) return false;
    return sessionStorage.getItem(`lobby_passed_${code}`) === 'true';
  });
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
          const token = await getToken();
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const res = await fetch(`${backendUrl}/api/livekit/token`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              roomName: activeRoomName,
              participantIdentity: user?.id || 'guest-' + Math.random().toString(36).substring(2, 8),
              participantName: user?.fullName || 'Guest User'
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
  }, [shouldConnectWebRTC, liveKitToken, activeRoomName, user]);

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

    signalingClient.on('waiting-status', handleWaitingStatus);
    signalingClient.on('kicked-command', handleKickedCommand);

    const isUserWaiting = waitingStatus === 'waiting';

    signalingClient.connect(code, {
      userId: user?.id || 'guest-' + Math.random().toString(36).substring(2, 8),
      username: user?.fullName || 'Guest User',
      role: myRole,
      isWaiting: isUserWaiting
    });

    return () => {
      signalingClient.off('waiting-status', handleWaitingStatus);
      signalingClient.off('kicked-command', handleKickedCommand);
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
    myRole,
    navigate,
    setWaitingStatus
  ]);

  // Patch getUserMedia globally to apply noise suppression and virtual backgrounds automatically
  useEffect(() => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = async (constraints) => {
      // 1. Apply Noise Suppression constraints if audio is requested and enabled
      if (constraints && constraints.audio && typeof constraints.audio === 'object') {
        const audioConstraints = constraints.audio as MediaTrackConstraints;
        if (useWebRTCStore.getState().isNoiseSuppressionEnabled) {
          audioConstraints.noiseSuppression = true;
          audioConstraints.echoCancellation = true;
          audioConstraints.autoGainControl = true;
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
        if (activeMeeting.is_waiting_room_enabled && !isUserHost) {
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
      <div className="min-h-screen bg-canvas text-body font-sans transition-colors duration-200 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-surface-card border border-hairline rounded-2xl shadow-sm p-6 md:p-10 space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-serif text-ink tracking-tight font-normal leading-tight">
              Ready to join?
            </h1>
            <p className="text-sm text-muted">
              Configure your hardware and check your video preview before entering the meeting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
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

            <div className="space-y-6 flex flex-col justify-between h-full min-h-[220px]">
              <div className="space-y-4">
                <div className="bg-surface-soft border border-hairline/60 rounded-xl p-4">
                  <span className="text-[10px] uppercase font-bold text-muted tracking-wider block mb-1">Joining As</span>
                  <div className="flex items-center space-x-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                      {user?.fullName?.charAt(0).toUpperCase() || 'G'}
                    </div>
                    <span className="text-sm font-bold text-ink">{user?.fullName || 'Guest User'}</span>
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
    myRole
  } = useMeetingStore();

  const {
    isMutedAudio,
    setAudioMute,
    isPushToTalkEnabled,
    showCaptions,
    isNoiseSuppressionEnabled,
    virtualBackgroundMode
  } = useWebRTCStore();

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);

  // Breakout Rooms states
  const [isBreakoutActive, setIsBreakoutActive] = useState(false);
  const [breakoutTimeLeft, setBreakoutTimeLeft] = useState<number | null>(null);
  const [isBreakoutModalOpen, setIsBreakoutModalOpen] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

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
          </div>
        </div>

        <div className="flex items-center space-x-3.5 text-xs font-bold text-on-dark-soft">
          {myRole === 'host' && (
            <button
              onClick={() => setIsBreakoutModalOpen(true)}
              className="flex items-center space-x-1 hover:text-on-dark p-1 rounded-md hover:bg-surface-dark-soft transition-all cursor-pointer text-primary"
              title="Breakout Rooms Control"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Breakouts</span>
            </button>
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
    </div>
  );
};

export default MeetingRoom;
