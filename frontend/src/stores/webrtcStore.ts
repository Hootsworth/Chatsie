import { create } from 'zustand';

export interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface WebRTCState {
  // Pre-join Media States
  isMutedAudio: boolean;
  isMutedVideo: boolean;
  showCaptions: boolean;
  
  // Device Lists
  audioDevices: DeviceInfo[];
  videoDevices: DeviceInfo[];
  speakerDevices: DeviceInfo[];
  
  // Selected Devices
  selectedAudioInput: string;
  selectedVideoInput: string;
  selectedAudioOutput: string;

  // Actions
  setAudioMute: (isMuted: boolean) => void;
  setVideoMute: (isMuted: boolean) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  
  setDevices: (audio: DeviceInfo[], video: DeviceInfo[], speaker: DeviceInfo[]) => void;
  setSelectedAudioInput: (deviceId: string) => void;
  setSelectedVideoInput: (deviceId: string) => void;
  setSelectedAudioOutput: (deviceId: string) => void;
  
  resetWebRTCState: () => void;
}

export const useWebRTCStore = create<WebRTCState>((set) => ({
  isMutedAudio: false,
  isMutedVideo: false,
  showCaptions: false,
  
  audioDevices: [],
  videoDevices: [],
  speakerDevices: [],
  
  selectedAudioInput: '',
  selectedVideoInput: '',
  selectedAudioOutput: '',

  setAudioMute: (isMuted) => set({ isMutedAudio: isMuted }),
  setVideoMute: (isMuted) => set({ isMutedVideo: isMuted }),
  setCaptionsEnabled: (enabled) => set({ showCaptions: enabled }),
  
  setDevices: (audio, video, speaker) => set({
    audioDevices: audio,
    videoDevices: video,
    speakerDevices: speaker
  }),
  
  setSelectedAudioInput: (deviceId) => set({ selectedAudioInput: deviceId }),
  setSelectedVideoInput: (deviceId) => set({ selectedVideoInput: deviceId }),
  setSelectedAudioOutput: (deviceId) => set({ selectedAudioOutput: deviceId }),

  resetWebRTCState: () => set({
    isMutedAudio: false,
    isMutedVideo: false,
    showCaptions: false,
    selectedAudioInput: '',
    selectedVideoInput: '',
    selectedAudioOutput: ''
  })
}));
export default useWebRTCStore;
