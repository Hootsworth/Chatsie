import React from 'react';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { Camera, Mic, Volume2 } from 'lucide-react';

export const DeviceSelector: React.FC = () => {
  const {
    audioDevices,
    videoDevices,
    speakerDevices,
    selectedAudioInput,
    selectedVideoInput,
    selectedAudioOutput,
    setSelectedAudioInput,
    setSelectedVideoInput,
    setSelectedAudioOutput
  } = useWebRTCStore();

  return (
    <div className="space-y-4 py-2">
      {/* Video Device Select */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center">
          <Camera className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Camera Input
        </label>
        <select
          value={selectedVideoInput}
          onChange={(e) => setSelectedVideoInput(e.target.value)}
          className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
        >
          {videoDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
          {videoDevices.length === 0 && <option value="">No cameras detected</option>}
        </select>
      </div>

      {/* Audio Input (Mic) Select */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center">
          <Mic className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Microphone Input
        </label>
        <select
          value={selectedAudioInput}
          onChange={(e) => setSelectedAudioInput(e.target.value)}
          className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
        >
          {audioDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
          {audioDevices.length === 0 && <option value="">No microphones detected</option>}
        </select>
      </div>

      {/* Audio Output (Speaker) Select */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center">
          <Volume2 className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Audio Output Speaker
        </label>
        <select
          value={selectedAudioOutput}
          onChange={(e) => setSelectedAudioOutput(e.target.value)}
          className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
        >
          {speakerDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
          {speakerDevices.length === 0 && <option value="">Default System Speaker</option>}
        </select>
      </div>
    </div>
  );
};
export default DeviceSelector;
