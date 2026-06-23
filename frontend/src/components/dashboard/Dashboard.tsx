import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, UserButton, useAuth } from '@clerk/clerk-react';
import { Button, Input, Card, Modal, Badge } from '../ui';
import {
  Video,
  Keyboard,
  History,
  Calendar,
  Copy,
  Check,
  Clock,
  ExternalLink,
  Shield,
  Sun,
  Moon
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

      if (!response.ok) throw new Error('Failed to create instant meeting');
      
      const data = await response.json();
      navigate(`/room/${data.meeting.code}`);
    } catch (err: any) {
      console.error('Error starting instant meeting:', err);
      // Fallback to random room if server error
      const code = generateRoomCode();
      navigate(`/room/${code}`);
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
    <div className="min-h-screen bg-canvas dark:bg-dark-950 text-body dark:text-gray-200 transition-colors duration-200">
      
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-canvas/90 border-b border-hairline px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Signature Anthropic radial spike prefix */}
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-primary fill-current">
            <path d="M12,2 C12.5,7.5 16.5,11.5 22,12 C16.5,12.5 12.5,16.5 12,22 C11.5,16.5 7.5,12.5 2,12 C7.5,11.5 11.5,7.5 12,2 Z" />
          </svg>
          <span className="text-2xl font-serif font-normal tracking-tight text-ink">VMeet</span>
        </div>

        <div className="flex items-center space-x-4">
          <button
            onClick={toggleDarkMode}
            className="p-2 text-muted hover:text-ink dark:text-gray-400 rounded-lg transition-all"
            title="Toggle theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="flex items-center space-x-3 border-l border-hairline dark:border-dark-800 pl-4">
            <div className="hidden md:block text-right mr-2">
              <p className="text-xs font-bold text-ink leading-tight transition-colors">
                {user?.fullName || 'Loading...'}
              </p>
              <p className="text-[10px] text-muted font-semibold leading-none mt-0.5">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
            <UserButton afterSignOutUrl="/signin" />
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Greeting, Actions & Permanent Room */}
        <div className="lg:col-span-7 space-y-8">
          
          {/* Coral Callout Card */}
          <div className="bg-primary rounded-xl p-8 text-white shadow-sm border border-primary-active/20">
            <h1 className="text-4xl font-serif tracking-tight leading-tight font-normal">
              Hello, {user?.firstName || 'there'}!
            </h1>
            <p className="text-primary-disabled text-sm font-sans font-medium mt-2">{formattedDate}</p>
            <div className="mt-8 border-t border-white/10 pt-4 flex flex-wrap gap-4 text-xs font-sans font-semibold text-primary-disabled">
              <div className="flex items-center"><Video className="w-4 h-4 mr-1.5" /> 10-User HD Mesh Support</div>
              <div className="flex items-center"><Shield className="w-4 h-4 mr-1.5" /> Direct P2P Encryption</div>
            </div>
          </div>

          {/* Quick Action Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Instant Meeting */}
            <Card 
              className="p-6 cursor-pointer hover:border-primary/50 hover:bg-surface-card/50 group transition-all duration-300"
              onClick={handleStartInstantMeeting}
            >
              <div className="w-12 h-12 bg-primary text-white rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <Video className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-xl font-normal text-ink">New Instant Meeting</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Host a video conference room immediately.
              </p>
            </Card>

            {/* Schedule Meeting */}
            <Card 
              className="p-6 cursor-pointer hover:border-primary/50 hover:bg-surface-card/50 group transition-all duration-300"
              onClick={() => setIsScheduleModalOpen(true)}
            >
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform border border-primary/20">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="font-serif text-xl font-normal text-ink">Schedule Meeting</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Plan meetings ahead with waiting rooms or passcode barriers.
              </p>
            </Card>
          </div>

          {/* Join meeting */}
          <Card className="p-6">
            <h3 className="font-serif text-xl font-normal text-ink mb-3 flex items-center">
              <Keyboard className="w-4.5 h-4.5 mr-2 text-primary" />
              Join meeting by code
            </h3>
            <form onSubmit={handleJoinByCode} className="flex gap-2">
              <Input
                placeholder="Enter meeting code (e.g. abc-defg-hij) or URL"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="bg-canvas"
              />
              <Button type="submit" disabled={!joinCode}>Join</Button>
            </form>
          </Card>

          {/* Personal permanent room */}
          <Card className="p-6 bg-surface-card/30 border border-hairline/80">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl font-normal text-ink">Personal Meeting Room</h3>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Your permanent meeting room code to share with close peers.
                </p>
              </div>
              <Badge color="brand">Permanent</Badge>
            </div>
            
            <div className="mt-4 flex items-center bg-canvas rounded-lg p-2 border border-hairline">
              <span className="text-xs font-mono text-muted truncate mr-2 select-all flex-grow pl-1.5">
                {window.location.origin}{import.meta.env.BASE_URL}room/personal-{user?.id}
              </span>
              <div className="flex space-x-2 flex-shrink-0">
                <button
                  onClick={handleCopyPersonalLink}
                  className="p-1.5 hover:bg-surface-soft rounded transition-colors text-muted hover:text-primary"
                  title="Copy link"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleStartPersonalRoom}
                  className="p-1.5 hover:bg-surface-soft rounded transition-colors text-primary font-bold text-xs flex items-center"
                  title="Start Room"
                >
                  Start <ExternalLink className="w-3.5 h-3.5 ml-1" />
                </button>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Scheduled List & History */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Upcoming Meetings */}
          <Card className="p-6">
            <h2 className="font-serif text-2xl font-normal text-ink mb-4 flex items-center">
              <Clock className="w-4.5 h-4.5 mr-2 text-primary" />
              Upcoming Meetings
            </h2>

            {isLoadingMeetings ? (
              <div className="text-center py-8 text-muted text-sm font-medium">Loading meetings...</div>
            ) : upcomingMeetings.length === 0 ? (
              <div className="text-center py-8 text-muted text-xs font-semibold">
                No upcoming meetings scheduled.
              </div>
            ) : (
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                {upcomingMeetings.map((mtg) => (
                  <div 
                    key={mtg.id}
                    className="p-3 bg-canvas rounded-lg border border-hairline flex items-center justify-between"
                  >
                    <div className="truncate mr-3">
                      <p className="text-xs font-bold text-ink truncate">{mtg.title}</p>
                      <p className="text-[10px] text-muted font-semibold mt-1">
                        {mtg.scheduled_start ? new Date(mtg.scheduled_start).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'Instant Link'}
                      </p>
                      {mtg.passcode && (
                        <div className="flex items-center text-[10px] text-primary font-bold mt-1">
                          <Shield className="w-3 h-3 mr-0.5" /> Protected
                        </div>
                      )}
                    </div>
                    
                    <Button 
                      size="sm"
                      onClick={() => navigate(`/room/${mtg.code}`)}
                    >
                      Join
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Past History */}
          <Card className="p-6">
            <h2 className="font-serif text-2xl font-normal text-ink mb-4 flex items-center">
              <History className="w-4.5 h-4.5 mr-2 text-muted" />
              Meeting History
            </h2>

            {isLoadingMeetings ? (
              <div className="text-center py-8 text-muted text-xs">Loading history...</div>
            ) : pastMeetings.length === 0 ? (
              <div className="text-center py-6 text-muted text-xs font-semibold">
                No past meetings.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {pastMeetings.map((mtg) => (
                  <div 
                    key={mtg.id}
                    className="p-2.5 bg-canvas/50 rounded-lg border border-hairline/80 flex justify-between items-center text-xs"
                  >
                    <div className="truncate mr-2">
                      <p className="font-bold text-body-strong truncate">{mtg.title}</p>
                      <p className="text-[10px] text-muted font-medium mt-0.5">
                        Code: {mtg.code}
                      </p>
                    </div>
                    <Badge color="gray">Ended</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </main>

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
