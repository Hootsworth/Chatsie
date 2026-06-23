import { useEffect, useRef } from 'react';
import { signalingClient } from '../services/signaling';

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export const useSpeechRecognition = (isMutedAudio: boolean, showCaptions: boolean) => {
  const recognitionRef = useRef<any>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const text = finalTranscript || interimTranscript;
      if (text.trim()) {
        signalingClient.sendCaption(text);
      }
    };

    recognition.onend = () => {
      // Automatically restart if it is supposed to be active
      if (activeRef.current) {
        try {
          recognition.start();
        } catch (e) {
          console.error('Failed to restart speech recognition:', e);
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        activeRef.current = false;
      }
    };

    recognitionRef.current = recognition;

    return () => {
      activeRef.current = false;
      try {
        recognition.abort();
      } catch (e) {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    const shouldBeActive = showCaptions && !isMutedAudio;
    activeRef.current = shouldBeActive;

    if (!recognitionRef.current) return;

    if (shouldBeActive) {
      try {
        recognitionRef.current.start();
        console.log('Speech recognition started');
      } catch (e) {
        // Recognition might already be running
      }
    } else {
      try {
        recognitionRef.current.stop();
        console.log('Speech recognition stopped');
      } catch (e) {
        // Recognition might already be stopped
      }
    }
  }, [isMutedAudio, showCaptions]);
};
