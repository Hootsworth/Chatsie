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

export interface PollOption {
  id: string;
  text: string;
  votes: string[]; // User IDs who voted
}

export interface Poll {
  id: string;
  creatorId: string;
  creatorName: string;
  question: string;
  options: PollOption[];
  isActive: boolean;
  createdAt: number;
}

export interface Question {
  id: string;
  userId: string;
  username: string;
  text: string;
  upvotes: string[]; // User IDs who upvoted
  isAnswered: boolean;
  createdAt: number;
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
  
  // Interactive Polls & Q&A
  polls: Poll[];
  questions: Question[];
  
  // Local participant hand raised state
  isLocalHandRaised: boolean;
  
  // UI states
  isChatPanelOpen: boolean;
  isParticipantsPanelOpen: boolean;
  isTranscriptionPanelOpen: boolean;
  isWhiteboardOpen: boolean;
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
  setLocalHandRaised: (isRaised: boolean) => void;
  setWaitingRoomList: (list: Array<{ socketId: string; userId: string; username: string }>) => void;
  setWaitingStatus: (status: 'none' | 'waiting' | 'approved' | 'denied') => void;
  setPasscodeGateRequired: (required: boolean) => void;
  setPasscodeGatePassed: (passed: boolean) => void;
  addChatMessage: (message: ChatMessage) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  addOrUpdateTranscript: (senderId: string, username: string, text: string, isFinal: boolean) => void;
  
  // Polls & Q&A Actions
  setPolls: (polls: Poll[]) => void;
  addPoll: (poll: Poll) => void;
  updatePollVotes: (pollId: string, optionId: string, voterId: string) => void;
  closePoll: (pollId: string) => void;
  deletePoll: (pollId: string) => void;
  setQuestions: (questions: Question[]) => void;
  addQuestion: (question: Question) => void;
  updateQuestionUpvotes: (questionId: string, voterId: string, isUpvote: boolean) => void;
  setQuestionAnswered: (questionId: string, isAnswered: boolean) => void;
  deleteQuestion: (questionId: string) => void;

  // UI Actions
  toggleChatPanel: () => void;
  toggleParticipantsPanel: () => void;
  toggleTranscriptionPanel: () => void;
  toggleWhiteboard: () => void;
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
  polls: [],
  questions: [],
  isLocalHandRaised: false,
  
  isChatPanelOpen: false,
  isParticipantsPanelOpen: false,
  isTranscriptionPanelOpen: false,
  isWhiteboardOpen: false,
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

  setLocalHandRaised: (isRaised) => set({ isLocalHandRaised: isRaised }),
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

  // Polls & Q&A Actions
  setPolls: (polls) => set({ polls }),
  addPoll: (poll) => set((state) => ({ polls: [...state.polls, poll] })),
  updatePollVotes: (pollId, optionId, voterId) => set((state) => ({
    polls: state.polls.map(p => p.id === pollId ? {
      ...p,
      options: p.options.map(opt => {
        const cleanVotes = opt.votes.filter(v => v !== voterId);
        if (opt.id === optionId) {
          return { ...opt, votes: [...cleanVotes, voterId] };
        }
        return { ...opt, votes: cleanVotes };
      })
    } : p)
  })),
  closePoll: (pollId) => set((state) => ({
    polls: state.polls.map(p => p.id === pollId ? { ...p, isActive: false } : p)
  })),
  deletePoll: (pollId) => set((state) => ({
    polls: state.polls.filter(p => p.id !== pollId)
  })),
  setQuestions: (questions) => set({ questions }),
  addQuestion: (question) => set((state) => ({
    questions: [...state.questions, question]
  })),
  updateQuestionUpvotes: (questionId, voterId, isUpvote) => set((state) => ({
    questions: state.questions.map(q => q.id === questionId ? {
      ...q,
      upvotes: isUpvote 
        ? [...q.upvotes.filter(v => v !== voterId), voterId]
        : q.upvotes.filter(v => v !== voterId)
    } : q)
  })),
  setQuestionAnswered: (questionId, isAnswered) => set((state) => ({
    questions: state.questions.map(q => q.id === questionId ? { ...q, isAnswered } : q)
  })),
  deleteQuestion: (questionId) => set((state) => ({
    questions: state.questions.filter(q => q.id !== questionId)
  })),
  
  toggleChatPanel: () => set((state) => ({ 
    isChatPanelOpen: !state.isChatPanelOpen,
    isParticipantsPanelOpen: false,
    isTranscriptionPanelOpen: false,
    isWhiteboardOpen: false
  })),

  toggleParticipantsPanel: () => set((state) => ({ 
    isParticipantsPanelOpen: !state.isParticipantsPanelOpen,
    isChatPanelOpen: false,
    isTranscriptionPanelOpen: false,
    isWhiteboardOpen: false
  })),

  toggleTranscriptionPanel: () => set((state) => ({
    isTranscriptionPanelOpen: !state.isTranscriptionPanelOpen,
    isChatPanelOpen: false,
    isParticipantsPanelOpen: false,
    isWhiteboardOpen: false
  })),

  toggleWhiteboard: () => set((state) => ({
    isWhiteboardOpen: !state.isWhiteboardOpen,
    isChatPanelOpen: false,
    isParticipantsPanelOpen: false,
    isTranscriptionPanelOpen: false
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
    polls: [],
    questions: [],
    isLocalHandRaised: false,
    isChatPanelOpen: false,
    isParticipantsPanelOpen: false,
    isTranscriptionPanelOpen: false,
    isWhiteboardOpen: false,
    isSettingsOpen: false,
    isShortcutsOpen: false
  })
}));
