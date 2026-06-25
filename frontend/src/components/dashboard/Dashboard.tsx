import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.png';
import { useUser, UserButton, useAuth } from '@clerk/clerk-react';
import { Button, Input, Modal, Badge } from '../ui';

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
      const response = await fetch(`${apiUrl}/api/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          title: meetingTitle,
          passcode: meetingPasscode || null,
          isWaitingRoomEnabled,
          scheduledStart: scheduledStartISO,
          duration: meetingDuration ? parseInt(meetingDuration, 10) : null
        })
      });
      if (!response.ok) throw new Error('Failed to schedule meeting');
      setMeetingTitle(''); setScheduledDate(''); setScheduledTime(''); setMeetingPasscode(''); setIsScheduleModalOpen(false);
      fetchMeetings();
    } catch (err: any) {
      setCreateMeetingError(err.message || 'An error occurred.');
    } finally {
      setIsCreatingMeeting(false);
    }
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

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
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

      <main className="flex-1 w-full max-w-[1280px] mx-auto px-6 py-24 space-y-[96px]">
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
               upcomingMeetings.map((mtg) => (
                 <div key={mtg.id} className="bg-canvas rounded-lg p-6 flex items-center justify-between shadow-sm">
                   <div>
                     <h3 className="text-card-title">{mtg.title}</h3>
                     <p className="text-body-sm text-ink/70">
                       {mtg.scheduled_start ? new Date(mtg.scheduled_start).toLocaleString('en-US', {
                         month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                       }) : 'Instant Link'}
                     </p>
                   </div>
                   <Button onClick={() => navigate(`/room/${mtg.code}`)} variant="primary">Join</Button>
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
      </main>

      {/* FOOTER */}
      <footer className="bg-canvas text-caption px-[32px] py-[64px] border-t border-hairline-soft flex justify-between">
        <span>FIGMA MARKETING SYSTEM REPLICA</span>
        <span>CHATSIE INC</span>
      </footer>

      {/* SCHEDULE MODAL */}
      <Modal isOpen={isScheduleModalOpen} onClose={() => setIsScheduleModalOpen(false)} title="Schedule Upcoming Meeting">
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
          <div className="flex items-center gap-3 py-2">
            <input type="checkbox" checked={isWaitingRoomEnabled} onChange={(e) => setIsWaitingRoomEnabled(e.target.checked)} className="w-4 h-4 accent-primary" />
            <label className="text-body-sm font-bold">Enable Waiting Room</label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" type="button" onClick={() => setIsScheduleModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={isCreatingMeeting}>Schedule</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

