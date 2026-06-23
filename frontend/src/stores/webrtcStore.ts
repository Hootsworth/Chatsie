import { create } from 'zustand';

export interface DeviceInfo {
  deviceId: string;
  label: string;
}

interface WebRTCState {
  // Streams
  localStream: MediaStream | null;
  screenShareStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>; // socketId -> MediaStream
  
  // Media States
  isMutedAudio: boolean;
  isMutedVideo: boolean;
  isScreenSharing: boolean;
  showCaptions: boolean;
  
  // Device Lists
  audioDevices: DeviceInfo[];
  videoDevices: DeviceInfo[];
  speakerDevices: DeviceInfo[];
  
  // Selected Devices
  selectedAudioInput: string;
  selectedVideoInput: string;
  selectedAudioOutput: string;
  
  // Active Speaker
  activeSpeaker: string | null; // socketId or 'local'
  
  // Peer Network Connection Quality
  // socketId -> 'good' | 'fair' | 'poor' | 'disconnected'
  connectionQuality: Record<string, 'good' | 'fair' | 'poor' | 'disconnected'>;

  // Actions
  setLocalStream: (stream: MediaStream | null) => void;
  setScreenShareStream: (stream: MediaStream | null) => void;
  addRemoteStream: (socketId: string, stream: MediaStream) => void;
  removeRemoteStream: (socketId: string) => void;
  
  setAudioMute: (isMuted: boolean) => void;
  setVideoMute: (isMuted: boolean) => void;
  setScreenSharing: (isSharing: boolean) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  
  setDevices: (audio: DeviceInfo[], video: DeviceInfo[], speaker: DeviceInfo[]) => void;
  setSelectedAudioInput: (deviceId: string) => void;
  setSelectedVideoInput: (deviceId: string) => void;
  setSelectedAudioOutput: (deviceId: string) => void;
  
  setActiveSpeaker: (speaker: string | null) => void;
  setConnectionQuality: (socketId: string, quality: 'good' | 'fair' | 'poor' | 'disconnected') => void;
  resetWebRTCState: () => void;
}

export const useWebRTCStore = create<WebRTCState>((set) => ({
  localStream: null,
  screenShareStream: null,
  remoteStreams: new Map(),
  
  isMutedAudio: false,
  isMutedVideo: false,
  isScreenSharing: false,
  showCaptions: false,
  
  audioDevices: [],
  videoDevices: [],
  speakerDevices: [],
  
  selectedAudioInput: '',
  selectedVideoInput: '',
  selectedAudioOutput: '',
  
  activeSpeaker: null,
  connectionQuality: {},

  setLocalStream: (stream) => set({ localStream: stream }),
  setScreenShareStream: (stream) => set({ screenShareStream: stream }),
  
  addRemoteStream: (socketId, stream) => set((state) => {
    const updated = new Map(state.remoteStreams);
    updated.set(socketId, stream);
    return { remoteStreams: updated };
  }),
  
  removeRemoteStream: (socketId) => set((state) => {
    const updated = new Map(state.remoteStreams);
    updated.delete(socketId);
    
    const quality = { ...state.connectionQuality };
    delete quality[socketId];
    
    return { 
      remoteStreams: updated,
      connectionQuality: quality
    };
  }),

  setAudioMute: (isMuted) => set({ isMutedAudio: isMuted }),
  setVideoMute: (isMuted) => set({ isMutedVideo: isMuted }),
  setScreenSharing: (isSharing) => set({ isScreenSharing: isSharing }),
  setCaptionsEnabled: (enabled) => set({ showCaptions: enabled }),
  
  setDevices: (audio, video, speaker) => set({
    audioDevices: audio,
    videoDevices: video,
    speakerDevices: speaker
  }),
  
  setSelectedAudioInput: (deviceId) => set({ selectedAudioInput: deviceId }),
  setSelectedVideoInput: (deviceId) => set({ selectedVideoInput: deviceId }),
  setSelectedAudioOutput: (deviceId) => set({ selectedAudioOutput: deviceId }),
  
  setActiveSpeaker: (speaker) => set({ activeSpeaker: speaker }),
  
  setConnectionQuality: (socketId, quality) => set((state) => ({
    connectionQuality: {
      ...state.connectionQuality,
      [socketId]: quality
    }
  })),

  resetWebRTCState: () => set((state) => {
    // Stop all local tracks before clearing
    if (state.localStream) {
      state.localStream.getTracks().forEach(track => track.stop());
    }
    if (state.screenShareStream) {
      state.screenShareStream.getTracks().forEach(track => track.stop());
    }
    // Stop all remote tracks
    state.remoteStreams.forEach((stream) => {
      stream.getTracks().forEach(track => track.stop());
    });
    return {
      localStream: null,
      screenShareStream: null,
      remoteStreams: new Map(),
      isMutedAudio: false,
      isMutedVideo: false,
      isScreenSharing: false,
      showCaptions: false,
      activeSpeaker: null,
      connectionQuality: {}
    };
  })
}));
export default useWebRTCStore;
