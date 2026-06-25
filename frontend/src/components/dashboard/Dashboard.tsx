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
    setScheduledMeetingResult(null);
    setIsScheduleModalOpen(false);
  };

  const handleCloseScheduleModal = () => {
    setMeetingTitle('');
    setScheduledDate('');
    setScheduledTime('');
    setMeetingPasscode('');
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
            <div className="flex items-center gap-3 py-2">
              <input type="checkbox" checked={isWaitingRoomEnabled} onChange={(e) => setIsWaitingRoomEnabled(e.target.checked)} className="w-4 h-4 accent-primary" />
              <label className="text-body-sm font-bold">Enable Waiting Room</label>
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
    </div>
  );
};

