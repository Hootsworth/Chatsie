import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.png';
import { useUser, UserButton, useAuth } from '@clerk/clerk-react';
import { Button, Input, Modal, Badge } from '../ui';
import { generateGoogleCalendarUrl, downloadIcsFile } from '../../utils/calendar';

interface ScheduledMeeting {
  id: string;
  code: string;
  title: string;
  passcode: string | null;
  is_waiting_room_enabled: boolean;
  scheduled_start: string | null;
  duration: number | null;
}

export const Dashboard: React.FC = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  // Loading and list states
  const [upcomingMeetings, setUpcomingMeetings] = useState<ScheduledMeeting[]>([]);
  const [pastMeetings, setPastMeetings] = useState<ScheduledMeeting[]>([]);
  const [isLoadingMeetings, setIsLoadingMeetings] = useState(true);

  // Form states
  const [joinCode, setJoinCode] = useState('');
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Create meeting form state
  const [meetingTitle, setMeetingTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [meetingDuration, setMeetingDuration] = useState('30');
  const [meetingPasscode, setMeetingPasscode] = useState('');
  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState(false);
  const [guestEmails, setGuestEmails] = useState('');
  const [blockEarlyJoin, setBlockEarlyJoin] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<'meetings' | 'chats'>('meetings');
  const [chatThreads, setChatThreads] = useState<any[]>([]);
  const [activeThreadCode, setActiveThreadCode] = useState<string | null>(null);
  const [activeThreadMessages, setActiveThreadMessages] = useState<any[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [newChatRecipient, setNewChatRecipient] = useState('');
  const [newChatMessage, setNewChatMessage] = useState('');
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [activeChatInput, setActiveChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [createMeetingError, setCreateMeetingError] = useState<string | null>(null);
  const [instantMeetingError, setInstantMeetingError] = useState<string | null>(null);
  const [scheduledMeetingResult, setScheduledMeetingResult] = useState<ScheduledMeeting | null>(null);
  const [isResultCopied, setIsResultCopied] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [isJobsModalOpen, setIsJobsModalOpen] = useState(false);

  // Helper to fetch authorization header
  const getAuthHeader = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  function generateRoomCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    return `${part1}-${part2}-${part3}`;
  }

  const fetchMeetings = async () => {
    setIsLoadingMeetings(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl || apiUrl === 'undefined' || apiUrl === 'null') {
        setIsLoadingMeetings(false);
        return;
      }
      const headers = await getAuthHeader();
      const resUpcoming = await fetch(`${apiUrl}/api/meetings`, { headers });
      if (resUpcoming.ok) {
        const data = await resUpcoming.json();
        setUpcomingMeetings(data.meetings || []);
      }
      const resPast = await fetch(`${apiUrl}/api/meetings?history=true`, { headers });
      if (resPast.ok) {
        const data = await resPast.json();
        setPastMeetings(data.meetings || []);
      }
    } catch (err) {
      console.error('Error fetching meetings:', err);
    } finally {
      setIsLoadingMeetings(false);
    }
  };

  useEffect(() => {
    fetchMeetings();
  }, [user]);

  const handleStartInstantMeeting = async () => {
    setInstantMeetingError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl || apiUrl === 'undefined' || apiUrl === 'null') {
        navigate(`/room/${generateRoomCode()}`);
        return;
      }
      const headers = await getAuthHeader();
      const response = await fetch(`${apiUrl}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          title: `${user?.firstName || 'User'}'s Instant Meeting`,
          isWaitingRoomEnabled: false
        })
      });
      if (!response.ok) throw new Error('Failed to create instant meeting');
      const data = await response.json();
      navigate(`/room/${data.meeting.code}`);
    } catch (err: any) {
      setInstantMeetingError(err.message || 'Failed to start instant meeting.');
    }
  };

  const handleScheduleMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMeetingError(null);
    setIsCreatingMeeting(true);
    if (!meetingTitle) {
      setCreateMeetingError('Meeting title is required.');
      setIsCreatingMeeting(false);
      return;
    }
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      let scheduledStartISO = null;
      if (scheduledDate && scheduledTime) {
        scheduledStartISO = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }
      if (!apiUrl) throw new Error("API URL not configured.");
      const headers = await getAuthHeader();
      const invitedEmailsList = guestEmails
        .split(',')
        .map(email => email.trim())
        .filter(email => email.length > 0 && email.includes('@'));

      const response = await fetch(`${apiUrl}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          title: meetingTitle,
          passcode: meetingPasscode || null,
          isWaitingRoomEnabled,
          scheduledStart: scheduledStartISO,
          duration: meetingDuration ? parseInt(meetingDuration, 10) : null,
          blockEarlyJoin,
          inviteOnly,
          invitedEmails: invitedEmailsList
        })
      });
      if (!response.ok) throw new Error('Failed to schedule meeting');
      const data = await response.json();
      setScheduledMeetingResult(data.meeting);
      fetchMeetings();
    } catch (err: any) {
      setCreateMeetingError(err.message || 'An error occurred.');
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  const handleCloseScheduleSuccess = () => {
    setMeetingTitle('');
    setScheduledDate('');
    setScheduledTime('');
    setMeetingPasscode('');
    setGuestEmails('');
    setBlockEarlyJoin(false);
    setInviteOnly(false);
    setScheduledMeetingResult(null);
    setIsScheduleModalOpen(false);
  };

  const handleCloseScheduleModal = () => {
    setMeetingTitle('');
    setScheduledDate('');
    setScheduledTime('');
    setMeetingPasscode('');
    setGuestEmails('');
    setBlockEarlyJoin(false);
    setInviteOnly(false);
    setScheduledMeetingResult(null);
    setIsScheduleModalOpen(false);
  };

  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode) return;
    let code = joinCode.trim().toLowerCase();
    if (code.includes('/room/')) code = code.split('/room/')[1].split('?')[0];
    navigate(`/room/${code}`);
  };

  const handleCopyPersonalLink = () => {
    if (!user) return;
    navigator.clipboard.writeText(`${window.location.origin}${import.meta.env.BASE_URL}room/personal-${user.id}`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const fetchChatThreads = async () => {
    setIsLoadingChats(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) return;
      const headers = await getAuthHeader();
      const res = await fetch(`${apiUrl}/api/chats`, { headers });
      if (res.ok) {
        const data = await res.json();
        setChatThreads(data.threads || []);
      }
    } catch (err) {
      console.error('Error fetching chat threads:', err);
    } finally {
      setIsLoadingChats(false);
    }
  };

  const fetchThreadMessages = async (threadCode: string) => {
    setIsLoadingMessages(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) return;
      const headers = await getAuthHeader();
      const res = await fetch(`${apiUrl}/api/chats/${threadCode}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setActiveThreadMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Error fetching thread messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatInput.trim() || !activeThreadCode || isSendingMessage) return;
    setIsSendingMessage(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) return;
      const headers = await getAuthHeader();
      
      const thread = chatThreads.find(t => t.code === activeThreadCode);
      if (!thread) return;

      const response = await fetch(`${apiUrl}/api/chats/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          recipientEmail: thread.otherParticipantEmail,
          message: activeChatInput
        })
      });

      if (response.ok) {
        const data = await response.json();
        setActiveThreadMessages(prev => [...prev, {
          id: data.message.id,
          senderId: user?.id,
          senderName: user?.fullName || 'Me',
          message: activeChatInput,
          created_at: new Date().toISOString()
        }]);
        setActiveChatInput('');
      }
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleStartNewChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatRecipient.trim() || !newChatMessage.trim() || isSendingMessage) return;
    setIsSendingMessage(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) return;
      const headers = await getAuthHeader();
      
      const response = await fetch(`${apiUrl}/api/chats/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          recipientEmail: newChatRecipient,
          message: newChatMessage
        })
      });

      if (response.ok) {
        const data = await response.json();
        setNewChatRecipient('');
        setNewChatMessage('');
        setIsNewChatModalOpen(false);
        await fetchChatThreads();
        setActiveThreadCode(data.threadCode);
        await fetchThreadMessages(data.threadCode);
      }
    } catch (err) {
      console.error('Error starting new chat:', err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'chats') {
      fetchChatThreads();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'chats' || !activeThreadCode) return;
    
    const interval = setInterval(() => {
      fetchThreadMessages(activeThreadCode);
    }, 3000);

    return () => clearInterval(interval);
  }, [activeTab, activeThreadCode]);

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col relative overflow-hidden">
      {/* Decorative Wavy/Curly Background Lines (Continuous) */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <svg className="absolute inset-0 w-full h-full opacity-[0.11]" viewBox="0 0 1440 900" preserveAspectRatio="none">
          {/* Curve 1: Orange Wave */}
          <path d="M -100 150 C 400 30, 800 380, 1540 200" stroke="#fa7b17" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          
          {/* Curve 2: Pink Loop */}
          <path d="M 300 -100 C 600 500, 900 150, 1200 1000" stroke="#ff3d8b" strokeWidth="2.0" strokeLinecap="round" fill="none" />

          {/* Curve 3: Cyan Sweep */}
          <path d="M -100 700 C 450 480, 950 880, 1540 600" stroke="#00e5ff" strokeWidth="2.8" strokeLinecap="round" fill="none" />

          {/* Curve 4: Yellow Curve */}
          <path d="M 1000 -100 C 1120 450, 1320 280, 1540 1000" stroke="#ffc700" strokeWidth="2.0" strokeLinecap="round" fill="none" />
        </svg>
      </div>

      {/* NAVBAR */}
      <header className="h-[56px] px-6 flex items-center justify-between border-b border-hairline sticky top-0 bg-canvas z-40">
        <div className="flex items-center space-x-3">
          <img src={logo} alt="Chatsie Logo" className="w-8 h-8 rounded-sm object-contain" />
          <span className="text-body-sm font-bold tracking-tight">Chatsie</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-body-sm font-bold hidden sm:block">{user?.fullName}</span>
          <UserButton afterSignOutUrl="/signin" />
        </div>
      </header>

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 py-24 space-y-[96px] relative z-10">
        <div className="flex justify-center mb-8">
          <div className="bg-canvas border border-hairline p-1 rounded-full flex space-x-1 shadow-sm backdrop-blur-md">
            <button
              onClick={() => setActiveTab('meetings')}
              className={`px-6 py-2 rounded-full text-body-sm font-bold transition-all duration-200 ${
                activeTab === 'meetings'
                  ? 'bg-ink text-canvas shadow-sm'
                  : 'text-ink/65 hover:text-ink hover:bg-ink/5'
              }`}
            >
              Meetings
            </button>
            <button
              onClick={() => setActiveTab('chats')}
              className={`px-6 py-2 rounded-full text-body-sm font-bold transition-all duration-200 ${
                activeTab === 'chats'
                  ? 'bg-ink text-canvas shadow-sm'
                  : 'text-ink/65 hover:text-ink hover:bg-ink/5'
              }`}
            >
              Chats
            </button>
          </div>
        </div>

        {activeTab === 'meetings' ? (
          <>
            {/* HERO (Monochrome) */}
            <section className="text-center">
              <h1 className="text-display-xl tracking-tight leading-none mb-6">
                {greeting},<br /> {user?.firstName}.
              </h1>
              <p className="text-subhead max-w-2xl mx-auto">
                Welcome to the new standard for video collaboration. Clean, fast, and entirely focused on your team's flow.
              </p>
              {instantMeetingError && (
                <div className="mt-4 text-red-600 bg-red-50 p-4 rounded-md inline-block">{instantMeetingError}</div>
              )}
            </section>

            {/* LIME BLOCK: START & JOIN */}
            <section className="bg-block-lime rounded-lg p-[48px] flex flex-col md:flex-row gap-[48px]">
              <div className="flex-1">
                <h2 className="text-headline mb-4">Start an instant call</h2>
                <p className="text-body-default mb-8 max-w-sm">Launch a new room in one click. Share the link with anyone to join immediately.</p>
                <div className="flex items-center gap-4">
                  <Button onClick={handleStartInstantMeeting} variant="primary">New Meeting</Button>
                  <Button onClick={() => setIsScheduleModalOpen(true)} variant="secondary">Schedule</Button>
                </div>
              </div>
              
              <div className="w-px bg-ink/10 hidden md:block" />

              <div className="flex-1 flex flex-col justify-center">
                <h2 className="text-headline mb-4">Join by Code</h2>
                <form onSubmit={handleJoinByCode} className="flex gap-4">
                  <Input
                    placeholder="abc-defg-hij"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button type="submit" variant="primary" disabled={!joinCode}>Join</Button>
                </form>
              </div>
            </section>

            {/* LILAC BLOCK: YOUR MEETINGS */}
            <section className="bg-block-lilac rounded-lg p-[48px] flex flex-col md:flex-row gap-[48px]">
              {/* Upcoming */}
              <div className="flex-1">
                <h2 className="text-headline mb-6">Upcoming Syncs</h2>
                <div className="space-y-4">
                  {isLoadingMeetings ? <p className="text-body-sm">Loading...</p> : 
                   upcomingMeetings.length === 0 ? <p className="text-body-sm">No upcoming meetings.</p> :
                   upcomingMeetings.slice(0, 1).map((mtg) => (
                     <div key={mtg.id} className="bg-canvas rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
                       <div>
                         <h3 className="text-card-title">{mtg.title}</h3>
                         <p className="text-body-sm text-ink/70">
                           {mtg.scheduled_start ? new Date(mtg.scheduled_start).toLocaleString('en-US', {
                             month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                           }) : 'Instant Link'}
                         </p>
                       </div>
                       <div className="flex items-center gap-2">
                         <Button 
                           onClick={() => {
                             const url = generateGoogleCalendarUrl(mtg.title, mtg.scheduled_start, mtg.duration, mtg.code);
                             window.open(url, '_blank');
                           }} 
                           variant="tertiary-text"
                           className="text-xs py-1 px-2"
                         >
                           Google Cal
                         </Button>
                         <Button 
                           onClick={() => downloadIcsFile(mtg.title, mtg.scheduled_start, mtg.duration, mtg.code)} 
                           variant="tertiary-text"
                           className="text-xs py-1 px-2"
                         >
                           Outlook (.ics)
                         </Button>
                         <Button onClick={() => navigate(`/room/${mtg.code}`)} variant="primary">Join</Button>
                       </div>
                     </div>
                   ))
                  }
                </div>
              </div>

              <div className="w-px bg-ink/10 hidden md:block" />

              {/* Personal Room & History */}
              <div className="flex-1 space-y-[48px]">
                <div>
                  <h2 className="text-headline mb-4">Your Personal Room</h2>
                  <div className="bg-canvas rounded-lg p-6 shadow-sm">
                    <p className="text-eyebrow mb-2">Room Link</p>
                    <div className="flex items-center gap-2 mb-6">
                      <span className="text-body-sm font-mono truncate">{window.location.host}/room/personal-{user?.id?.slice(0, 8)}…</span>
                      <Button variant="tertiary-text" onClick={handleCopyPersonalLink}>
                        {isCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                    <Button onClick={() => navigate(`/room/personal-${user?.id}`)} variant="secondary" className="w-full">
                      Launch Room
                    </Button>
                  </div>
                </div>

                <div>
                  <h2 className="text-headline mb-4">History</h2>
                  <div className="space-y-2">
                    {isLoadingMeetings ? <p className="text-body-sm">Loading...</p> :
                     pastMeetings.length === 0 ? <p className="text-body-sm">No past meetings.</p> :
                     pastMeetings.slice(0, 3).map((mtg) => (
                       <div key={mtg.id} className="flex justify-between items-center py-2 border-b border-hairline last:border-0">
                         <span className="text-body-sm font-bold truncate pr-4">{mtg.title}</span>
                         <Badge color="brand">Ended</Badge>
                       </div>
                     ))
                    }
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : (
          /* CHATS TAB */
          <section className="bg-canvas border border-hairline rounded-xl shadow-lg overflow-hidden flex flex-col md:flex-row h-[600px] backdrop-blur-md relative z-10">
            {/* Thread list sidebar */}
            <div className="w-full md:w-[320px] border-r border-hairline flex flex-col bg-[#fafaf9]">
              <div className="p-4 border-b border-hairline flex justify-between items-center bg-canvas">
                <h2 className="text-body-sm font-bold text-ink">Conversations</h2>
                <Button onClick={() => setIsNewChatModalOpen(true)} variant="primary" className="!py-1 px-3 text-xs">
                  + New Chat
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-hairline">
                {isLoadingChats && chatThreads.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-soft">Loading conversations...</div>
                ) : chatThreads.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted-soft">No active conversations. Click "+ New Chat" to notify someone via Gmail.</div>
                ) : (
                  chatThreads.map((thread) => {
                    const isSelected = activeThreadCode === thread.code;
                    const initial = thread.otherParticipantName.charAt(0).toUpperCase() || '@';
                    return (
                      <button
                        key={thread.code}
                        onClick={() => {
                          setActiveThreadCode(thread.code);
                          fetchThreadMessages(thread.code);
                        }}
                        className={`w-full text-left p-4 flex items-center gap-3 transition-colors duration-150 ${
                          isSelected ? 'bg-ink/5' : 'hover:bg-ink/[0.02]'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-ink/10 flex items-center justify-center text-ink font-bold text-xs">
                          {initial}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-0.5">
                            <span className="text-body-xs font-bold text-ink truncate pr-2">
                              {thread.otherParticipantName}
                            </span>
                            <span className="text-[10px] text-muted-soft">
                              {new Date(thread.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted truncate">
                            {thread.otherParticipantEmail}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Conversation canvas */}
            <div className="flex-1 flex flex-col bg-canvas">
              {activeThreadCode ? (
                <>
                  {/* Active thread header */}
                  {(() => {
                    const activeThread = chatThreads.find(t => t.code === activeThreadCode);
                    if (!activeThread) return null;
                    return (
                      <div className="p-4 border-b border-hairline flex items-center justify-between bg-canvas">
                        <div>
                          <h3 className="text-body-sm font-bold text-ink">
                            {activeThread.otherParticipantName}
                          </h3>
                          <p className="text-[11px] text-muted">
                            {activeThread.otherParticipantEmail} (Gmail delivery active)
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Message logs */}
                  <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#fafaf9]/30">
                    {isLoadingMessages && activeThreadMessages.length === 0 ? (
                      <div className="text-center text-xs text-muted-soft py-4">Loading messages...</div>
                    ) : activeThreadMessages.length === 0 ? (
                      <div className="text-center text-xs text-muted-soft py-4">No messages yet. Send a message to start the conversation.</div>
                    ) : (
                      activeThreadMessages.map((msg) => {
                        const isMe = msg.senderId === user?.id;
                        return (
                        <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-body-sm shadow-sm ${
                              isMe
                                ? 'bg-ink text-canvas rounded-br-none'
                                : 'bg-[#e2e1df] text-ink rounded-bl-none'
                            }`}
                          >
                            {!isMe && (
                              <div className="text-[10px] font-bold opacity-60 mb-0.5">
                                {msg.senderName}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                            <span className="block text-[9px] text-right mt-1 opacity-50">
                              {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                  </div>

                  {/* Chat input */}
                  <form onSubmit={handleSendChatMessage} className="p-4 border-t border-hairline bg-canvas flex gap-3">
                    <Input
                      placeholder="Type your message (delivers to Gmail instant reply)..."
                      value={activeChatInput}
                      onChange={(e) => setActiveChatInput(e.target.value)}
                      className="flex-1 bg-[#fafaf9]"
                      disabled={isSendingMessage}
                    />
                    <Button type="submit" variant="primary" disabled={!activeChatInput.trim() || isSendingMessage}>
                      Send
                    </Button>
                  </form>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-soft">
                  <div className="w-16 h-16 rounded-full bg-[#f4ebd0] flex items-center justify-center mb-4">
                    <span className="text-2xl">💬</span>
                  </div>
                  <h3 className="text-body-sm font-bold text-ink mb-1">Gmail-Integrated Messaging</h3>
                  <p className="text-body-xs max-w-sm">
                    Enter any email address to initiate a conversation. The recipient will be notified in Gmail immediately with instructions to reply.
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-[#eaeaea] border-t border-hairline py-12 px-8 mt-12 rounded-t-xl">
        <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="text-body-sm font-bold text-ink">Chatsie</span>
              <span className="text-caption text-ink/40">•</span>
              <span className="text-caption text-ink/60">Made with love</span>
            </div>
            <p className="text-caption text-ink/50">
              made by{' '}
              <a 
                href="https://singulr.tech" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:underline font-bold text-ink"
              >
                singulr<span className="text-[#ff3d8b]">.</span>tech
              </a>
            </p>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-caption font-bold text-ink/75">
            <button 
              type="button"
              onClick={() => setIsPrivacyModalOpen(true)} 
              className="hover:text-ink cursor-pointer"
            >
              Privacy Policy
            </button>
            <button 
              type="button"
              onClick={() => setIsTermsModalOpen(true)} 
              className="hover:text-ink cursor-pointer"
            >
              Terms & Conditions
            </button>
            <button 
              type="button"
              onClick={() => setIsJobsModalOpen(true)} 
              className="hover:text-ink cursor-pointer"
            >
              Open Jobs
            </button>
            <button 
              type="button"
              onClick={() => navigate('/future-features')} 
              className="hover:text-ink cursor-pointer text-[#ff3d8b]"
            >
              Future Features
            </button>
          </div>
        </div>
      </footer>

      {/* SCHEDULE MODAL */}
      <Modal 
        isOpen={isScheduleModalOpen} 
        onClose={handleCloseScheduleModal} 
        title={scheduledMeetingResult ? "Meeting Scheduled Successfully!" : "Schedule Upcoming Meeting"}
      >
        {scheduledMeetingResult ? (
          <div className="space-y-6 py-2">
            <div className="p-4 bg-block-lime/10 border border-block-lime/30 rounded-lg text-ink space-y-3">
              <h3 className="text-body-strong font-bold">{scheduledMeetingResult.title}</h3>
              <p className="text-body-sm text-ink/75">
                {scheduledMeetingResult.scheduled_start ? new Date(scheduledMeetingResult.scheduled_start).toLocaleString('en-US', {
                  weekday: 'long', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : 'Anytime'}
              </p>
              <div className="flex items-center justify-between bg-canvas border border-hairline rounded p-2 text-body-xs font-mono">
                <span className="truncate">{window.location.origin}/room/{scheduledMeetingResult.code}</span>
                <Button 
                  variant="tertiary-text"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/room/${scheduledMeetingResult.code}`);
                    setIsResultCopied(true);
                    setTimeout(() => setIsResultCopied(false), 2000);
                  }}
                  className="py-1 px-2 text-xs"
                >
                  {isResultCopied ? 'Copied!' : 'Copy Link'}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-eyebrow text-ink/60">Add to your calendar</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={() => {
                    const url = generateGoogleCalendarUrl(
                      scheduledMeetingResult.title,
                      scheduledMeetingResult.scheduled_start,
                      scheduledMeetingResult.duration,
                      scheduledMeetingResult.code
                    );
                    window.open(url, '_blank');
                  }}
                  variant="secondary"
                  className="w-full text-center"
                >
                  Google Calendar
                </Button>
                <Button
                  onClick={() => {
                    downloadIcsFile(
                      scheduledMeetingResult.title,
                      scheduledMeetingResult.scheduled_start,
                      scheduledMeetingResult.duration,
                      scheduledMeetingResult.code
                    );
                  }}
                  variant="secondary"
                  className="w-full text-center"
                >
                  Outlook / Apple (.ics)
                </Button>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-hairline">
              <Button onClick={handleCloseScheduleSuccess} variant="primary">
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleScheduleMeeting} className="space-y-4">
            {createMeetingError && <div className="text-red-500 text-body-sm">{createMeetingError}</div>}
            <Input label="Meeting Title" value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} />
            <div className="flex gap-4">
              <Input label="Date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
              <Input label="Time" type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
            <div className="flex gap-4">
              <Input label="Duration (min)" type="number" value={meetingDuration} onChange={(e) => setMeetingDuration(e.target.value)} />
              <Input label="Passcode (Optional)" value={meetingPasscode} onChange={(e) => setMeetingPasscode(e.target.value)} />
            </div>
            <Input label="Invited Guest Emails (Optional, comma-separated)" placeholder="e.g. alice@example.com, bob@example.com" value={guestEmails} onChange={(e) => setGuestEmails(e.target.value)} />
            
            <div className="flex flex-col gap-2 py-2">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={isWaitingRoomEnabled} onChange={(e) => setIsWaitingRoomEnabled(e.target.checked)} className="w-4 h-4 accent-primary" />
                <label className="text-body-sm font-bold">Enable Waiting Room</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={blockEarlyJoin} onChange={(e) => setBlockEarlyJoin(e.target.checked)} className="w-4 h-4 accent-primary" />
                <label className="text-body-sm font-bold">Prevent Early Join (route to waiting room before scheduled time)</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={inviteOnly} onChange={(e) => setInviteOnly(e.target.checked)} className="w-4 h-4 accent-primary" />
                <label className="text-body-sm font-bold">Lock scheduled meeting to invited participants only</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" type="button" onClick={handleCloseScheduleModal}>Cancel</Button>
              <Button type="submit" variant="primary" isLoading={isCreatingMeeting}>Schedule</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* PRIVACY POLICY MODAL */}
      <Modal isOpen={isPrivacyModalOpen} onClose={() => setIsPrivacyModalOpen(false)} title="Privacy Policy">
        <div className="space-y-4 py-2 text-body-sm text-ink/80 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
          <p className="font-bold text-ink text-body-default">Last Updated: June 25, 2026</p>
          <p>
            At Chatsie, your privacy is our core priority. This Privacy Policy details how we collect, use, and safeguard your personal information when you use our service.
          </p>
          <div>
            <h4 className="font-bold text-ink mb-1">1. Information We Collect</h4>
            <p>
              We collect minimal information to operate the platform securely:
            </p>
            <ul className="list-disc pl-5 mt-1 space-y-1">
              <li><strong>Account Credentials:</strong> Name and email address provided during Clerk sign-in.</li>
              <li><strong>Meeting Metadata:</strong> Room titles, passcodes, and scheduling metadata.</li>
              <li><strong>Temporary State:</strong> Interactive polls, whiteboard drawings, and Q&A logs are stored temporarily in transient memory to coordinate active calls.</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">2. Media and Stream Data</h4>
            <p>
              Your real-time audio and video feeds are transmitted directly through live WebRTC connections (facilitated securely via LiveKit servers). Chatsie does not record, log, or store your voice, video streams, or screen shares on our servers.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">3. AI Transcription</h4>
            <p>
              Live meeting transcriptions generated via Gemini AI are processed client-side using your custom Gemini API key. Transcription text is streamed directly through WebRTC to local session participants and is not stored or collected on our backend.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">4. Data Retention and Erasure</h4>
            <p>
              All room state, including chat transcripts, live questions, and poll data, is automatically purged from memory immediately when the meeting room session is terminated.
            </p>
          </div>
          <div className="flex justify-end pt-4 border-t border-hairline mt-4">
            <Button onClick={() => setIsPrivacyModalOpen(false)} variant="primary">Close</Button>
          </div>
        </div>
      </Modal>

      {/* TERMS & CONDITIONS MODAL */}
      <Modal isOpen={isTermsModalOpen} onClose={() => setIsTermsModalOpen(false)} title="Terms & Conditions">
        <div className="space-y-4 py-2 text-body-sm text-ink/80 leading-relaxed max-h-[60vh] overflow-y-auto pr-2">
          <p className="font-bold text-ink text-body-default">Last Updated: June 25, 2026</p>
          <p>
            Welcome to Chatsie. By accessing or using our platform, you agree to comply with and be bound by the following Terms & Conditions.
          </p>
          <div>
            <h4 className="font-bold text-ink mb-1">1. Acceptance of Terms</h4>
            <p>
              These terms govern your access to Chatsie. If you do not agree with any part of these terms, you must immediately cease using the platform.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">2. Permitted Use</h4>
            <p>
              You agree to use Chatsie only for lawful, collaborative communication. You are prohibited from sending spam, transmitting malware, harassing other call participants, or attempting to compromise connection security.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">3. Moderation and Host Authority</h4>
            <p>
              Meeting hosts and moderators retain absolute authority over their sessions. Hosts can approve or deny admission, mute any participant, and kick or ban individuals from the meeting room.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-ink mb-1">4. Disclaimer of Warranties</h4>
            <p>
              Chatsie is provided "as is" and "as available" without warranties of any kind, either express or implied, including warranties of uptime, merchantability, or fitness for a particular purpose.
            </p>
          </div>
          <div className="flex justify-end pt-4 border-t border-hairline mt-4">
            <Button onClick={() => setIsTermsModalOpen(false)} variant="primary">Close</Button>
          </div>
        </div>
      </Modal>

      {/* OPEN JOBS MODAL */}
      <Modal isOpen={isJobsModalOpen} onClose={() => setIsJobsModalOpen(false)} title="Open Jobs">
        <div className="space-y-4 py-2 text-body-sm text-ink/80 leading-relaxed">
          <p className="font-bold text-ink">Currently, there are no open positions at Chatsie.</p>
          <p>
            Chatsie is built and maintained by a small, hyper-efficient team at singulr.tech. We do not have any active openings or internship opportunities at this time.
          </p>
          <p>
            Please check back in the future, or follow our work on GitHub to stay updated with potential developer opportunities.
          </p>
          <div className="flex justify-end pt-4 border-t border-hairline mt-4">
            <Button onClick={() => setIsJobsModalOpen(false)} variant="primary">Close</Button>
          </div>
        </div>
      </Modal>

      {/* NEW CHAT MODAL */}
      <Modal isOpen={isNewChatModalOpen} onClose={() => setIsNewChatModalOpen(false)} title="Start New Conversation">
        <form onSubmit={handleStartNewChat} className="space-y-4 py-2">
          <Input
            label="Recipient Gmail / Email Address"
            type="email"
            placeholder="recipient@example.com"
            value={newChatRecipient}
            onChange={(e) => setNewChatRecipient(e.target.value)}
            required
          />
          <div className="flex flex-col space-y-1.5">
            <label className="text-xs font-bold text-ink">Initial Message</label>
            <textarea
              placeholder="Type your initial message..."
              value={newChatMessage}
              onChange={(e) => setNewChatMessage(e.target.value)}
              required
              className="w-full min-h-[100px] p-3 rounded-lg border border-hairline bg-canvas text-body-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-hairline">
            <Button variant="secondary" type="button" onClick={() => setIsNewChatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSendingMessage} disabled={!newChatRecipient.trim() || !newChatMessage.trim()}>
              Send Message
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

