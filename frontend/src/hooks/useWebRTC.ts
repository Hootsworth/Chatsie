import { useEffect, useRef, useCallback, useState } from 'react';
import { useMeetingStore } from '../stores/meetingStore';
import { useWebRTCStore } from '../stores/webrtcStore';
import type { DeviceInfo } from '../stores/webrtcStore';
import { signalingClient } from '../services/signaling';
import { limitSenderBitrate, createVoiceActivityDetector } from '../utils/webrtc-utils';

export const useWebRTC = (roomId: string, userId: string, username: string) => {
  const [localStreamReady, setLocalStreamReady] = useState(false);

  const {
    myRole,
    waitingStatus,
    addParticipant,
    removeParticipant,
    updateParticipantMute,
    updateParticipantHand,
    setWaitingStatus,
    setWaitingRoomList,
    addChatMessage
  } = useMeetingStore();

  const {
    localStream,
    screenShareStream,
    isMutedAudio,
    isMutedVideo,
    isScreenSharing,
    selectedAudioInput,
    selectedVideoInput,
    setLocalStream,
    setScreenShareStream,
    addRemoteStream,
    removeRemoteStream,
    setAudioMute,
    setVideoMute,
    setScreenSharing,
    setDevices,
    setActiveSpeaker,
    setConnectionQuality
  } = useWebRTCStore();

  // Keep references to peer connections in a mutable ref (non-react state)
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenShareStreamRef = useRef<MediaStream | null>(null);
  
  // Refs for current states to avoid stale closures in WebRTC callbacks
  const isMutedAudioRef = useRef(isMutedAudio);
  const isMutedVideoRef = useRef(isMutedVideo);
  const isScreenSharingRef = useRef(isScreenSharing);
  
  // Ref for voice activity cleanup
  const voiceCleanup = useRef<(() => void) | null>(null);

  // Keep track of peers whose signaling connection has left/reconnected
  const departedSignalingPeers = useRef<Set<string>>(new Set());

  // Cache for ICE servers config to avoid duplicate fetches
  const iceConfigCache = useRef<RTCConfiguration | null>(null);

  // Queue to hold incoming ICE candidates until remote description is set
  const iceCandidateQueues = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Sync refs with state changes
  useEffect(() => { isMutedAudioRef.current = isMutedAudio; }, [isMutedAudio]);
  useEffect(() => { isMutedVideoRef.current = isMutedVideo; }, [isMutedVideo]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);

  // Default ICE servers if API fails (includes free TURN servers for public NAT traversal)
  const defaultIceServers = [
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:openrelay.metered.ca:80'
      ]
    },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];

  // Fetch ICE configuration from serverless backend (cached)
  const fetchIceServers = async (): Promise<RTCConfiguration> => {
    if (iceConfigCache.current) return iceConfigCache.current;

    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (apiUrl && apiUrl !== 'undefined' && apiUrl !== 'null') {
        const response = await fetch(`${apiUrl}/api/turn-credentials`);
        if (response.ok) {
          const data = await response.json();
          if (data.iceServers && data.iceServers.length > 0) {
            // Check if there is at least one TURN server in the returned list
            const hasTurn = data.iceServers.some((server: any) => {
              if (Array.isArray(server.urls)) {
                return server.urls.some((url: string) => url.startsWith('turn:'));
              }
              return typeof server.urls === 'string' && server.urls.startsWith('turn:');
            });

            if (hasTurn) {
              const config = { iceServers: data.iceServers };
              iceConfigCache.current = config;
              return config;
            } else {
              console.warn('useWebRTC: Fetched ICE servers do not contain any TURN servers. Merging default TURN servers.');
              // Filter to get TURN servers from defaultIceServers
              const turnFallbacks = defaultIceServers.filter(server => {
                return server.urls.some((url: string) => url.startsWith('turn:'));
              });
              const config = { iceServers: [...data.iceServers, ...turnFallbacks] };
              iceConfigCache.current = config;
              return config;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch TURN credentials from serverless endpoint, falling back to defaults:', e);
    }
    const defaultConfig = { iceServers: defaultIceServers };
    iceConfigCache.current = defaultConfig;
    return defaultConfig;
  };

  // Get available user audio/video devices
  const getDevices = useCallback(async () => {
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
        console.warn('useWebRTC: Failed to get both audio and video, trying audio-only...', err);
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (err2) {
          console.warn('useWebRTC: Failed audio-only, trying video-only...', err2);
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
          } catch (err3) {
            console.warn('useWebRTC: Failed all media permission attempts. Listing default labels.', err3);
          }
        }
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      
      const audio: DeviceInfo[] = [];
      const video: DeviceInfo[] = [];
      const speaker: DeviceInfo[] = [];
      
      devices.forEach(device => {
        const payload = { deviceId: device.deviceId, label: device.label || `${device.kind} (Default)` };
        if (device.kind === 'audioinput') audio.push(payload);
        else if (device.kind === 'videoinput') video.push(payload);
        else if (device.kind === 'audiooutput') speaker.push(payload);
      });
      
      setDevices(audio, video, speaker);
    } catch (error) {
      console.error('Error fetching media devices:', error);
    }
  }, [setDevices]);

  // Stop all active tracks on local streams
  const stopLocalTracks = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (screenShareStreamRef.current) {
      screenShareStreamRef.current.getTracks().forEach(track => track.stop());
      screenShareStreamRef.current = null;
      setScreenShareStream(null);
      setScreenSharing(false);
    }
    if (voiceCleanup.current) {
      voiceCleanup.current();
      voiceCleanup.current = null;
    }
  }, [setLocalStream, setScreenShareStream, setScreenSharing]);

  // Create an RTCPeerConnection for a remote peer
  const createPeerConnection = useCallback(async (targetSocketId: string, iceConfig: RTCConfiguration): Promise<RTCPeerConnection> => {
    const pc = new RTCPeerConnection(iceConfig);
    peerConnections.current.set(targetSocketId, pc);

    // Add local tracks to the connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          let trackToSend = track;
          let streamToSend = localStreamRef.current;

          if (track.kind === 'video' && isScreenSharingRef.current && screenShareStreamRef.current) {
            const screenTrack = screenShareStreamRef.current.getVideoTracks()[0];
            if (screenTrack) {
              trackToSend = screenTrack;
              streamToSend = screenShareStreamRef.current;
              console.log('useWebRTC: Adding screen share video track to new peer connection instead of camera');
            }
          }

          const sender = pc.addTrack(trackToSend, streamToSend);
          if (trackToSend.kind === 'video') {
            limitSenderBitrate(sender); // Constrain video bitrate to 250 kbps
          }
        }
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingClient.sendSignal(targetSocketId, { candidate: event.candidate });
      }
    };

    // Remote Track Handler
    pc.ontrack = (event) => {
      console.log(`Received remote track from ${targetSocketId}:`, event.track.kind);
      const remoteStream = event.streams[0];
      addRemoteStream(targetSocketId, remoteStream);
    };

    // Connection Quality State Monitor
    pc.onconnectionstatechange = () => {
      console.log(`Peer ${targetSocketId} connection state changed to:`, pc.connectionState);
      
      let state: 'good' | 'fair' | 'poor' | 'disconnected' = 'good';
      if (pc.connectionState === 'connecting') state = 'fair';
      if (pc.connectionState === 'failed') state = 'poor';
      
      const isDead = pc.connectionState === 'failed' || pc.connectionState === 'closed';
      const isDisconnected = pc.connectionState === 'disconnected';
      const isSignalingDeparted = departedSignalingPeers.current.has(targetSocketId);
      
      if (isDead || (isDisconnected && isSignalingDeparted)) {
        state = 'disconnected';
        departedSignalingPeers.current.delete(targetSocketId);
        try {
          pc.close();
        } catch (e) {
          // already closed
        }
        peerConnections.current.delete(targetSocketId);
        iceCandidateQueues.current.delete(targetSocketId);
        removeRemoteStream(targetSocketId);
        removeParticipant(targetSocketId);
      }
      setConnectionQuality(targetSocketId, state);
    };

    // Listen to ICE connection state for fallback diagnostics
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce(); // Attempt connection recovery
      }
    };

    return pc;
  }, [addRemoteStream, removeRemoteStream, removeParticipant, setConnectionQuality]);

  // Clean up a peer connection
  const closePeerConnection = useCallback((socketId: string) => {
    const pc = peerConnections.current.get(socketId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(socketId);
    }
    iceCandidateQueues.current.delete(socketId);
    removeRemoteStream(socketId);
    removeParticipant(socketId);
  }, [removeRemoteStream, removeParticipant]);

  // Toggle local Audio mute
  const toggleAudio = useCallback(() => {
    const nextState = !isMutedAudioRef.current;
    setAudioMute(nextState);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextState;
      });
    }
    // Broadcast status to other peers
    signalingClient.toggleMediaStatus('audio', nextState);
  }, [setAudioMute]);

  // Toggle local Video mute
  const toggleVideo = useCallback(async () => {
    const nextState = !isMutedVideoRef.current;
    setVideoMute(nextState);

    if (nextState) {
      // Mute (Turn OFF camera): Stop all video tracks and create a new stream without video
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.stop();
        });
        const audioTracks = localStreamRef.current.getAudioTracks();
        const newStream = new MediaStream([...audioTracks]);
        localStreamRef.current = newStream;
        setLocalStream(newStream);
      }
      
      // Replace track with null in all peer connections
      peerConnections.current.forEach(async (pc) => {
        const videoSender = pc.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender;
        if (videoSender) {
          await videoSender.replaceTrack(null);
        }
      });

      // Broadcast status to other peers
      signalingClient.toggleMediaStatus('video', true);
    } else {
      // Unmute (Turn ON camera): Stop old tracks and request a new one
      let audioTracks: MediaStreamTrack[] = [];
      if (localStreamRef.current) {
        localStreamRef.current.getVideoTracks().forEach(track => {
          track.stop();
        });
        audioTracks = localStreamRef.current.getAudioTracks();
      }

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 360 },
        frameRate: { ideal: 24 }
      };
      if (selectedVideoInput) {
        videoConstraints.deviceId = { exact: selectedVideoInput };
      }

      try {
        const freshStream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints
        });
        const freshVideoTrack = freshStream.getVideoTracks()[0];
        
        if (freshVideoTrack) {
          const newStream = new MediaStream([...audioTracks, freshVideoTrack]);
          localStreamRef.current = newStream;
          setLocalStream(newStream);
          
          // Replace track in all peer connections if not screen sharing
          if (!isScreenSharingRef.current) {
            peerConnections.current.forEach(async (pc) => {
              const videoSender = pc.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender;
              if (videoSender) {
                await videoSender.replaceTrack(freshVideoTrack);
              }
            });
          }
        }
      } catch (err) {
        console.error('Failed to restart camera track during unmute:', err);
      }

      // Broadcast status to other peers
      signalingClient.toggleMediaStatus('video', false);
    }
  }, [selectedVideoInput, setVideoMute, setLocalStream]);

  // Toggle Screen Share
  const toggleScreenShare = useCallback(async () => {
    const isSharing = isScreenSharingRef.current;
    if (isSharing) {
      // Stop Screen Sharing and restore camera track
      if (screenShareStreamRef.current) {
        screenShareStreamRef.current.getTracks().forEach(track => track.stop());
        screenShareStreamRef.current = null;
        setScreenShareStream(null);
      }
      
      setScreenSharing(false);
      
      // Restore camera track to all peers
      if (localStreamRef.current) {
        const cameraVideoTrack = localStreamRef.current.getVideoTracks()[0];
        peerConnections.current.forEach(async (pc) => {
          const videoSender = pc.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender;
          if (videoSender && cameraVideoTrack) {
            await videoSender.replaceTrack(cameraVideoTrack);
          }
        });
      }
    } else {
      try {
        // Request Screen Capture stream
        let screenStream: MediaStream;
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { max: 30 } },
            audio: true
          });
        } catch (e) {
          console.warn('Failed to start screen share with audio, falling back to video-only screen share...', e);
          screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { max: 30 } }
          });
        }
        
        screenShareStreamRef.current = screenStream;
        setScreenShareStream(screenStream);
        setScreenSharing(true);

        const screenVideoTrack = screenStream.getVideoTracks()[0];

        // Replace video track on all peer connections
        peerConnections.current.forEach(async (pc) => {
          const videoSender = pc.getTransceivers().find(t => t.receiver.track.kind === 'video')?.sender;
          if (videoSender) {
            await videoSender.replaceTrack(screenVideoTrack);
          }
        });

        // Add handler for when user clicks native browser "Stop sharing" button
        screenVideoTrack.onended = () => {
          toggleScreenShare(); // recursive trigger to restore camera
        };

      } catch (error) {
        console.error('Error starting screen share:', error);
      }
    }
  }, [setScreenShareStream, setScreenSharing]);

  // Setup local media stream
  const initializeLocalStream = useCallback(async () => {
    stopLocalTracks();
    setLocalStreamReady(false);

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

    try {
      let stream: MediaStream;
      try {
        // Try getting both video and audio
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        });
      } catch (err) {
        console.warn('useWebRTC: Failed to get both audio and video, trying audio-only...', err);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints
          });
        } catch (err2) {
          console.warn('useWebRTC: Failed audio-only, trying video-only...', err2);
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints
          });
        }
      }

      localStreamRef.current = stream;
      setLocalStream(stream);

      // Apply initial mute states
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (videoTrack) {
        videoTrack.enabled = !isMutedVideoRef.current;
      }
      if (audioTrack) {
        audioTrack.enabled = !isMutedAudioRef.current;
      }

      // Voice Activity Detector setup (to highlight active speaker)
      if (audioTrack) {
        voiceCleanup.current = createVoiceActivityDetector(stream, (isSpeaking) => {
          if (isSpeaking && !isMutedAudioRef.current) {
            setActiveSpeaker('local');
            // Broadcast local voice activity to peers
            signalingClient.raiseHand(false); // Can trigger mini metadata pulses or rely on presence sync
          } else {
            setActiveSpeaker(null);
          }
        }).cleanup;
      }

      // Replace tracks in all active peer connections
      peerConnections.current.forEach((pc) => {
        const transceivers = pc.getTransceivers();
        const audioSender = transceivers.find(t => t.receiver.track.kind === 'audio')?.sender;
        const videoSender = transceivers.find(t => t.receiver.track.kind === 'video')?.sender;
        
        if (audioSender && audioTrack) {
          audioSender.replaceTrack(audioTrack).catch(err => console.error('Error replacing audio track:', err));
        }
        
        // Only replace video track if we are not screen sharing
        if (!isScreenSharingRef.current && videoSender && videoTrack) {
          videoSender.replaceTrack(videoTrack).catch(err => console.error('Error replacing video track:', err));
        }
      });

    } catch (error) {
      console.error('Failed to get any local stream:', error);
    } finally {
      setLocalStreamReady(true);
    }
  }, [selectedAudioInput, selectedVideoInput, setLocalStream, stopLocalTracks, setActiveSpeaker]);

  // Watch for device change and reinitialize local stream
  useEffect(() => {
    if (waitingStatus === 'approved' || (waitingStatus === 'none' && myRole === 'host')) {
      initializeLocalStream();
    }
  }, [selectedAudioInput, selectedVideoInput, initializeLocalStream, waitingStatus, myRole]);

  // Callback refs to avoid recreation of main useEffect loop
  const initializeLocalStreamRef = useRef(initializeLocalStream);
  const stopLocalTracksRef = useRef(stopLocalTracks);
  const toggleAudioRef = useRef(toggleAudio);
  const toggleVideoRef = useRef(toggleVideo);

  useEffect(() => { initializeLocalStreamRef.current = initializeLocalStream; }, [initializeLocalStream]);
  useEffect(() => { stopLocalTracksRef.current = stopLocalTracks; }, [stopLocalTracks]);
  useEffect(() => { toggleAudioRef.current = toggleAudio; }, [toggleAudio]);
  useEffect(() => { toggleVideoRef.current = toggleVideo; }, [toggleVideo]);

  // Core signaling and connection loop
  useEffect(() => {
    if (!roomId) return;
    if (waitingStatus === 'denied') return;
    if (!localStreamReady) return;

    let active = true;

    // Define named handlers to allow proper cleanup in off()
    const handleRoomParticipants = async ({ participants }: any) => {
      console.log('Received list of active room participants:', participants);
      const iceConfig = await fetchIceServers();
      if (!active) return;
      
      for (const p of participants) {
        departedSignalingPeers.current.delete(p.socketId);
        
        addParticipant({
          socketId: p.socketId,
          userId: p.userId,
          username: p.username,
          role: p.role,
          isMutedAudio: p.isMutedAudio,
          isMutedVideo: p.isMutedVideo,
          isHandRaised: p.isHandRaised
        });

        // Skip connection recreation if connection to peer already exists and is active/pending
        if (peerConnections.current.has(p.socketId)) {
          const existingPc = peerConnections.current.get(p.socketId);
          if (existingPc && ['new', 'connecting', 'connected'].includes(existingPc.connectionState)) {
            console.log(`Connection to peer ${p.socketId} already exists in active/pending state: ${existingPc.connectionState}. Skipping connection creation.`);
            continue;
          } else {
            console.log(`Connection to peer ${p.socketId} exists but state is ${existingPc?.connectionState}. Re-creating connection.`);
            closePeerConnection(p.socketId);
          }
        }

        // Deterministic role: Only the peer with the lexicographically smaller socket ID initiates the offer
        const mySocketId = signalingClient.getSocketId();
        const isOfferer = mySocketId < p.socketId;

        if (isOfferer) {
          console.log(`We are the offerer for peer ${p.socketId} (${mySocketId} < ${p.socketId}). Initiating connection.`);
          const pc = await createPeerConnection(p.socketId, iceConfig);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            signalingClient.sendSignal(p.socketId, offer);
          } catch (err) {
            console.error('Error creating WebRTC offer:', err);
          }
        } else {
          console.log(`We are the answerer for peer ${p.socketId} (${mySocketId} > ${p.socketId}). Waiting for offer.`);
          // Just prepare the peer connection so it's ready, but don't send offer
          await createPeerConnection(p.socketId, iceConfig);
        }
      }
    };

    const handlePeerJoined = (p: any) => {
      console.log(`Peer joined notification: ${p.username} (${p.socketId})`);
      departedSignalingPeers.current.delete(p.socketId);
      
      addParticipant({
        socketId: p.socketId,
        userId: p.userId,
        username: p.username,
        role: p.role as any,
        isMutedAudio: p.isMutedAudio,
        isMutedVideo: p.isMutedVideo,
        isHandRaised: p.isHandRaised
      });
    };

    const handleSignal = async ({ senderId, signal }: any) => {
      const iceConfig = await fetchIceServers();
      if (!active) return;
      
      let pc = peerConnections.current.get(senderId);
      
      // If we receive a new offer but already have a connection, close the old one only if it is not pending (stale or connected)
      if (signal.type === 'offer' && pc && !['new', 'connecting'].includes(pc.connectionState)) {
        console.log(`Received WebRTC offer from ${senderId} but connection already exists in state ${pc.connectionState}. Closing old connection.`);
        closePeerConnection(senderId);
        pc = undefined;
      }
      
      // If peer connection doesn't exist, create it (answering peer)
      if (!pc) {
        pc = await createPeerConnection(senderId, iceConfig);
      }

      if (signal.type === 'offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          console.log(`Successfully set remote offer description for peer ${senderId}`);
          
          // Drain queued ICE candidates
          const queue = iceCandidateQueues.current.get(senderId) || [];
          console.log(`Draining ${queue.length} queued ICE candidates for peer ${senderId}`);
          for (const candidate of queue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
              console.warn(`Failed to add queued ICE candidate for peer ${senderId}:`, e);
            });
          }
          iceCandidateQueues.current.delete(senderId);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          signalingClient.sendSignal(senderId, answer);
        } catch (err) {
          console.error('Error handling WebRTC offer:', err);
        }
      } else if (signal.type === 'answer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          console.log(`Successfully set remote answer description for peer ${senderId}`);

          // Drain queued ICE candidates
          const queue = iceCandidateQueues.current.get(senderId) || [];
          console.log(`Draining ${queue.length} queued ICE candidates for peer ${senderId}`);
          for (const candidate of queue) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(e => {
              console.warn(`Failed to add queued ICE candidate for peer ${senderId}:`, e);
            });
          }
          iceCandidateQueues.current.delete(senderId);
        } catch (err) {
          console.error('Error setting remote answer:', err);
        }
      } else if (signal.candidate) {
        try {
          // If remote description is already set, add candidate directly
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            // Queue the candidate until remote description is applied
            const queue = iceCandidateQueues.current.get(senderId) || [];
            queue.push(signal.candidate);
            iceCandidateQueues.current.set(senderId, queue);
            console.log(`Queued ICE candidate for peer ${senderId} (remoteDescription is not yet set)`);
          }
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    };

    const handlePeerLeft = ({ socketId }: any) => {
      console.log(`Peer left signaling channel: ${socketId}`);
      departedSignalingPeers.current.add(socketId);
      
      const pc = peerConnections.current.get(socketId);
      // Only close WebRTC if connection is not active
      if (!pc || pc.connectionState !== 'connected') {
        closePeerConnection(socketId);
      } else {
        console.log(`WebRTC connection to ${socketId} is still connected. Keeping streaming active.`);
      }
    };

    const handleChatReceived = (msg: any) => {
      addChatMessage(msg);
    };

    const handleHandRaised = ({ socketId, isRaised }: any) => {
      updateParticipantHand(socketId, isRaised);
    };

    const handlePeerMutedStatus = ({ socketId, type, isMuted }: any) => {
      updateParticipantMute(socketId, type, isMuted);
    };

    const handleMuteCommand = ({ type }: any) => {
      if (type === 'audio' && !isMutedAudioRef.current) {
        toggleAudioRef.current();
      } else if (type === 'video' && !isMutedVideoRef.current) {
        toggleVideoRef.current();
      }
    };

    const handleKickedCommand = () => {
      console.warn('You have been kicked by the host.');
      sessionStorage.removeItem(`lobby_passed_${roomId}`);
      sessionStorage.removeItem(`passcode_passed_${roomId}`);
      sessionStorage.removeItem(`waiting_status_approved_${roomId}`);
      window.location.href = `/kicked?room=${roomId}`;
    };

    const handleWaitingStatus = ({ status }: any) => {
      console.log('Waiting room status update:', status);
      setWaitingStatus(status);
      if (status === 'approved') {
        if (roomId) {
          sessionStorage.setItem(`waiting_status_approved_${roomId}`, 'true');
        }
        // Re-trigger connecting to peers after approval
        initializeLocalStreamRef.current();
      }
    };

    const handleWaitingRoomListUpdate = ({ participants }: any) => {
      setWaitingRoomList(participants);
    };

    const setupSignaling = async () => {
      // Setup signaling event handlers
      signalingClient.on('room-participants', handleRoomParticipants);
      signalingClient.on('peer-joined', handlePeerJoined);
      signalingClient.on('signal', handleSignal);
      signalingClient.on('peer-left', handlePeerLeft);
      signalingClient.on('chat-received', handleChatReceived);
      signalingClient.on('hand-raised', handleHandRaised);
      signalingClient.on('peer-muted-status', handlePeerMutedStatus);
      signalingClient.on('mute-command', handleMuteCommand);
      signalingClient.on('kicked-command', handleKickedCommand);
      signalingClient.on('waiting-status', handleWaitingStatus);
      signalingClient.on('waiting-room-list-update', handleWaitingRoomListUpdate);

      // Finally, connect to signaling client
      const isWaiting = myRole === 'participant' && waitingStatus === 'waiting';
      signalingClient.connect(roomId, {
        userId,
        username,
        role: myRole,
        isWaiting
      });

      // Broadcast initial media status as soon as we connect
      signalingClient.toggleMediaStatus('audio', isMutedAudioRef.current);
      signalingClient.toggleMediaStatus('video', isMutedVideoRef.current);
    };

    getDevices();
    setupSignaling();

    return () => {
      active = false;
      signalingClient.disconnect();
      
      // Remove all event listeners using the correct stored references
      signalingClient.off('room-participants', handleRoomParticipants);
      signalingClient.off('peer-joined', handlePeerJoined);
      signalingClient.off('signal', handleSignal);
      signalingClient.off('peer-left', handlePeerLeft);
      signalingClient.off('chat-received', handleChatReceived);
      signalingClient.off('hand-raised', handleHandRaised);
      signalingClient.off('peer-muted-status', handlePeerMutedStatus);
      signalingClient.off('mute-command', handleMuteCommand);
      signalingClient.off('kicked-command', handleKickedCommand);
      signalingClient.off('waiting-status', handleWaitingStatus);
      signalingClient.off('waiting-room-list-update', handleWaitingRoomListUpdate);

      // Close all peer connections
      peerConnections.current.forEach((pc) => {
        pc.close();
      });
      peerConnections.current.clear();
      
      stopLocalTracksRef.current();
    };
  }, [
    roomId,
    userId,
    username,
    myRole,
    waitingStatus,
    localStreamReady,
    getDevices,
    createPeerConnection,
    closePeerConnection,
    addParticipant,
    addChatMessage,
    updateParticipantHand,
    updateParticipantMute,
    setWaitingStatus,
    setWaitingRoomList
  ]);

  return {
    localStream,
    screenShareStream,
    isMutedAudio,
    isMutedVideo,
    isScreenSharing,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    getDevices
  };
};
