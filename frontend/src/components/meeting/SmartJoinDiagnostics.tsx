import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Mic, Video, Wifi } from 'lucide-react';

interface SmartJoinDiagnosticsProps {
  stream: MediaStream | null;
  audioDeviceCount: number;
  videoDeviceCount: number;
  isMutedAudio: boolean;
  isMutedVideo: boolean;
}

type DiagnosticStatus = 'good' | 'warn';

interface DiagnosticItem {
  label: string;
  value: string;
  status: DiagnosticStatus;
  icon: React.ReactNode;
}

export const SmartJoinDiagnostics: React.FC<SmartJoinDiagnosticsProps> = ({
  stream,
  audioDeviceCount,
  videoDeviceCount,
  isMutedAudio,
  isMutedVideo
}) => {
  const [audioLevel, setAudioLevel] = React.useState(0);

  React.useEffect(() => {
    if (!stream || isMutedAudio || stream.getAudioTracks().length === 0) {
      setAudioLevel(0);
      return;
    }

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;

    analyser.fftSize = 256;
    source.connect(analyser);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      const average = data.reduce((sum, value) => sum + value, 0) / data.length;
      setAudioLevel(Math.min(100, Math.round(average * 2)));
      frame = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      audioContext.close().catch(() => {});
    };
  }, [stream, isMutedAudio]);

  const connection = (navigator as any).connection;
  const downlink = typeof connection?.downlink === 'number' ? connection.downlink : null;
  const networkLabel = downlink ? `${downlink.toFixed(1)} Mbps` : 'Browser estimate unavailable';

  const items: DiagnosticItem[] = [
    {
      label: 'Microphone',
      value: isMutedAudio ? 'Muted for join' : audioLevel > 5 ? 'Input detected' : audioDeviceCount > 0 ? 'Ready, quiet room' : 'No input found',
      status: audioDeviceCount > 0 ? 'good' : 'warn',
      icon: <Mic className="w-3.5 h-3.5" />
    },
    {
      label: 'Camera',
      value: isMutedVideo ? 'Joining camera off' : videoDeviceCount > 0 ? 'Preview active' : 'No camera found',
      status: videoDeviceCount > 0 || isMutedVideo ? 'good' : 'warn',
      icon: <Video className="w-3.5 h-3.5" />
    },
    {
      label: 'Network',
      value: networkLabel,
      status: downlink === null || downlink >= 1.5 ? 'good' : 'warn',
      icon: <Wifi className="w-3.5 h-3.5" />
    }
  ];

  return (
    <div className="bg-canvas border border-hairline rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow">Smart Join Check</span>
        <Activity className="w-4 h-4 text-primary" />
      </div>

      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center ${item.status === 'good' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                {item.icon}
              </span>
              <div className="min-w-0">
                <div className="font-bold text-ink">{item.label}</div>
                <div className="text-[10px] text-muted truncate">{item.value}</div>
              </div>
            </div>
            {item.status === 'good' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {!isMutedAudio && audioDeviceCount > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted font-bold uppercase">
            <span>Mic level</span>
            <span>{audioLevel}%</span>
          </div>
          <div className="h-1.5 bg-surface-soft rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-100" style={{ width: `${audioLevel}%` }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartJoinDiagnostics;
