import { useState, useRef, useEffect } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';

export const useCallRecorder = () => {
  const room = useRoomContext();
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioSourcesRef = useRef<MediaStreamAudioSourceNode[]>([]);
  const recordedChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      recordedChunks.current = [];

      // 1. Prompt user to capture screen/tab (video stream)
      // This will let them record the meeting viewport tab itself
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
        },
        audio: true, // Capture system audio too if selected
      });
      displayStreamRef.current = displayStream;

      // 2. Mix WebRTC audio streams using Web Audio API
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      const audioDestination = audioContext.createMediaStreamDestination();
      audioDestinationRef.current = audioDestination;
      audioSourcesRef.current = [];

      // Add local participant's microphone if active
      const localMicPublication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
      if (localMicPublication && localMicPublication.track && localMicPublication.track.mediaStreamTrack) {
        const localStream = new MediaStream([localMicPublication.track.mediaStreamTrack]);
        const sourceNode = audioContext.createMediaStreamSource(localStream);
        sourceNode.connect(audioDestination);
        audioSourcesRef.current.push(sourceNode);
      }

      // Add remote participants' microphones
      Array.from(room.remoteParticipants.values()).forEach((participant: any) => {
        participant.trackPublications.forEach((pub: any) => {
          if (pub.track && pub.kind === 'audio' && pub.track.mediaStreamTrack) {
            const remoteStream = new MediaStream([pub.track.mediaStreamTrack]);
            const sourceNode = audioContext.createMediaStreamSource(remoteStream);
            sourceNode.connect(audioDestination);
            audioSourcesRef.current.push(sourceNode);
          }
        });
      });

      // Combine display audio if present in screenshare (e.g. system sounds)
      const displayAudioTrack = displayStream.getAudioTracks()[0];
      if (displayAudioTrack) {
        const displayAudioStream = new MediaStream([displayAudioTrack]);
        const displayAudioSource = audioContext.createMediaStreamSource(displayAudioStream);
        displayAudioSource.connect(audioDestination);
        audioSourcesRef.current.push(displayAudioSource);
      }

      // 3. Assemble mixed recording stream
      const videoTrack = displayStream.getVideoTracks()[0];
      const mixedTracks = [videoTrack];
      
      const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];
      if (mixedAudioTrack) {
        mixedTracks.push(mixedAudioTrack);
      }

      const mixedStream = new MediaStream(mixedTracks);

      // 4. Initialize MediaRecorder
      const options = { mimeType: 'video/webm;codecs=vp9,opus' };
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(mixedStream, options);
      } catch (e) {
        recorder = new MediaRecorder(mixedStream); // Fallback to default browser mimeType
      }

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        // Trigger download of the recorded call
        const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `chatsie-call-recording-${Date.now()}.webm`;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup URLs
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 100);

        // Stop all tracks
        displayStream.getTracks().forEach((track) => track.stop());
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
        setIsRecording(false);
      };

      // Handle user stopping screenshare via browser UI banner
      videoTrack.onended = () => {
        if (recorder && recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      // Start recording chunks every 1 second
      recorder.start(1000);
      setIsRecording(true);

    } catch (err) {
      console.error('Failed to start call recording:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (displayStreamRef.current) {
        displayStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  return {
    isRecording,
    startRecording,
    stopRecording,
  };
};
export default useCallRecorder;
