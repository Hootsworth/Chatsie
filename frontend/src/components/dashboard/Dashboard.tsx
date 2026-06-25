import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.png';
import { useUser, UserButton, useAuth } from '@clerk/clerk-react';
import { Button, Input, Modal, Badge } from '../ui';
import {
  Video,
  History,
  Calendar,
  Copy,
  Check,
  Clock,
  ExternalLink,
  Shield,
  Sun,
  Moon,
  ArrowRight,
  Loader2
} from 'lucide-react';

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
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [createMeetingError, setCreateMeetingError] = useState<string | null>(null);
  const [instantMeetingError, setInstantMeetingError] = useState<string | null>(null);

  // Dark mode state
  const [darkMode, setDarkMode] = useState(() => {
    return document.documentElement.classList.contains('dark') || 
      localStorage.getItem('theme') === 'dark';
  });

  // Toggle theme helper
  const toggleDarkMode = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Helper to fetch authorization header
  const getAuthHeader = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  };

  // Generates meeting room codes
  function generateRoomCode(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const part1 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part2 = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    const part3 = Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * 26)]).join('');
    return `${part1}-${part2}-${part3}`;
  }

  // Fetch upcoming and past meetings
  const fetchMeetings = async () => {
    setIsLoadingMeetings(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      
      if (!apiUrl || apiUrl === 'undefined' || apiUrl === 'null') {
        // Without an API URL configured, we just don't load history
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

  // Handler to start an Instant Meeting
  const handleStartInstantMeeting = async () => {
    setInstantMeetingError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      
      if (!apiUrl || apiUrl === 'undefined' || apiUrl === 'null') {
        // Without an API, just navigate to a random room code directly
        const code = generateRoomCode();
        navigate(`/room/${code}`);
        return;
      }

      const headers = await getAuthHeader();
      const response = await fetch(`${apiUrl}/api/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          title: `${user?.firstName || 'User'}'s Instant Meeting`,
          isWaitingRoomEnabled: false
        })
      });

      if (!response.ok) {
        let errorMsg = 'Failed to create instant meeting';
        try {
          const errData = await response.json();
          errorMsg = errData.error || errData.message || errorMsg;
          if (errData.details) {
            errorMsg += ` (${errData.details})`;
          }
        } catch (_) {}
        throw new Error(errorMsg);
      }
      
      const data = await response.json();
      navigate(`/room/${data.meeting.code}`);
    } catch (err: any) {
      console.error('Error starting instant meeting:', err);
      setInstantMeetingError(err.message || 'Failed to start instant meeting. Please check server connection.');
    }
  };

  // Handler to schedule a meeting
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

      if (!apiUrl) {
         setCreateMeetingError("Cannot schedule meetings without API URL configured.");
         setIsCreatingMeeting(false);
         return;
      }

      const headers = await getAuthHeader();
      const response = await fetch(`${apiUrl}/api/meetings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          title: meetingTitle,
          passcode: meetingPasscode || null,
          isWaitingRoomEnabled,
          scheduledStart: scheduledStartISO,
          duration: meetingDuration ? parseInt(meetingDuration, 10) : null
        })
      });

      if (!response.ok) throw new Error('Failed to schedule meeting');

      setMeetingTitle('');
      setScheduledDate('');
      setScheduledTime('');
      setMeetingDuration('30');
      setMeetingPasscode('');
      setIsWaitingRoomEnabled(false);
      setIsScheduleModalOpen(false);
      fetchMeetings();
    } catch (err: any) {
      setCreateMeetingError(err.message || 'An error occurred.');
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  // Handler to Join a Meeting by Code
  const handleJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode) return;
    
    let code = joinCode.trim().toLowerCase();
    if (code.includes('/room/')) {
      code = code.split('/room/')[1].split('?')[0];
    }
    
    navigate(`/room/${code}`);
  };

  const handleCopyPersonalLink = () => {
    if (!user) return;
    const personalLink = `${window.location.origin}${import.meta.env.BASE_URL}room/personal-${user.id}`;
    navigator.clipboard.writeText(personalLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleStartPersonalRoom = () => {
    if (!user) return;
    navigate(`/room/personal-${user.id}`);
  };

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="relative min-h-screen lg:h-screen lg:max-h-screen flex flex-col justify-between bg-canvas dark:bg-dark-950 text-body dark:text-gray-200 transition-colors duration-200 lg:overflow-hidden z-10">
      
      {/* Background drifting mesh glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[30%] -left-[20%] w-[60%] h-[60%] rounded-full bg-primary/5 dark:bg-primary/10 blur-[120px] animate-mesh-glow" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-primary/5 dark:bg-primary/5 blur-[100px] animate-mesh-glow" style={{ animationDelay: '-10s' }} />
      </div>

      {/* Top Navbar */}
      <header className="relative z-40 bg-transparent px-8 py-5 flex items-center justify-between flex-shrink-0 animate-fade-in-up">
        <div className="flex items-center space-x-3">
          <img src={logo} alt="Chatsie Logo" className="w-8 h-8 rounded-xl object-contain shadow-sm" />
          <span className="text-xl font-serif font-semibold tracking-tight text-ink">Chatsie</span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={toggleDarkMode}
            className="p-2 text-muted hover:text-ink dark:text-gray-400 rounded-xl hover:bg-surface-soft/40 transition-all duration-300 cursor-pointer"
            title="Toggle theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="flex items-center space-x-3 border-l border-hairline dark:border-dark-800 pl-4">
            <div className="hidden md:block text-right mr-1">
              <p className="text-xs font-bold text-ink leading-tight">
                {user?.fullName || 'Loading...'}
              </p>
              <p className="text-[10px] text-muted font-semibold leading-none mt-0.5">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
            <UserButton afterSignOutUrl="/signin" />
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-6 md:px-8 py-4 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start lg:items-center z-10 min-h-0 overflow-y-auto lg:overflow-visible">
        
        {/* Left Column: Typography & Actions */}
        <div className="lg:col-span-7 flex flex-col justify-between py-6 lg:h-full min-h-0 animate-fade-in-up space-y-8 lg:space-y-0">
          
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl lg:text-8xl tracking-tight leading-[0.9] text-ink font-serif font-light">
              Hello, <br />
              <span className="font-normal text-primary">{user?.firstName || 'there'}</span>.
            </h1>
            <p className="text-muted text-sm md:text-base font-light tracking-wide max-w-md">
              {formattedDate} • Chatsie premium video network. Start an instant call, schedule a sync, or join an active room.
            </p>
          </div>

          <div className="space-y-8 my-8">
            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleStartInstantMeeting}
                className="px-6 py-4.5 bg-primary hover:bg-primary-active text-white font-medium text-sm tracking-wider rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95 shadow-lg shadow-primary/10 hover:shadow-primary/20 flex items-center cursor-pointer"
              >
                <Video className="w-4 h-4 mr-2" /> Start Instant Call
              </button>
              
              <button
                onClick={() => setIsScheduleModalOpen(true)}
                className="px-6 py-4.5 bg-transparent hover:bg-surface-soft border border-hairline hover:border-primary/40 text-ink font-medium text-sm tracking-wider rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95 flex items-center cursor-pointer"
              >
                <Calendar className="w-4 h-4 mr-2 text-primary" /> Schedule for Later
              </button>
            </div>

            {/* Sleek unified Join Room input */}
            <div className="max-w-md space-y-2">
              <label className="text-xs font-bold tracking-wider text-muted uppercase">Join by Code or URL</label>
              <form onSubmit={handleJoinByCode} className="relative flex items-center border-b border-hairline focus-within:border-primary transition-colors pb-1">
                <input
                  type="text"
                  placeholder="enter-room-code-here"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="bg-transparent text-lg text-ink font-mono tracking-widest placeholder:text-muted/40 placeholder:font-sans focus:outline-none w-full pr-10 pl-1"
                />
                <button 
                  type="submit" 
                  disabled={!joinCode}
                  className={`absolute right-1 p-2 rounded-lg transition-all ${
                    joinCode 
                      ? 'text-primary hover:bg-primary/5 cursor-pointer scale-100' 
                      : 'text-muted/30 scale-95 pointer-events-none'
                  }`}
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </form>
            </div>
          </div>

          <div className="pt-6 border-t border-hairline/50">
            {instantMeetingError && (
              <div className="bg-red-50 dark:bg-red-950/20 text-red-650 dark:text-red-400 border border-red-100 dark:border-red-900/40 p-4 rounded-xl text-xs font-semibold flex items-center justify-between max-w-md mb-4 animate-fade-in-up">
                <span>{instantMeetingError}</span>
                <button 
                  onClick={() => setInstantMeetingError(null)} 
                  className="text-xs underline hover:text-red-800 dark:hover:text-red-300 ml-4 font-normal"
                >
                  Dismiss
                </button>
              </div>
            )}

            <div className="flex items-center justify-between max-w-md bg-surface-soft/60 backdrop-blur-sm rounded-xl p-3 border border-hairline/30">
              <div className="truncate mr-3">
                <p className="text-[10px] font-bold text-muted uppercase tracking-wider">Your Personal Meeting Link</p>
                <p className="text-xs font-mono text-ink truncate mt-0.5">
                  {window.location.origin}{import.meta.env.BASE_URL}room/personal-{user?.id}
                </p>
              </div>
              <div className="flex items-center space-x-1 flex-shrink-0">
                <button
                  onClick={handleCopyPersonalLink}
                  className="p-2 hover:bg-canvas rounded-lg transition-all text-muted hover:text-primary cursor-pointer"
                  title="Copy permanent link"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleStartPersonalRoom}
                  className="p-2 hover:bg-canvas rounded-lg transition-all text-primary hover:text-primary-active cursor-pointer"
                  title="Start personal room"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Scheduled Lists */}
        <div className="lg:col-span-5 w-full flex flex-col justify-center py-6 min-h-0 animate-fade-in-up delay-100">
          <div className="glass dark:bg-dark-900/40 border border-hairline/65 rounded-3xl p-6 flex flex-col lg:h-full max-h-[450px] lg:max-h-[75vh] overflow-hidden">
            
            {/* Upcoming List Section */}
            <div className="flex-grow flex flex-col min-h-0 mb-6">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h2 className="font-serif text-2xl text-ink flex items-center">
                  <Clock className="w-4.5 h-4.5 mr-2 text-primary" />
                  Upcoming Rooms
                </h2>
                {upcomingMeetings.length > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full">
                    {upcomingMeetings.length} scheduled
                  </span>
                )}
              </div>

              <div className="flex-grow overflow-y-auto pr-1 space-y-3 scrollbar-thin">
                {isLoadingMeetings ? (
                  <div className="flex items-center justify-center h-32 text-muted text-xs">
                    <Loader2 className="w-5 h-5 animate-spin mr-2 text-primary/60" />
                    Loading meetings...
                  </div>
                ) : upcomingMeetings.length === 0 ? (
                  <div className="h-32 flex flex-col items-center justify-center border border-dashed border-hairline/70 rounded-2xl text-center p-4">
                    <Calendar className="w-5 h-5 text-muted/30 mb-2" />
                    <p className="text-[11px] text-muted font-light">No upcoming connections scheduled.</p>
                  </div>
                ) : (
                  upcomingMeetings.map((mtg) => (
                    <div 
                      key={mtg.id}
                      className="p-3.5 bg-canvas/30 hover:bg-canvas/80 rounded-2xl border border-hairline/35 hover:border-primary/30 flex items-center justify-between transition-all duration-300 group hover:shadow-md hover:shadow-primary/2"
                    >
                      <div className="truncate mr-3">
                        <p className="text-xs font-bold text-ink truncate group-hover:text-primary transition-colors">{mtg.title}</p>
                        <p className="text-[10px] text-muted font-medium mt-1">
                          {mtg.scheduled_start ? new Date(mtg.scheduled_start).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'Instant Link'}
                        </p>
                        {mtg.passcode && (
                          <div className="flex items-center text-[9px] text-primary font-bold mt-1">
                            <Shield className="w-2.5 h-2.5 mr-0.5" /> Protected
                          </div>
                        )}
                      </div>
                      <button 
                        onClick={() => navigate(`/room/${mtg.code}`)}
                        className="px-4 py-2 bg-ink hover:bg-primary text-white hover:text-white dark:bg-surface-soft dark:hover:bg-primary dark:text-ink dark:hover:text-white text-[10px] font-bold rounded-xl transition-all duration-300 cursor-pointer active:scale-95 flex-shrink-0"
                      >
                        Join Room
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* History Section */}
            <div className="h-[35%] flex flex-col min-h-0 border-t border-hairline/40 pt-5">
              <h2 className="font-serif text-xl text-ink mb-3 flex items-center flex-shrink-0">
                <History className="w-4 h-4 mr-2 text-muted" />
                History Log
              </h2>

              <div className="flex-grow overflow-y-auto pr-1 space-y-2.5 scrollbar-thin">
                {isLoadingMeetings ? (
                  <div className="text-center py-4 text-muted text-xs">Loading history...</div>
                ) : pastMeetings.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center">
                    <p className="text-[10px] text-muted/60 font-light">History log is empty.</p>
                  </div>
                ) : (
                  pastMeetings.map((mtg) => (
                    <div 
                      key={mtg.id}
                      className="p-2.5 bg-canvas/10 rounded-xl border border-hairline/20 flex justify-between items-center text-[11px]"
                    >
                      <div className="truncate mr-2">
                        <p className="font-bold text-body-strong truncate">{mtg.title}</p>
                        <p className="text-[9px] text-muted font-mono mt-0.5">Code: {mtg.code}</p>
                      </div>
                      <Badge color="gray">Ended</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>

      </main>

      {/* Sleek Minimalist Footer */}
      <footer className="relative z-40 bg-transparent px-8 py-4 flex items-center justify-between flex-shrink-0 text-[10px] text-muted tracking-widest uppercase font-light border-t border-hairline/30 animate-fade-in-up delay-200">
        <div>Chatsie • Immersive Screenings</div>
        <div>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</div>
      </footer>

      {/* SCHEDULE MEETING MODAL */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        title="Schedule Upcoming Meeting"
      >
        <form onSubmit={handleScheduleMeeting} className="space-y-4">
          {createMeetingError && (
            <div className="p-3 bg-red-50 text-red-750 text-xs font-semibold rounded-lg">
              {createMeetingError}
            </div>
          )}

          <Input
            label="Meeting Title"
            placeholder="E.g., Design review sync"
            value={meetingTitle}
            onChange={(e) => setMeetingTitle(e.target.value)}
            disabled={isCreatingMeeting}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              disabled={isCreatingMeeting}
            />
            <Input
              label="Time"
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              disabled={isCreatingMeeting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Duration (minutes)"
              type="number"
              min="5"
              value={meetingDuration}
              onChange={(e) => setMeetingDuration(e.target.value)}
              disabled={isCreatingMeeting}
            />
            <Input
              label="Passcode (Optional)"
              placeholder="Leave blank for public"
              value={meetingPasscode}
              onChange={(e) => setMeetingPasscode(e.target.value)}
              disabled={isCreatingMeeting}
            />
          </div>

          <div className="flex items-center space-x-3.5 bg-surface-soft p-3 rounded-lg border border-hairline">
            <input
              id="waiting-room-checkbox"
              type="checkbox"
              checked={isWaitingRoomEnabled}
              onChange={(e) => setIsWaitingRoomEnabled(e.target.checked)}
              className="w-4 h-4 text-primary border-hairline rounded focus:ring-primary accent-primary"
              disabled={isCreatingMeeting}
            />
            <div>
              <label htmlFor="waiting-room-checkbox" className="text-xs font-bold text-ink">
                Enable Waiting Room
              </label>
              <p className="text-[10px] text-muted mt-0.5">Host must approve participants before entry.</p>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2.5 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setIsScheduleModalOpen(false)}
              disabled={isCreatingMeeting}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isCreatingMeeting}>
              Schedule
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
