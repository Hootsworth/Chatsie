/**
 * WebRTC helper utilities for managing SDP, bitrate caps, and connection monitoring.
 */

/**
 * Limit the encoding bitrate and apply resolution constraints on a given RTCRtpSender.
 * This is crucial in a P2P mesh network to prevent high upstream bandwidth bottlenecks when
 * there are many concurrent participants (e.g. 10 peers).
 * 
 * @param sender The RTCRtpSender to configure
 * @param maxBitrateBps The maximum bitrate in bits per second (default 250000 = 250 kbps)
 * @param scaleDownBy Scale down the resolution by this factor (default 1.5, e.g. 720p becomes 480p)
 */
export async function limitSenderBitrate(
  sender: RTCRtpSender,
  maxBitrateBps: number = 250000,
  scaleDownBy: number = 1.5
): Promise<void> {
  if (sender.track?.kind !== 'video') return;

  try {
    const parameters = sender.getParameters();
    
    if (!parameters.encodings) {
      parameters.encodings = [{}];
    }

    if (parameters.encodings.length > 0) {
      parameters.encodings[0].maxBitrate = maxBitrateBps;
      parameters.encodings[0].scaleResolutionDownBy = scaleDownBy;
      
      // Keep connection stable under network jitter
      parameters.encodings[0].networkPriority = 'low'; 
      
      await sender.setParameters(parameters);
      console.log(`Successfully set sender bitrate limit to ${maxBitrateBps / 1000}kbps and scale factor ${scaleDownBy}`);
    }
  } catch (error) {
    console.warn('Failed to apply RTCRtpSender parameters:', error);
  }
}

/**
 * Setup a volume node analyzer to track if the participant is currently speaking.
 * 
 * @param stream The audio stream to analyze
 * @param onSpeechDetected Callback with speaking state
 * @returns An object containing the audio context and cleanup function
 */
export function createVoiceActivityDetector(
  stream: MediaStream,
  onSpeechDetected: (isSpeaking: boolean) => void
): { cleanup: () => void } {
  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    return { cleanup: () => {} };
  }

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
    const analyser = audioContext.createAnalyser();
    
    analyser.fftSize = 512;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    let speechTimer: ReturnType<typeof setTimeout> | null = null;
    let isSpeaking = false;
    let isDestroyed = false;

    const checkVolume = () => {
      if (isDestroyed) return;
      
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      let values = 0;
      for (let i = 0; i < bufferLength; i++) {
        values += dataArray[i];
      }
      const averageVolume = values / bufferLength;

      // Threshold for speaking (0-255 scale)
      const threshold = 18; 

      if (averageVolume > threshold) {
        if (!isSpeaking) {
          isSpeaking = true;
          onSpeechDetected(true);
        }
        
        // Reset speech timer
        if (speechTimer) clearTimeout(speechTimer);
        speechTimer = setTimeout(() => {
          if (isSpeaking) {
            isSpeaking = false;
            onSpeechDetected(false);
          }
        }, 1500); // Wait 1.5s of silence before declaring speaking has stopped
      }

      requestAnimationFrame(checkVolume);
    };

    checkVolume();

    return {
      cleanup: () => {
        isDestroyed = true;
        if (speechTimer) clearTimeout(speechTimer);
        source.disconnect();
        analyser.disconnect();
        if (audioContext.state !== 'closed') {
          audioContext.close();
        }
      }
    };
  } catch (error) {
    console.error('Failed to create voice activity detector:', error);
    return { cleanup: () => {} };
  }
}
