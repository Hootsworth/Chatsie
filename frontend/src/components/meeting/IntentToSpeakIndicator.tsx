import React from 'react';
import { Mic, Sparkles } from 'lucide-react';
import { signalingClient } from '../../services/signaling';

interface IntentToSpeakIndicatorProps {
  stream?: MediaStream | null;
  enabled: boolean;
}

export const IntentToSpeakIndicator: React.FC<IntentToSpeakIndicatorProps> = ({ stream, enabled }) => {
  const [isIntentActive, setIsIntentActive] = React.useState(false);
  const cooldownRef = React.useRef(0);

  React.useEffect(() => {
    if (!enabled || !stream || stream.getAudioTracks().length === 0) {
      setIsIntentActive(false);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let quietFrames = 0;

    analyser.fftSize = 256;
    source.connect(analyser);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      const now = Date.now();

      if (average < 5) quietFrames += 1;
      if (average > 18 && quietFrames > 18 && now - cooldownRef.current > 4500) {
        cooldownRef.current = now;
        quietFrames = 0;
        setIsIntentActive(true);
        signalingClient.sendReaction('intent');
        setTimeout(() => setIsIntentActive(false), 2200);
      }

      frame = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream, enabled]);

  if (!isIntentActive) return null;

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
      <div className="bg-emerald-500 text-white border border-white/20 shadow-xl rounded-full px-4 py-2 flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
        </span>
        <Mic className="w-4 h-4" />
        <span className="text-xs font-black uppercase tracking-wider">Intent to speak</span>
        <Sparkles className="w-3.5 h-3.5" />
      </div>
    </div>
  );
};

export default IntentToSpeakIndicator;
