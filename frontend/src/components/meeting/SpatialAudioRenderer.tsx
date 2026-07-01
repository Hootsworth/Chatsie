import React, { useEffect, useRef } from 'react';
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useMeetingStore } from '../../stores/meetingStore';

export const SpatialAudioRenderer: React.FC = () => {
  const audioTrackRefs = useTracks([Track.Source.Microphone]);
  const { isSpatialAudioEnabled } = useMeetingStore();
  
  const audioContextRef = useRef<AudioContext | null>(null);
  // Map key is trackSid
  const activeNodesRef = useRef<Map<string, {
    source: MediaStreamAudioSourceNode;
    panner: StereoPannerNode;
    audio: HTMLAudioElement;
  }>>(new Map());

  // Filter for remote participants with active microphone tracks
  const remoteTrackRefs = React.useMemo(() => {
    return audioTrackRefs.filter(
      (ref) => !ref.participant.isLocal && ref.publication?.track?.mediaStreamTrack
    );
  }, [audioTrackRefs]);

  // Handle AudioContext creation and resumption
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch((err) => {
        console.error('Failed to resume AudioContext:', err);
      });
    }
    return audioContextRef.current;
  };

  useEffect(() => {
    // Resume context on any click to bypass autoplay blocks
    const handleInteraction = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
    };
    window.addEventListener('click', handleInteraction);
    return () => window.removeEventListener('click', handleInteraction);
  }, []);

  useEffect(() => {
    if (remoteTrackRefs.length === 0) {
      // Clean up all nodes if no remote tracks exist
      activeNodesRef.current.forEach((node) => {
        try {
          node.audio.pause();
          node.audio.srcObject = null;
          node.source.disconnect();
          node.panner.disconnect();
        } catch (e) {}
      });
      activeNodesRef.current.clear();
      return;
    }

    const audioContext = initAudioContext();
    const currentTrackSids = new Set(remoteTrackRefs.map((ref) => ref.publication.trackSid));

    // 1. Clean up removed tracks
    activeNodesRef.current.forEach((node, sid) => {
      if (!currentTrackSids.has(sid)) {
        try {
          node.audio.pause();
          node.audio.srcObject = null;
          node.source.disconnect();
          node.panner.disconnect();
        } catch (e) {}
          activeNodesRef.current.delete(sid);
      }
    });

    // 2. Sort remote tracks alphabetically to maintain a stable horizontal position
    const sortedTracks = [...remoteTrackRefs].sort((a, b) => {
      const idA = a.participant.identity || '';
      const idB = b.participant.identity || '';
      return idA.localeCompare(idB);
    });

    // 3. Update or create nodes
    sortedTracks.forEach((ref, index) => {
      const sid = ref.publication.trackSid;
      const mediaTrack = ref.publication.track?.mediaStreamTrack;
      if (!mediaTrack) return;

      // Calculate panning layout: X coordinate between -0.85 (far left) and 0.85 (far right)
      let panValue = 0;
      if (isSpatialAudioEnabled && sortedTracks.length > 1) {
        const ratio = index / (sortedTracks.length - 1);
        panValue = -0.85 + ratio * 1.7; // maps 0..1 to -0.85..0.85
      }

      let node = activeNodesRef.current.get(sid);

      if (!node) {
        // Create HTML5 audio element to keep the WebRTC pipeline active
        const audio = document.createElement('audio');
        const mediaStream = new MediaStream([mediaTrack]);
        audio.srcObject = mediaStream;
        audio.muted = true; // Mute element to play exclusively via Web Audio node
        audio.play().catch(() => {});

        // Build Web Audio pipeline
        const source = audioContext.createMediaStreamSource(mediaStream);
        const panner = audioContext.createStereoPanner();
        
        source.connect(panner);
        panner.connect(audioContext.destination);

        node = { source, panner, audio };
        activeNodesRef.current.set(sid, node);
      }

      // Dynamically update panning coordinates
      if (node.panner.pan) {
        node.panner.pan.setValueAtTime(panValue, audioContext.currentTime);
      }
    });
  }, [remoteTrackRefs, isSpatialAudioEnabled]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      activeNodesRef.current.forEach((node) => {
        try {
          node.audio.pause();
          node.audio.srcObject = null;
          node.source.disconnect();
          node.panner.disconnect();
        } catch (e) {}
      });
      activeNodesRef.current.clear();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
    };
  }, []);

  return null; // Side-effect renderer
};

export default SpatialAudioRenderer;
