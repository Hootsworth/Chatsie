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

  // Push-to-Talk settings
  isPushToTalkEnabled: boolean;
  setPushToTalkEnabled: (enabled: boolean) => void;

  // Noise Suppression settings
  isNoiseSuppressionEnabled: boolean;
  setNoiseSuppressionEnabled: (enabled: boolean) => void;

  // Virtual Background settings
  virtualBackgroundMode: 'none' | 'blur' | 'office' | 'gradient';
  setVirtualBackgroundMode: (mode: 'none' | 'blur' | 'office' | 'gradient') => void;

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

const getInitialMuteStates = () => {
  try {
    const pathParts = window.location.pathname.split('/');
    const roomIndex = pathParts.indexOf('room');
    if (roomIndex !== -1 && pathParts[roomIndex + 1]) {
      const code = pathParts[roomIndex + 1].trim().toLowerCase();
      const cachedAudioMute = sessionStorage.getItem(`meeting_audio_muted_${code}`) === 'true';
      const cachedVideoMute = sessionStorage.getItem(`meeting_video_muted_${code}`) === 'true';
      return { cachedAudioMute, cachedVideoMute };
    }
  } catch (e) {
    // Ignore errors for SSR/environments where window is undefined
  }
  return { cachedAudioMute: false, cachedVideoMute: false };
};

const { cachedAudioMute, cachedVideoMute } = getInitialMuteStates();

export const useWebRTCStore = create<WebRTCState>((set) => ({
  isMutedAudio: cachedAudioMute,
  isMutedVideo: cachedVideoMute,
  showCaptions: false,
  isPushToTalkEnabled: localStorage.getItem('push_to_talk_enabled') === 'true',
  isNoiseSuppressionEnabled: localStorage.getItem('noise_suppression_enabled') === 'true',
  virtualBackgroundMode: (localStorage.getItem('virtual_background_mode') as any) || 'none',
  
  audioDevices: [],
  videoDevices: [],
  speakerDevices: [],
  
  selectedAudioInput: '',
  selectedVideoInput: '',
  selectedAudioOutput: '',

  setPushToTalkEnabled: (enabled) => {
    localStorage.setItem('push_to_talk_enabled', String(enabled));
    set({ isPushToTalkEnabled: enabled });
  },

  setNoiseSuppressionEnabled: (enabled) => {
    localStorage.setItem('noise_suppression_enabled', String(enabled));
    set({ isNoiseSuppressionEnabled: enabled });
  },

  setVirtualBackgroundMode: (mode) => {
    localStorage.setItem('virtual_background_mode', mode);
    set({ virtualBackgroundMode: mode });
  },

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
    selectedAudioOutput: '',
    isNoiseSuppressionEnabled: false,
    virtualBackgroundMode: 'none'
  })
}));
export default useWebRTCStore;
