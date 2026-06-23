import { create } from 'zustand';

export interface Meeting {
  id: string;
  code: string;
  title: string;
  host_id: string;
  passcode: string | null;
  is_waiting_room_enabled: boolean;
  is_locked: boolean;
  is_active: boolean;
  scheduled_start: string | null;
  duration: number | null;
  created_at: string;
}

export interface Participant {
  socketId: string;
  userId: string;
  username: string;
  role: 'host' | 'participant';
  isMutedAudio: boolean;
  isMutedVideo: boolean;
  isHandRaised: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}

export interface Transcript {
  id: string;
  senderId: string;
  username: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

interface MeetingState {
  // Current Active Meeting details
  currentMeeting: Meeting | null;
  // Local participant details
  myRole: 'host' | 'participant';
  // List of other active participants
  participants: Participant[];
  // List of participants waiting to enter
  waitingRoomList: Array<{ socketId: string; userId: string; username: string }>;
  // Entry status: none, waiting, approved, denied
  waitingStatus: 'none' | 'waiting' | 'approved' | 'denied';
  // Passcode gate state
  isPasscodeGateRequired: boolean;
  isPasscodeGatePassed: boolean;
  // Persistent chat history
  chatMessages: ChatMessage[];
  // Transcription history
  transcripts: Transcript[];
  
  // UI states
  isChatPanelOpen: boolean;
  isParticipantsPanelOpen: boolean;
  isTranscriptionPanelOpen: boolean;
  isSettingsOpen: boolean;
  isShortcutsOpen: boolean;
  
  // Actions
  setCurrentMeeting: (meeting: Meeting | null) => void;
  setMyRole: (role: 'host' | 'participant') => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipantMute: (userId: string, type: 'audio' | 'video', isMuted: boolean) => void;
  updateParticipantHand: (userId: string, isRaised: boolean) => void;
  setWaitingRoomList: (list: Array<{ socketId: string; userId: string; username: string }>) => void;
  setWaitingStatus: (status: 'none' | 'waiting' | 'approved' | 'denied') => void;
  setPasscodeGateRequired: (required: boolean) => void;
  setPasscodeGatePassed: (passed: boolean) => void;
  addChatMessage: (message: ChatMessage) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  addOrUpdateTranscript: (senderId: string, username: string, text: string, isFinal: boolean) => void;
  
  // UI Actions
  toggleChatPanel: () => void;
  toggleParticipantsPanel: () => void;
  toggleTranscriptionPanel: () => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setShortcutsOpen: (isOpen: boolean) => void;
  resetMeetingState: () => void;
}

export const useMeetingStore = create<MeetingState>((set) => ({
  currentMeeting: null,
  myRole: 'participant',
  participants: [],
  waitingRoomList: [],
  waitingStatus: 'none',
  isPasscodeGateRequired: false,
  isPasscodeGatePassed: false,
  chatMessages: [],
  transcripts: [],
  
  isChatPanelOpen: false,
  isParticipantsPanelOpen: false,
  isTranscriptionPanelOpen: false,
  isSettingsOpen: false,
  isShortcutsOpen: false,

  setCurrentMeeting: (meeting) => set({ currentMeeting: meeting }),
  setMyRole: (role) => set({ myRole: role }),
  setParticipants: (participants) => set({ participants }),
  
  addParticipant: (participant) => set((state) => {
    // Avoid duplicates by tracking userId
    if (state.participants.some(p => p.userId === participant.userId)) {
      return {
        participants: state.participants.map(p => 
          p.userId === participant.userId ? { ...p, ...participant } : p
        )
      };
    }
    return { participants: [...state.participants, participant] };
  }),
  
  removeParticipant: (userId) => set((state) => ({
    participants: state.participants.filter(p => p.userId !== userId)
  })),

  updateParticipantMute: (userId, type, isMuted) => set((state) => ({
    participants: state.participants.map(p => {
      if (p.userId === userId) {
        return type === 'audio' 
          ? { ...p, isMutedAudio: isMuted } 
          : { ...p, isMutedVideo: isMuted };
      }
      return p;
    })
  })),

  updateParticipantHand: (userId, isRaised) => set((state) => ({
    participants: state.participants.map(p => 
      p.userId === userId ? { ...p, isHandRaised: isRaised } : p
    )
  })),

  setWaitingRoomList: (list) => set({ waitingRoomList: list }),
  setWaitingStatus: (status) => set({ waitingStatus: status }),
  setPasscodeGateRequired: (required) => set({ isPasscodeGateRequired: required }),
  setPasscodeGatePassed: (passed) => set({ isPasscodeGatePassed: passed }),
  
  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages, message]
  })),
  
  setChatMessages: (messages) => set({ chatMessages: messages }),

  addOrUpdateTranscript: (senderId, username, text, isFinal) => set((state) => {
    const list = [...state.transcripts];
    const lastIdx = list.length - 1;
    
    if (lastIdx >= 0 && list[lastIdx].senderId === senderId && !list[lastIdx].isFinal) {
      list[lastIdx] = {
        ...list[lastIdx],
        text: text,
        isFinal: isFinal,
        timestamp: Date.now()
      };
      return { transcripts: list };
    } else {
      const newEntry = {
        id: `${senderId}-${Date.now()}`,
        senderId,
        username,
        text,
        timestamp: Date.now(),
        isFinal
      };
      return { transcripts: [...state.transcripts, newEntry] };
    }
  }),
  
  toggleChatPanel: () => set((state) => ({ 
    isChatPanelOpen: !state.isChatPanelOpen,
    isParticipantsPanelOpen: false,
    isTranscriptionPanelOpen: false
  })),

  toggleParticipantsPanel: () => set((state) => ({ 
    isParticipantsPanelOpen: !state.isParticipantsPanelOpen,
    isChatPanelOpen: false,
    isTranscriptionPanelOpen: false
  })),

  toggleTranscriptionPanel: () => set((state) => ({
    isTranscriptionPanelOpen: !state.isTranscriptionPanelOpen,
    isChatPanelOpen: false,
    isParticipantsPanelOpen: false
  })),

  setSettingsOpen: (isOpen) => set({ isSettingsOpen: isOpen }),
  setShortcutsOpen: (isOpen) => set({ isShortcutsOpen: isOpen }),

  resetMeetingState: () => set({
    currentMeeting: null,
    myRole: 'participant',
    participants: [],
    waitingRoomList: [],
    waitingStatus: 'none',
    isPasscodeGateRequired: false,
    isPasscodeGatePassed: false,
    chatMessages: [],
    transcripts: [],
    isChatPanelOpen: false,
    isParticipantsPanelOpen: false,
    isTranscriptionPanelOpen: false,
    isSettingsOpen: false,
    isShortcutsOpen: false
  })
}));
