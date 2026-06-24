import React, { useState, useEffect } from 'react';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { Camera, Mic, Volume2, Key, Keyboard, Sparkles } from 'lucide-react';

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
    setSelectedAudioOutput,
    isPushToTalkEnabled,
    setPushToTalkEnabled,
    isNoiseSuppressionEnabled,
    setNoiseSuppressionEnabled,
    virtualBackgroundMode,
    setVirtualBackgroundMode
  } = useWebRTCStore();

  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    setGeminiApiKey(localStorage.getItem('gemini_api_key') || '');
  }, []);

  const handleApiKeyChange = (val: string) => {
    setGeminiApiKey(val);
    localStorage.setItem('gemini_api_key', val.trim());
  };

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

      {/* Virtual Background Selection */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center">
          <Sparkles className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Virtual Background Effect
        </label>
        <select
          value={virtualBackgroundMode}
          onChange={(e) => setVirtualBackgroundMode(e.target.value as any)}
          className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
        >
          <option value="none">None (Standard Camera)</option>
          <option value="blur">Portrait Blur (Low latency)</option>
          <option value="office">Virtual Office Background</option>
          <option value="gradient">Warm Aura Gradient</option>
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

      {/* Smart Noise Suppression Option */}
      <div className="space-y-1.5 pt-2">
        <div className="flex items-center space-x-2.5">
          <input
            type="checkbox"
            id="noise-suppression"
            checked={isNoiseSuppressionEnabled}
            onChange={(e) => setNoiseSuppressionEnabled(e.target.checked)}
            className="rounded border-hairline text-primary focus:ring-primary w-4 h-4"
          />
          <label htmlFor="noise-suppression" className="text-xs text-ink font-semibold select-none cursor-pointer">
            Enable Smart Noise Suppression
          </label>
        </div>
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

      {/* Push-to-Talk Option */}
      <div className="space-y-1.5 pt-4 border-t border-hairline-soft">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center">
          <Keyboard className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Push-to-Talk Keyboard Shortcut
        </label>
        <div className="flex items-center space-x-2.5 mt-1">
          <input
            type="checkbox"
            id="push-to-talk"
            checked={isPushToTalkEnabled}
            onChange={(e) => setPushToTalkEnabled(e.target.checked)}
            className="rounded border-hairline text-primary focus:ring-primary w-4 h-4"
          />
          <label htmlFor="push-to-talk" className="text-xs text-ink font-semibold select-none cursor-pointer">
            Hold Spacebar to unmute mic (Push-to-Talk)
          </label>
        </div>
      </div>

      {/* Gemini API Key */}
      <div className="space-y-1.5 pt-4 border-t border-hairline-soft">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center">
          <Key className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Gemini API Key (Client-Side AI)
        </label>
        <input
          type="password"
          value={geminiApiKey}
          onChange={(e) => handleApiKeyChange(e.target.value)}
          placeholder="Paste your Gemini API Key..."
          className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink placeholder-muted-soft focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
        />
        <p className="text-[10px] text-muted-soft leading-relaxed">
          Required to use the "Summarize with AI" transcription feature. Saved locally in your browser's private memory.
        </p>
      </div>
    </div>
  );
};
export default DeviceSelector;
