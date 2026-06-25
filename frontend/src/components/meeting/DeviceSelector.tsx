import React, { useState, useEffect, useRef } from 'react';
import { useWebRTCStore } from '../../stores/webrtcStore';
import { Camera, Mic, Volume2, Key, Sparkles, Smile } from 'lucide-react';
import { useGestureDetector } from '../../hooks/useGestureDetector';

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
    setVirtualBackgroundMode,
    isE2eeEnabled,
    setE2eeEnabled,
    isLowBandwidthMode,
    setLowBandwidthMode,
    isGestureReactionsEnabled,
    setGestureReactionsEnabled
  } = useWebRTCStore();

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  useGestureDetector(isGestureReactionsEnabled, previewCanvasRef);

  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    setGeminiApiKey(localStorage.getItem('gemini_api_key') || '');
  }, []);

  const [activeSettingsTab, setActiveSettingsTab] = useState<'devices' | 'advanced' | 'ai'>('devices');

  const handleApiKeyChange = (val: string) => {
    setGeminiApiKey(val);
    localStorage.setItem('gemini_api_key', val.trim());
  };

  return (
    <div className="space-y-6 py-2 min-h-[350px] flex flex-col">
      {/* Tabs Header */}
      <div className="flex border-b border-hairline pb-2 mb-4 gap-2">
        <button
          type="button"
          onClick={() => setActiveSettingsTab('devices')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
            activeSettingsTab === 'devices'
              ? 'bg-ink text-canvas font-black'
              : 'text-ink/65 hover:bg-ink/5'
          }`}
        >
          Devices
        </button>
        <button
          type="button"
          onClick={() => setActiveSettingsTab('advanced')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
            activeSettingsTab === 'advanced'
              ? 'bg-ink text-canvas font-black'
              : 'text-ink/65 hover:bg-ink/5'
          }`}
        >
          System & Security
        </button>
        <button
          type="button"
          onClick={() => setActiveSettingsTab('ai')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
            activeSettingsTab === 'ai'
              ? 'bg-ink text-canvas font-black'
              : 'text-ink/65 hover:bg-ink/5'
          }`}
        >
          AI & Gestures
        </button>
      </div>

      {/* Tab Contents */}
      <div className="flex-1 space-y-5">
        {activeSettingsTab === 'devices' && (
          <div className="space-y-5">
            {/* Video Device Select */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-ink/50 uppercase tracking-widest flex items-center">
                <Camera className="w-3.5 h-3.5 mr-1.5 text-ink/70" />
                Camera Input
              </label>
              <select
                value={selectedVideoInput}
                onChange={(e) => setSelectedVideoInput(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink transition-all duration-200"
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
              <label className="text-[10px] font-black text-ink/50 uppercase tracking-widest flex items-center">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-ink/70" />
                Virtual Background Effect
              </label>
              <select
                value={virtualBackgroundMode}
                onChange={(e) => setVirtualBackgroundMode(e.target.value as any)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink transition-all duration-200"
              >
                <option value="none">None (Standard Camera)</option>
                <option value="blur">Portrait Blur (Low latency)</option>
                <option value="office">Virtual Office Background</option>
                <option value="gradient">Warm Aura Gradient</option>
              </select>
            </div>

            {/* Audio Input (Mic) Select */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-ink/50 uppercase tracking-widest flex items-center">
                <Mic className="w-3.5 h-3.5 mr-1.5 text-ink/70" />
                Microphone Input
              </label>
              <select
                value={selectedAudioInput}
                onChange={(e) => setSelectedAudioInput(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink transition-all duration-200"
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
              <label className="text-[10px] font-black text-ink/50 uppercase tracking-widest flex items-center">
                <Volume2 className="w-3.5 h-3.5 mr-1.5 text-ink/70" />
                Audio Output Speaker
              </label>
              <select
                value={selectedAudioOutput}
                onChange={(e) => setSelectedAudioOutput(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink transition-all duration-200"
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
        )}

        {activeSettingsTab === 'advanced' && (
          <div className="space-y-6">
            {/* Smart Noise Suppression Option */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-hairline bg-ink/[0.02]">
              <input
                type="checkbox"
                id="noise-suppression"
                checked={isNoiseSuppressionEnabled}
                onChange={(e) => setNoiseSuppressionEnabled(e.target.checked)}
                className="rounded border-hairline text-ink focus:ring-ink w-4 h-4 mt-0.5 accent-ink cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="noise-suppression" className="text-xs text-ink font-bold select-none cursor-pointer">
                  Enable Smart Noise Suppression
                </label>
                <p className="text-[10px] text-ink/60 leading-normal mt-0.5">
                  Filters background chatter, hums, and other room noises using client-side DSP algorithms.
                </p>
              </div>
            </div>

            {/* Push-to-Talk Option */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-hairline bg-ink/[0.02]">
              <input
                type="checkbox"
                id="push-to-talk"
                checked={isPushToTalkEnabled}
                onChange={(e) => setPushToTalkEnabled(e.target.checked)}
                className="rounded border-hairline text-ink focus:ring-ink w-4 h-4 mt-0.5 accent-ink cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="push-to-talk" className="text-xs text-ink font-bold select-none cursor-pointer">
                  Push-to-Talk Mode
                </label>
                <p className="text-[10px] text-ink/60 leading-normal mt-0.5">
                  Hold Spacebar to quickly unmute your microphone temporarily during active meeting screens.
                </p>
              </div>
            </div>

            {/* Low Bandwidth Mode */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-hairline bg-ink/[0.02]">
              <input
                type="checkbox"
                id="low-bandwidth-mode"
                checked={isLowBandwidthMode}
                onChange={(e) => setLowBandwidthMode(e.target.checked)}
                className="rounded border-hairline text-ink focus:ring-ink w-4 h-4 mt-0.5 accent-ink cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="low-bandwidth-mode" className="text-xs text-ink font-bold select-none cursor-pointer">
                  Low Bandwidth Mode (Audio-Only)
                </label>
                <p className="text-[10px] text-ink/60 leading-normal mt-0.5">
                  Stops receiving all remote video and screen share streams to save maximum internet data.
                </p>
              </div>
            </div>

            {/* E2EE Mode */}
            <div className="flex items-start space-x-3 p-3 rounded-lg border border-hairline bg-ink/[0.02]">
              <input
                type="checkbox"
                id="e2ee-mode"
                checked={isE2eeEnabled}
                onChange={(e) => setE2eeEnabled(e.target.checked)}
                className="rounded border-hairline text-ink focus:ring-ink w-4 h-4 mt-0.5 accent-ink cursor-pointer"
              />
              <div className="flex-1">
                <label htmlFor="e2ee-mode" className="text-xs text-ink font-bold select-none cursor-pointer">
                  End-to-End Encryption (E2EE)
                </label>
                <p className="text-[10px] text-ink/60 leading-normal mt-0.5">
                  Encrypts all media tracks locally. Requires all participants to have E2EE enabled.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSettingsTab === 'ai' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-ink/50 uppercase tracking-widest flex items-center">
                <Key className="w-3.5 h-3.5 mr-1.5 text-ink/70" />
                Gemini API Key
              </label>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder="Paste your Gemini API Key..."
                className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink placeholder-ink/40 focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink transition-all duration-200"
              />
              <p className="text-[10px] text-ink/60 leading-relaxed pt-1">
                Required to use the "Summarize with AI" transcription feature. Saved locally in your browser's private memory.
              </p>
            </div>

            <div className="border-t border-hairline pt-4 mt-4 space-y-4">
              <div className="flex items-start space-x-3 p-3 rounded-lg border border-hairline bg-ink/[0.02]">
                <input
                  type="checkbox"
                  id="gesture-reactions"
                  checked={isGestureReactionsEnabled}
                  onChange={(e) => setGestureReactionsEnabled(e.target.checked)}
                  className="rounded border-hairline text-ink focus:ring-ink w-4 h-4 mt-0.5 accent-ink cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="gesture-reactions" className="text-xs text-ink font-bold select-none cursor-pointer flex items-center">
                    <Smile className="w-3.5 h-3.5 mr-1.5 text-ink/70" />
                    Enable On-Device Gesture Controls (Beta)
                  </label>
                  <p className="text-[10px] text-ink/60 leading-normal mt-0.5">
                    Detect physical gestures (subtle head nod, thumbs up) locally on your device to trigger meeting reactions.
                  </p>
                </div>
              </div>

              {isGestureReactionsEnabled && (
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black text-ink/50 uppercase tracking-widest block text-center">
                    Gesture CV Monitor
                  </span>
                  <div className="relative aspect-[4/3] max-w-[280px] bg-black rounded-lg overflow-hidden border border-hairline shadow-inner mx-auto">
                    <canvas 
                      ref={previewCanvasRef} 
                      className="w-full h-full object-cover scale-x-[-1]" 
                    />
                    <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-0.5 rounded text-[8px] font-mono text-emerald-400 border border-emerald-400/20">
                      ON-DEVICE CV RUNNING
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default DeviceSelector;
