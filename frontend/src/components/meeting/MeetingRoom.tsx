import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser, useAuth } from '@clerk/clerk-react';
import { useMeetingStore } from '../../stores/meetingStore';
import type { Meeting } from '../../stores/meetingStore';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { Room, ExternalE2EEKeyProvider } from 'livekit-client';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useCallRecorder } from '../../hooks/useCallRecorder';
import { applyVirtualBackgroundToStream } from '../../utils/mediaProcessors';
import { playSynthesizedSound, SOUND_DEFINITIONS } from '../../utils/soundSynthesizer';

import { signalingClient } from '../../services/signaling';
import { LiveKitRoom, useLocalParticipant, useRoomContext } from '@livekit/components-react';
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
import { Copy, Check, Users, Keyboard, Mic, MicOff, Video, VideoOff, Camera, User, ExternalLink, Lock, Unlock, Mail, Loader2, Settings, Palette, FileText, PictureInPicture, Circle, MousePointer, MessageSquare, MonitorOff, Headphones, Sparkles, Code } from 'lucide-react';
import { useGestureDetector } from '../../hooks/useGestureDetector';
import { SmartJoinDiagnostics } from './SmartJoinDiagnostics';
import { IntentToSpeakIndicator } from './IntentToSpeakIndicator';
import { FollowUpEmailModal } from './FollowUpEmailModal';
import { SpatialAudioRenderer } from './SpatialAudioRenderer';
import { WorkspacePanel } from './WorkspacePanel';
import { AiCopilotPanel } from './AiCopilotPanel';
import { ReleaseNotesModal } from './ReleaseNotesModal';

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
    audioDevices,
    videoDevices,
    setAudioMute,
    setVideoMute,
    setDevices,
    setSelectedAudioInput,
    setSelectedVideoInput,
    setSelectedAudioOutput,
    showCaptions,
    isNoiseSuppressionEnabled,
    virtualBackgroundMode,
    isE2eeEnabled
  } = useWebRTCStore();

  const [isLoadingMeeting, setIsLoadingMeeting] = useState(true);
  const [meetingError, setMeetingError] = useState<string | null>(null);
  const [denialReason, setDenialReason] = useState<string | null>(null);

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

  const customRoom = React.useMemo(() => {
    if (!liveKitToken) return null;
    const options: any = {
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        simulcast: true,
      },
    };

    if (isE2eeEnabled) {
      const keyProvider = new ExternalE2EEKeyProvider();
      options.encryption = {
        keyProvider,
        worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), { type: 'module' }),
      };
      const encryptionKey = currentMeeting?.passcode || code || 'default-key';
      keyProvider.setKey(encryptionKey);
    }

    const r = new Room(options);
    if (isE2eeEnabled) {
      r.setE2EEEnabled(true);
    }
    return r;
  }, [isE2eeEnabled, code, currentMeeting?.passcode, liveKitToken]);

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
      const activeMtg = useMeetingStore.getState().currentMeeting;
      if (activeMtg) {
        setCurrentMeeting({ ...activeMtg, is_locked: isLocked });
        
        if (!isLocked && !activeMtg.is_waiting_room_enabled) {
          const currentStatus = useMeetingStore.getState().waitingStatus;
          if (currentStatus === 'waiting') {
            setWaitingStatus('approved');
            sessionStorage.setItem(`waiting_status_approved_${code}`, 'true');
          }
        }
      }
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

        // Enforce lock-to-invited-only
        if (activeMeeting.inviteOnly && !isUserHost) {
          const userEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
          const invitedEmails = activeMeeting.invitedEmails || [];
          const isInvited = userEmail && invitedEmails.some((email: string) => email.trim().toLowerCase() === userEmail);
          if (!isInvited) {
            setDenialReason('This meeting is locked to invited participants only. Please sign in with an invited email address to join.');
            setWaitingStatus('denied');
            setIsLoadingMeeting(false);
            return;
          }
        }

        // Check if early join is prevented and participant is early
        const now = Date.now();
        const scheduledStart = activeMeeting.scheduled_start ? new Date(activeMeeting.scheduled_start).getTime() : null;
        const isEarly = scheduledStart && now < scheduledStart;
        const isEarlyBlocked = activeMeeting.blockEarlyJoin && isEarly;

        // Check if waiting room is needed
        if ((activeMeeting.is_waiting_room_enabled || activeMeeting.is_locked || isEarlyBlocked) && !isUserHost) {
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

  // Check early join restriction periodically while in waiting room
  React.useEffect(() => {
    if (waitingStatus !== 'waiting' || !currentMeeting || !currentMeeting.blockEarlyJoin) return;

    const scheduledStart = currentMeeting.scheduled_start ? new Date(currentMeeting.scheduled_start).getTime() : null;
    if (!scheduledStart) return;

    const checkInterval = setInterval(() => {
      const now = Date.now();
      if (now >= scheduledStart) {
        clearInterval(checkInterval);
        // If standard waiting room is NOT enabled, let them enter directly
        if (!currentMeeting.is_waiting_room_enabled && !currentMeeting.is_locked) {
          setWaitingStatus('none');
        }
      }
    }, 2000);

    return () => clearInterval(checkInterval);
  }, [waitingStatus, currentMeeting, setWaitingStatus]);

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
      <div className="min-h-screen flex items-center justify-center bg-canvas text-ink">
        <div className="flex flex-col items-center space-y-4">
          <svg className="animate-spin h-8 w-8 text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-body-sm font-bold tracking-wide">Connecting to room...</span>
        </div>
      </div>
    );
  }

  // 2. Error State
  if (meetingError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-center px-4 text-ink">
        <div className="max-w-md space-y-4 p-8 border border-hairline bg-block-cream rounded-lg">
          <div className="text-red-500 text-3xl">⚠️</div>
          <h2 className="text-headline text-ink">{meetingError}</h2>
          <Button onClick={() => navigate('/')} variant="primary">
            Back to Dashboard
          </Button>
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
      <div className="min-h-screen flex flex-col justify-center items-center bg-canvas text-ink p-4 md:p-8 z-10 relative overflow-hidden">
        {/* Colorful Wavy/Curly Background Lines (Continuous) */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <svg className="absolute inset-0 w-full h-full opacity-[0.13]" viewBox="0 0 1440 900" preserveAspectRatio="none">
            {/* Curve 1: Orange Wave */}
            <path d="M -100 150 C 400 30, 800 380, 1540 200" stroke="#fa7b17" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            
            {/* Curve 2: Pink Loop */}
            <path d="M 300 -100 C 600 500, 900 150, 1200 1000" stroke="#ff3d8b" strokeWidth="2.0" strokeLinecap="round" fill="none" />

            {/* Curve 3: Cyan Sweep */}
            <path d="M -100 700 C 450 480, 950 880, 1540 600" stroke="#00e5ff" strokeWidth="2.8" strokeLinecap="round" fill="none" />

            {/* Curve 4: Yellow Curve */}
            <path d="M 1000 -100 C 1120 450, 1320 280, 1540 1000" stroke="#ffc700" strokeWidth="2.0" strokeLinecap="round" fill="none" />
          </svg>
        </div>

        <div className="w-full max-w-6xl flex flex-col lg:flex-row gap-8 lg:gap-12 items-center bg-block-lime p-8 md:p-12 rounded-lg border border-hairline relative z-10">
          {/* Left Column: Typography & Preview */}
          <div className="w-full lg:w-3/5 space-y-6 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="space-y-2">
              <h1 className="text-display-md tracking-tight">Ready to join?</h1>
              <p className="text-body-default max-w-md">Configure your media devices and check your camera feed before connecting.</p>
            </div>

            <div className="w-full max-w-xl aspect-video rounded-lg bg-black text-white overflow-hidden flex items-center justify-center relative">
              {lobbyStream && !isMutedVideo ? (
                <video ref={lobbyVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
              ) : (
                <div className="flex flex-col items-center justify-center space-y-4 select-none">
                  <div className="w-20 h-20 bg-canvas/10 text-white rounded-full flex items-center justify-center">
                    <User className="w-10 h-10" />
                  </div>
                  <span className="text-xs font-bold">Your camera is off</span>
                </div>
              )}
              <div className="absolute bottom-4 left-4 flex items-center space-x-2 z-10">
                <div className={`p-2 rounded-full border transition-all ${isMutedAudio ? 'bg-red-500 border-red-500' : 'bg-canvas/20 border-canvas'}`}>
                  {isMutedAudio ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-white" />}
                </div>
                <div className={`p-2 rounded-full border transition-all ${isMutedVideo ? 'bg-red-500 border-red-500' : 'bg-canvas/20 border-canvas'}`}>
                  {isMutedVideo ? <VideoOff className="w-4 h-4 text-white" /> : <Video className="w-4 h-4 text-white" />}
                </div>
              </div>
            </div>

            <div className="flex justify-center space-x-4 w-full max-w-xl">
              <Button onClick={handleToggleLobbyAudio} variant={isMutedAudio ? 'primary' : 'secondary'} className={isMutedAudio ? '!bg-red-500 !border-red-500 !text-white' : ''}>
                {isMutedAudio ? <MicOff className="w-5 h-5 mr-2" /> : <Mic className="w-5 h-5 mr-2" />}
                {isMutedAudio ? 'Unmute' : 'Mute'}
              </Button>
              <Button onClick={handleToggleLobbyVideo} variant={isMutedVideo ? 'primary' : 'secondary'} className={isMutedVideo ? '!bg-red-500 !border-red-500 !text-white' : ''}>
                {isMutedVideo ? <VideoOff className="w-5 h-5 mr-2" /> : <Video className="w-5 h-5 mr-2" />}
                {isMutedVideo ? 'Start Video' : 'Stop Video'}
              </Button>
            </div>
          </div>

          {/* Right Column: Settings */}
          <div className="w-full lg:w-2/5">
            <div className="bg-canvas border border-hairline rounded-lg p-6 md:p-8 space-y-6">
              <div className="space-y-4">
                <div className="bg-canvas border border-hairline rounded-lg p-4 space-y-3">
                  <span className="text-eyebrow block">Joining As</span>
                  {user ? (
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold">
                        {user.fullName?.charAt(0).toUpperCase() || 'U'}
                      </div>
                      <span className="text-body-strong">{user.fullName}</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center font-bold flex-shrink-0">
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
                          className="w-full bg-canvas border border-hairline rounded-sm px-3 py-2 text-body-sm focus:border-ink outline-none transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button onClick={() => setIsLobbySettingsOpen(true)} variant="secondary" className="w-full justify-between">
                  <div className="flex items-center space-x-2">
                    <Camera className="w-4 h-4" />
                    <span>Check Devices</span>
                  </div>
                  <Settings className="w-4 h-4 opacity-75" />
                </Button>

                <SmartJoinDiagnostics
                  stream={lobbyStream}
                  audioDeviceCount={audioDevices.length}
                  videoDeviceCount={videoDevices.length}
                  isMutedAudio={isMutedAudio}
                  isMutedVideo={isMutedVideo}
                />

                <div className="bg-[#202124] text-white border border-white/10 rounded-lg p-4 space-y-3 overflow-hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Vibe Check</span>
                    <span className="text-[10px] text-white/50">Privacy blur</span>
                  </div>
                  <div className="relative aspect-video rounded-md overflow-hidden bg-[#2a2d32]">
                    {lobbyStream && !isMutedVideo ? (
                      <video ref={lobbyVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" style={{ filter: 'blur(18px)', transform: 'scaleX(-1) scale(1.08)' }} />
                    ) : (
                      <div className="w-full h-full grid grid-cols-2 gap-1.5 p-3 opacity-75">
                        <div className="rounded bg-emerald-400/25 animate-pulse" />
                        <div className="rounded bg-[#fbbc04]/25 animate-pulse" />
                        <div className="rounded bg-[#8ab4f8]/25 animate-pulse" />
                        <div className="rounded bg-[#ff3d8b]/25 animate-pulse" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center text-center px-4">
                      <span className="text-[11px] font-bold text-white/85">Private room activity preview</span>
                    </div>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleJoinCall}
                disabled={!user && !guestUsername.trim()}
                variant="primary"
                className="w-full !py-4"
              >
                Join Meeting
              </Button>
            </div>
          </div>
        </div>

        <Modal isOpen={isLobbySettingsOpen} onClose={() => setIsLobbySettingsOpen(false)} title="Audio & Video Settings">
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
      <div className="min-h-screen flex items-center justify-center bg-black text-center px-4">
        <div className="max-w-md space-y-4">
          <div className="text-red-500 text-3xl">🚫</div>
          <h2 className="text-lg font-black text-white">Entry Denied</h2>
          <p className="text-sm text-white/80">
            {denialReason || 'The meeting host did not approve your entry request.'}
          </p>
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
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
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
      room={customRoom || undefined}
      data-lk-theme="default"
      className="h-screen w-screen overflow-hidden bg-[#202124] text-[#e8eaed]"
      style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}
    >
      <SpatialAudioRenderer />
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
    <div className="h-screen w-screen flex flex-col justify-between p-3 bg-black text-white overflow-hidden font-sans">
      <div className="flex-grow flex items-center justify-center min-h-0 bg-black-elevated rounded-xl border border-white/5 overflow-hidden relative">
        <VideoGrid />
      </div>

      <div className="flex items-center justify-center space-x-3.5 mt-2.5">
        <button
          onClick={toggleAudio}
          className={`p-2.5 rounded-xl transition-all duration-200 focus:outline-none cursor-pointer ${
            localMuteAudio 
              ? 'bg-red-600 hover:bg-red-700 text-white border border-transparent' 
              : 'bg-white/10 hover:bg-black text-white border border-white/10'
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
              : 'bg-white/10 hover:bg-black text-white border border-white/10'
          }`}
          title={localMuteVideo ? 'Start Video' : 'Stop Video'}
        >
          {localMuteVideo ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
        </button>
        
        <button
          onClick={onClose}
          className="p-2.5 bg-white/10 hover:bg-black text-white border border-white/10 rounded-xl cursor-pointer"
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
    setLocalHandRaised,
    setParticipants,
    addParticipant,
    removeParticipant,
    updateParticipantMute,
    toggleWhiteboard,
    toggleTranscriptionPanel,
    setPolls,
    addPoll,
    updatePollVotes,
    closePoll,
    deletePoll,
    setQuestions,
    addQuestion,
    updateQuestionUpvotes,
    setQuestionAnswered,
    deleteQuestion,
    isMultiplayerCursorEnabled,
    setMultiplayerCursorEnabled,
    isChatLocked,
    isScreenShareLocked,
    setModerationPolicy,
    transcripts,
    chatMessages,
    isWorkspaceOpen,
    setWorkspaceOpen,
    isCopilotOpen,
    setCopilotOpen,
    isSpatialAudioEnabled,
    setSpatialAudioEnabled
  } = useMeetingStore();

  const {
    isMutedAudio,
    setAudioMute,
    setVideoMute,
    isPushToTalkEnabled,
    showCaptions,
    isNoiseSuppressionEnabled,
    virtualBackgroundMode,
    isLowBandwidthMode,
    isGestureReactionsEnabled
  } = useWebRTCStore();

  useGestureDetector(isGestureReactionsEnabled);

  const room = useRoomContext();

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const localAudioStream = React.useMemo(() => {
    const audioTrack = localParticipant?.getTrackPublication('microphone' as any)?.audioTrack?.mediaStreamTrack;
    return audioTrack ? new MediaStream([audioTrack]) : null;
  }, [localParticipant, isMicrophoneEnabled]);
  const { getToken } = useAuth();
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [chatToasts, setChatToasts] = useState<Array<{ id: string; sender: string; text: string }>>([]);

  // Breakout Rooms states
  const [isBreakoutActive, setIsBreakoutActive] = useState(false);
  const [breakoutTimeLeft, setBreakoutTimeLeft] = useState<number | null>(null);
  const [isBreakoutModalOpen, setIsBreakoutModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isReleaseNotesOpen, setIsReleaseNotesOpen] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Soundboard states
  const [isSoundboardHUDOpen, setIsSoundboardHUDOpen] = useState(false);
  const [activeSoundId, setActiveSoundId] = useState<string | null>(null);
  const [isUiControlsVisible, setIsUiControlsVisible] = useState(true);

  const { isRecording, startRecording, stopRecording } = useCallRecorder();

  // Play synthesized join sound on mount (when the user enters the active meeting room)
  useEffect(() => {
    playSynthesizedSound('coin');
  }, []);

  // Dynamic Low Bandwidth track subscription manager
  useEffect(() => {
    if (!room) return;

    const handleSubscriptions = () => {
      room.remoteParticipants.forEach((p: any) => {
        p.trackPublications.forEach((pub: any) => {
          if (pub.kind === 'video') {
            pub.setSubscribed(!isLowBandwidthMode);
          }
        });
      });
    };

    handleSubscriptions();

    const handleTrackPublished = (pub: any) => {
      if (pub.kind === 'video') {
        pub.setSubscribed(!isLowBandwidthMode);
      }
    };

    room.on('trackPublished', handleTrackPublished);
    return () => {
      room.off('trackPublished', handleTrackPublished);
    };
  }, [room, isLowBandwidthMode]);

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

  // Auto-hide UI controls on mouse inactivity
  useEffect(() => {
    let timeoutId: any = null;

    const resetTimer = () => {
      setIsUiControlsVisible(true);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        // If soundboard HUD, shortcuts modal, or settings modal is open, do not auto-hide
        if (
          useMeetingStore.getState().isSettingsOpen || 
          useMeetingStore.getState().isShortcutsOpen ||
          isBreakoutModalOpen ||
          isInviteModalOpen ||
          isFollowUpModalOpen ||
          isReleaseNotesOpen
        ) {
          return;
        }
        setIsUiControlsVisible(false);
      }, 3000);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('keydown', resetTimer);

    // Initial timer trigger
    resetTimer();

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isBreakoutModalOpen, isInviteModalOpen, isFollowUpModalOpen, isReleaseNotesOpen]);

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

      const myUserId = user?.id || localParticipant?.identity;
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
  }, [code, user, localParticipant?.identity, activeRoomName, setActiveRoomName, setLiveKitToken]);

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
      if (message.senderId !== user?.id) {
        const toastId = `toast-${Date.now()}-${Math.random()}`;
        setChatToasts(prev => [...prev, { id: toastId, sender: message.senderName || 'Anonymous', text: message.text }]);
        setTimeout(() => {
          setChatToasts(prev => prev.filter(t => t.id !== toastId));
        }, 4000);
      }
    };

    const handleHandRaised = ({ userId, isRaised }: { userId: string; isRaised: boolean }) => {
      updateParticipantHand(userId, isRaised);
    };

    const handleLowerHandsCommand = () => {
      setLocalHandRaised(false);
      signalingClient.raiseHand(false);
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
      playSynthesizedSound('coin');
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

    const handlePollsHistory = ({ polls }: { polls: any[] }) => {
      setPolls(polls);
    };

    const handlePollCreated = ({ poll }: { poll: any }) => {
      addPoll(poll);
    };

    const handlePollVoted = ({ pollId, optionId, voterId }: { pollId: string; optionId: string; voterId: string }) => {
      updatePollVotes(pollId, optionId, voterId);
    };

    const handlePollClosed = ({ pollId }: { pollId: string }) => {
      closePoll(pollId);
    };

    const handlePollDeleted = ({ pollId }: { pollId: string }) => {
      deletePoll(pollId);
    };

    const handleQuestionsHistory = ({ questions }: { questions: any[] }) => {
      setQuestions(questions);
    };

    const handleQuestionCreated = ({ question }: { question: any }) => {
      addQuestion(question);
    };

    const handleQuestionUpvoted = ({ questionId, voterId, isUpvote }: { questionId: string; voterId: string; isUpvote: boolean }) => {
      updateQuestionUpvotes(questionId, voterId, isUpvote);
    };

    const handleQuestionAnswered = ({ questionId, isAnswered }: { questionId: string; isAnswered: boolean }) => {
      setQuestionAnswered(questionId, isAnswered);
    };

    const handleQuestionDeleted = ({ questionId }: { questionId: string }) => {
      deleteQuestion(questionId);
    };

    const handleMultiplayerCursorsToggled = ({ enabled }: { enabled: boolean }) => {
      setMultiplayerCursorEnabled(enabled);
    };

    const handleModerationPolicy = (policy: { isChatLocked?: boolean; isScreenShareLocked?: boolean }) => {
      setModerationPolicy(policy);
    };

    const handleWorkspaceUpdate = (data: { type: 'markdown' | 'code'; content: string }) => {
      const isEditingMarkdown = document.activeElement?.id === 'workspace-markdown-textarea';
      const isEditingCode = document.activeElement?.id === 'workspace-code-textarea';
      
      if (data.type === 'markdown' && !isEditingMarkdown) {
        useMeetingStore.getState().setMarkdownContent(data.content);
      } else if (data.type === 'code' && !isEditingCode) {
        useMeetingStore.getState().setCodeContent(data.content);
      }
    };

    signalingClient.on('chat-received', handleChatReceived);
    signalingClient.on('hand-raised', handleHandRaised);
    signalingClient.on('lower-hands-command', handleLowerHandsCommand);
    signalingClient.on('mute-command', handleMuteCommand);
    signalingClient.on('room-participants', handleRoomParticipants);
    signalingClient.on('peer-joined', handlePeerJoined);
    signalingClient.on('peer-left', handlePeerLeft);
    signalingClient.on('peer-muted-status', handlePeerMutedStatus);
    signalingClient.on('soundboard-play', handleSoundboardPlay);
    signalingClient.on('polls-history', handlePollsHistory);
    signalingClient.on('poll-created', handlePollCreated);
    signalingClient.on('poll-voted', handlePollVoted);
    signalingClient.on('poll-closed', handlePollClosed);
    signalingClient.on('poll-deleted', handlePollDeleted);
    signalingClient.on('questions-history', handleQuestionsHistory);
    signalingClient.on('question-created', handleQuestionCreated);
    signalingClient.on('question-upvoted', handleQuestionUpvoted);
    signalingClient.on('question-answered', handleQuestionAnswered);
    signalingClient.on('question-deleted', handleQuestionDeleted);
    signalingClient.on('multiplayer-cursors-toggled', handleMultiplayerCursorsToggled);
    signalingClient.on('moderation-policy-updated', handleModerationPolicy);
    signalingClient.on('workspace-update', handleWorkspaceUpdate);

    return () => {
      signalingClient.off('chat-received', handleChatReceived);
      signalingClient.off('hand-raised', handleHandRaised);
      signalingClient.off('lower-hands-command', handleLowerHandsCommand);
      signalingClient.off('mute-command', handleMuteCommand);
      signalingClient.off('room-participants', handleRoomParticipants);
      signalingClient.off('peer-joined', handlePeerJoined);
      signalingClient.off('peer-left', handlePeerLeft);
      signalingClient.off('peer-muted-status', handlePeerMutedStatus);
      signalingClient.off('soundboard-play', handleSoundboardPlay);
      signalingClient.off('polls-history', handlePollsHistory);
      signalingClient.off('poll-created', handlePollCreated);
      signalingClient.off('poll-voted', handlePollVoted);
      signalingClient.off('poll-closed', handlePollClosed);
      signalingClient.off('poll-deleted', handlePollDeleted);
      signalingClient.off('questions-history', handleQuestionsHistory);
      signalingClient.off('question-created', handleQuestionCreated);
      signalingClient.off('question-upvoted', handleQuestionUpvoted);
      signalingClient.off('question-answered', handleQuestionAnswered);
      signalingClient.off('question-deleted', handleQuestionDeleted);
      signalingClient.off('multiplayer-cursors-toggled', handleMultiplayerCursorsToggled);
      signalingClient.off('moderation-policy-updated', handleModerationPolicy);
      signalingClient.off('workspace-update', handleWorkspaceUpdate);
    };
  }, [
    localParticipant,
    code,
    addChatMessage,
    updateParticipantHand,
    setLocalHandRaised,
    setAudioMute,
    setVideoMute,
    setParticipants,
    addParticipant,
    removeParticipant,
    updateParticipantMute,
    setActiveSoundId,
    setPolls,
    addPoll,
    updatePollVotes,
    closePoll,
    deletePoll,
    setQuestions,
    addQuestion,
    updateQuestionUpvotes,
    setQuestionAnswered,
    deleteQuestion,
    setChatToasts,
    user?.id,
    setMultiplayerCursorEnabled,
    setModerationPolicy
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
        w.document.body.classList.add('dark', 'bg-black');
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
    <div className="h-full w-full flex flex-col overflow-hidden font-sans bg-[#202124]">
      
      {/* Floating Emoji Reaction Overlay */}
      <ReactionOverlay reactions={reactionList} />
      <IntentToSpeakIndicator stream={localAudioStream} enabled={!!isMicrophoneEnabled} />

      {/* Breakout rooms notification banner */}
      {isBreakoutActive && breakoutTimeLeft !== null && (
        <div className="bg-[#fbbc04] text-[#202124] text-center py-2 px-6 text-xs font-semibold flex items-center justify-between z-40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#202124] animate-pulse" />
            <span>
              {activeRoomName === code 
                ? "Breakout Rooms active — you are in the Main Room" 
                : `Breakout Room: ${activeRoomName.replace(code + '-breakout-', 'Room ')}`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-[#202124]/15 px-2 py-0.5 rounded font-mono text-[11px]">
              {Math.floor(breakoutTimeLeft / 60)}:{(breakoutTimeLeft % 60).toString().padStart(2, '0')}
            </span>
            {myRole === 'host' && (
              <button
                onClick={() => signalingClient.sendEndBreakout()}
                className="bg-[#202124] text-[#fbbc04] px-3 py-1 rounded-full text-[10px] font-semibold hover:bg-[#3c4043] transition-colors cursor-pointer"
              >
                End Breakout
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* ── Top bar ── */}
      <header className={`flex items-center justify-between px-4 py-2 z-35 transition-all duration-300 ${isUiControlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none -translate-y-4'}`}>
        {/* Left: Meeting info */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-medium text-[#e8eaed] truncate max-w-[240px]">
            {currentMeeting?.title || 'Meeting'}
          </span>
          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-[#9aa0a6]">
            <span className="bg-[#3c4043] px-2 py-0.5 rounded text-[#e8eaed] font-mono">{code}</span>
            <button onClick={handleCopyRoomLink} className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer" title="Copy link">
              {hasCopiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-[#9aa0a6] hover:text-[#e8eaed]" />}
            </button>
            {myRole === 'host' && (
              <button onClick={() => setIsInviteModalOpen(true)} className="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer" title="Invite">
                <Mail className="w-3.5 h-3.5 text-[#9aa0a6] hover:text-[#e8eaed]" />
              </button>
            )}
          </div>
        </div>

        {/* Right: Quick actions */}
        <div className="flex items-center gap-1">
          {myRole === 'host' && (
            <>
              <button onClick={handleToggleRoomLock} className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${currentMeeting?.is_locked ? 'text-[#ea4335]' : 'text-emerald-400'}`} title={currentMeeting?.is_locked ? 'Unlock' : 'Lock'}>
                {currentMeeting?.is_locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </button>
              <button onClick={() => setIsBreakoutModalOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-[#8ab4f8] transition-colors cursor-pointer" title="Breakout Rooms">
                <Users className="w-4 h-4" />
              </button>
              <button 
                onClick={() => signalingClient.sendMultiplayerCursorsToggle(!isMultiplayerCursorEnabled)} 
                className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isMultiplayerCursorEnabled ? 'text-pink-500' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`} 
                title={isMultiplayerCursorEnabled ? 'Disable Multiplayer Cursors (Beta)' : 'Enable Multiplayer Cursors (Beta)'}
              >
                <MousePointer className="w-4 h-4" />
              </button>
              <button
                onClick={() => signalingClient.sendModerationPolicy({ isChatLocked: !isChatLocked })}
                className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isChatLocked ? 'text-[#ea4335]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`}
                title={isChatLocked ? 'Unlock chat' : 'Lock chat'}
              >
                <MessageSquare className="w-4 h-4" />
              </button>
              <button
                onClick={() => signalingClient.sendModerationPolicy({ isScreenShareLocked: !isScreenShareLocked })}
                className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isScreenShareLocked ? 'text-[#ea4335]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`}
                title={isScreenShareLocked ? 'Allow participant sharing' : 'Lock participant sharing'}
              >
                <MonitorOff className="w-4 h-4" />
              </button>
            </>
          )}

          <button onClick={isRecording ? stopRecording : startRecording} className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isRecording ? 'text-[#ea4335]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`} title={isRecording ? 'Stop Recording' : 'Record'}>
            <Circle className={`w-4 h-4 ${isRecording ? 'fill-[#ea4335] animate-pulse' : ''}`} />
          </button>

          <button onClick={toggleWhiteboard} className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isWhiteboardOpen ? 'text-[#8ab4f8]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`} title="Whiteboard">
            <Palette className="w-4 h-4" />
          </button>

          <button onClick={toggleTranscriptionPanel} className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isTranscriptionPanelOpen ? 'text-[#8ab4f8]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`} title="Transcript">
            <FileText className="w-4 h-4" />
          </button>

          <button onClick={() => setIsFollowUpModalOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-[#9aa0a6] hover:text-[#e8eaed] transition-colors cursor-pointer" title="Generate follow-up email">
            <Mail className="w-4 h-4" />
          </button>

          <button onClick={() => setWorkspaceOpen(!isWorkspaceOpen)} className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isWorkspaceOpen ? 'text-[#8ab4f8]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`} title="Shared App Workspace">
            <Code className="w-4 h-4" />
          </button>

          <button onClick={() => setCopilotOpen(!isCopilotOpen)} className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isCopilotOpen ? 'text-[#8ab4f8]' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`} title="AI Copilot">
            <Sparkles className="w-4 h-4" />
          </button>

          <button onClick={() => setSpatialAudioEnabled(!isSpatialAudioEnabled)} className={`p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer ${isSpatialAudioEnabled ? 'text-emerald-400 bg-emerald-500/10' : 'text-[#9aa0a6] hover:text-[#e8eaed]'}`} title={isSpatialAudioEnabled ? "Spatial 3D Audio Enabled" : "Enable Spatial 3D Audio"}>
            <Headphones className="w-4 h-4" />
          </button>

          <button onClick={() => setIsReleaseNotesOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-yellow-400 hover:text-yellow-300 transition-colors cursor-pointer" title="What's New in v0.5.0">
            <Sparkles className="w-4 h-4 fill-yellow-400/20" />
          </button>

          {'documentPictureInPicture' in window && (
            <button onClick={togglePip} className="p-2 rounded-full hover:bg-white/10 text-[#9aa0a6] hover:text-[#e8eaed] transition-colors cursor-pointer" title="PiP">
              <PictureInPicture className="w-4 h-4" />
            </button>
          )}

          <button onClick={() => setShortcutsOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-[#9aa0a6] hover:text-[#e8eaed] transition-colors cursor-pointer" title="Shortcuts">
            <Keyboard className="w-4 h-4" />
          </button>

          <button onClick={() => setSettingsOpen(true)} className="p-2 rounded-full hover:bg-white/10 text-[#9aa0a6] hover:text-[#e8eaed] transition-colors cursor-pointer" title="Settings">
            <Settings className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1 bg-[#3c4043] px-2 py-1 rounded-full text-[11px] text-[#e8eaed] ml-1">
            <Users className="w-3 h-3" />
            <span>{participants.length + 1}</span>
          </div>
        </div>
      </header>

      {/* Main conference body */}
      <div className="flex-grow flex relative min-h-0 bg-[#202124]">
        
        {/* Central area */}
        <div className="flex-grow flex flex-col min-h-0 overflow-y-auto no-scrollbar relative">
          {isWhiteboardOpen ? (
            <div className="flex-grow p-2 min-h-0">
              <WhiteboardPanel />
            </div>
          ) : isTabVisible ? (
            <VideoGrid />
          ) : (
            <div className="flex-grow flex flex-col items-center justify-center bg-[#292b2f] rounded-xl m-2 p-8 select-none">
              <div className="w-12 h-12 bg-[#8ab4f8]/10 text-[#8ab4f8] rounded-full flex items-center justify-center mb-3 animate-pulse">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-medium text-[#e8eaed] mb-1">Tab in background</h3>
              <p className="text-xs text-[#9aa0a6] text-center max-w-[240px]">
                Video streams are paused to save resources while you're in another tab.
              </p>
            </div>
          )}

          {/* Live Captions Overlay */}
          {showCaptions && Object.keys(activeCaptions).length > 0 && (
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-25 max-w-2xl w-full px-4 space-y-2 pointer-events-none select-none">
              {Object.values(activeCaptions).map((caption, idx) => (
                <div
                  key={idx}
                  className="bg-black/80 backdrop-blur-sm px-4 py-2.5 rounded-lg text-center transition-all duration-300"
                >
                  <span className="text-[#8ab4f8] font-medium text-xs mr-2">{caption.username}:</span>
                  <span className="text-white text-sm">{caption.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Chat Toasts Overlay */}
          {chatToasts.length > 0 && (
            <div className="absolute bottom-6 left-6 z-30 space-y-2 pointer-events-none max-w-xs">
              {chatToasts.map((toast) => (
                <div
                  key={toast.id}
                  className="bg-black/85 border border-white/[0.08] px-3 py-2 rounded-lg text-left shadow-lg animate-in slide-in-from-bottom duration-250 flex flex-col gap-0.5"
                >
                  <span className="text-[#8ab4f8] font-bold text-[10px]">{toast.sender}</span>
                  <span className="text-white text-xs leading-normal">{toast.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Sidebar panels */}
        {isChatPanelOpen && (
          <div className="w-80 bg-[#292b2f] border-l border-white/[0.06] z-40 overflow-hidden flex flex-col animate-in slide-in-from-right duration-200">
            <ChatPanel 
              roomId={code || ''} 
              userId={user?.id || ''} 
              username={user?.fullName || 'Guest User'} 
            />
          </div>
        )}

        {isParticipantsPanelOpen && (
          <div className="w-80 bg-[#292b2f] border-l border-white/[0.06] z-40 overflow-hidden flex flex-col animate-in slide-in-from-right duration-200">
            <ParticipantPanel />
          </div>
        )}

        {isTranscriptionPanelOpen && (
          <div className="w-80 bg-[#292b2f] border-l border-white/[0.06] z-40 overflow-hidden flex flex-col animate-in slide-in-from-right duration-200">
            <TranscriptionPanel />
          </div>
        )}

        {isWorkspaceOpen && (
          <WorkspacePanel />
        )}

        {isCopilotOpen && (
          <AiCopilotPanel />
        )}
      </div>

      {/* Soundboard HUD */}
      {isSoundboardHUDOpen && (
        <div className={`absolute left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4 transition-all duration-300 ${
          isUiControlsVisible ? 'bottom-20 opacity-100' : 'bottom-6 opacity-0 pointer-events-none'
        }`}>
          <div className="bg-[#292b2f] border border-white/[0.06] rounded-xl p-4 shadow-lg flex flex-col gap-3">
            <div className="flex justify-between items-center border-b border-white/[0.06] pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#8ab4f8]">🔊 Soundboard</span>
                <span className="text-[10px] text-[#9aa0a6] bg-[#3c4043] px-1.5 py-0.5 rounded">Hotkeys</span>
              </div>
              <span className="text-[10px] text-[#9aa0a6]">
                <kbd className="bg-[#3c4043] px-1.5 py-0.5 rounded text-[#e8eaed] font-mono text-[9px]">
                  {typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent) ? '⌥S' : 'Alt+S'}
                </kbd> to close
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SOUND_DEFINITIONS.map((sound) => {
                const isActive = activeSoundId === sound.id;
                return (
                  <div
                    key={sound.id}
                    className={`flex items-center justify-between p-2 rounded-lg text-[11px] transition-all ${
                      isActive
                        ? 'bg-[#8ab4f8] text-[#202124] font-semibold'
                        : 'bg-[#3c4043] text-[#e8eaed] hover:bg-[#4a4d52]'
                    }`}
                  >
                    <span className="truncate font-medium">{sound.name}</span>
                    <kbd className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                      isActive ? 'bg-white/20' : 'bg-[#202124] text-[#9aa0a6]'
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

      {/* Bottom controls */}
      <MeetingControls
        onLeave={handleLeaveMeeting}
        hasUnreadMessages={hasUnreadChat}
        markChatRead={() => setHasUnreadChat(false)}
        className={isUiControlsVisible ? 'translate-y-0 opacity-100' : 'translate-y-16 opacity-0 pointer-events-none'}
      />

      {/* Mute suggestion */}
      {showMuteSuggestion && (
        <div className="absolute bottom-20 left-4 z-40 bg-[#292b2f] border border-white/[0.06] text-[#e8eaed] px-4 py-3 rounded-xl flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <MicOff className="w-4 h-4 text-[#ea4335]" />
          <div className="flex flex-col">
            <span className="text-xs font-medium">Your mic is muted</span>
            <span className="text-[10px] text-[#9aa0a6]">Unmute to speak?</span>
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
            className="ml-1 px-3 py-1.5 bg-[#8ab4f8] text-[#202124] text-[11px] font-semibold rounded-full hover:bg-[#aecbfa] transition-colors cursor-pointer"
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

      {/* FOLLOW-UP EMAIL MODAL */}
      <Modal
        isOpen={isFollowUpModalOpen}
        onClose={() => setIsFollowUpModalOpen(false)}
        title="Generate Follow-up Email"
        size="lg"
      >
        <FollowUpEmailModal
          meetingTitle={currentMeeting?.title || 'Meeting'}
          meetingCode={code || ''}
          participants={participants}
          transcripts={transcripts}
          chatMessages={chatMessages}
        />
      </Modal>

      {/* RELEASE NOTES MODAL */}
      <Modal
        isOpen={isReleaseNotesOpen}
        onClose={() => setIsReleaseNotesOpen(false)}
        title="Release Notes - Chatsie v0.5.0"
        size="lg"
      >
        <ReleaseNotesModal onClose={() => setIsReleaseNotesOpen(false)} />
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
                className="w-10 h-10 rounded-full border border-hairline bg-black flex-shrink-0 object-cover"
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
