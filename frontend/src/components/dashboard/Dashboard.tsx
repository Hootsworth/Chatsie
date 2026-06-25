import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.png';
import claymationHero from '../../assets/claymation_hero.png';
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
  Loader2,
  Zap,
  Gamepad2,
  AudioLines,
  Layers,
  Captions,
  PenTool,
  PictureInPicture,
  Smile,
  Circle,
  Users,
  Sparkles,
  Link2,
  Plus,
  ChevronRight
} from 'lucide-react';

const FEATURES = [
  {
    icon: Gamepad2,
    title: 'Retro Soundboard',
    description: 'Trigger 8 synthesized retro game & meme sounds via keyboard hotkeys. No audio files — pure Web Audio magic.',
    accent: 'from-violet-500 to-fuchsia-500',
    iconBg: 'bg-violet-500/15 text-violet-400'
  },
  {
    icon: AudioLines,
    title: 'Speaker Glows',
    description: 'Breathing emerald outlines pulse around whoever is speaking, with subtle scale-up depth transitions.',
    accent: 'from-emerald-500 to-teal-500',
    iconBg: 'bg-emerald-500/15 text-emerald-400'
  },
  {
    icon: Layers,
    title: 'Smart Video Grid',
    description: 'Dynamic aspect ratios shift from landscape to portrait as participants join. Auto-filters to 6 active feeds.',
    accent: 'from-sky-500 to-blue-500',
    iconBg: 'bg-sky-500/15 text-sky-400'
  },
  {
    icon: Zap,
    title: 'Auto-Hide UI',
    description: 'Controls vanish after 3 seconds of inactivity and reappear instantly on any movement.',
    accent: 'from-amber-500 to-orange-500',
    iconBg: 'bg-amber-500/15 text-amber-400'
  },
  {
    icon: Captions,
    title: 'Live Transcription',
    description: 'Real-time speech-to-text transcription with AI-powered meeting summaries at your fingertips.',
    accent: 'from-cyan-500 to-sky-500',
    iconBg: 'bg-cyan-500/15 text-cyan-400'
  },
  {
    icon: PenTool,
    title: 'Whiteboard',
    description: 'Collaborative drawing canvas right inside the call — sketch ideas in real time with your team.',
    accent: 'from-pink-500 to-rose-500',
    iconBg: 'bg-pink-500/15 text-pink-400'
  },
  {
    icon: Users,
    title: 'Breakout Rooms',
    description: 'Split into smaller groups mid-call with timed sessions and automatic reunification.',
    accent: 'from-indigo-500 to-violet-500',
    iconBg: 'bg-indigo-500/15 text-indigo-400'
  },
  {
    icon: Circle,
    title: 'Call Recording',
    description: 'Record your meeting with mixed WebRTC audio — captures all participants and screen shares.',
    accent: 'from-red-500 to-rose-500',
    iconBg: 'bg-red-500/15 text-red-400'
  },
  {
    icon: Smile,
    title: 'Emoji Reactions',
    description: 'Send floating emoji reactions that animate across everyone\'s screen in real time.',
    accent: 'from-yellow-500 to-amber-500',
    iconBg: 'bg-yellow-500/15 text-yellow-400'
  },
  {
    icon: PictureInPicture,
    title: 'Picture-in-Picture',
    description: 'Pop the call into a floating mini-window and multitask across your desktop seamlessly.',
    accent: 'from-teal-500 to-emerald-500',
    iconBg: 'bg-teal-500/15 text-teal-400'
  },
  {
    icon: Sparkles,
    title: 'Glass Aesthetics',
    description: 'Premium glassmorphic panels, floating control docks, and immersive mesh gradient backgrounds.',
    accent: 'from-fuchsia-500 to-pink-500',
    iconBg: 'bg-fuchsia-500/15 text-fuchsia-400'
  }
];

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

  const currentHour = new Date().getHours();
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';

  // Carousel drag-to-scroll
  const carouselRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeftPos] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!carouselRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - carouselRef.current.offsetLeft);
    setScrollLeftPos(carouselRef.current.scrollLeft);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !carouselRef.current) return;
    e.preventDefault();
    const x = e.pageX - carouselRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    carouselRef.current.scrollLeft = scrollLeft - walk;
  }, [isDragging, startX, scrollLeft]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="relative min-h-screen bg-canvas dark:bg-dark-950 text-body dark:text-gray-200 transition-colors duration-200 overflow-x-hidden">
      
      {/* Background layers */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[40%] -left-[20%] w-[70%] h-[70%] rounded-full bg-primary/[0.04] dark:bg-primary/[0.08] blur-[150px] animate-mesh-glow" />
        <div className="absolute top-[20%] -right-[15%] w-[50%] h-[50%] rounded-full bg-violet-500/[0.03] dark:bg-violet-500/[0.05] blur-[130px] animate-mesh-glow" style={{ animationDelay: '-7s' }} />
        <div className="absolute -bottom-[30%] left-[20%] w-[60%] h-[60%] rounded-full bg-primary/[0.03] dark:bg-primary/[0.04] blur-[120px] animate-mesh-glow" style={{ animationDelay: '-14s' }} />
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      </div>

      {/* ===== NAVBAR ===== */}
      <header className="relative z-40 px-6 md:px-10 py-4 flex items-center justify-between animate-fade-in-up">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <img src={logo} alt="Chatsie Logo" className="w-9 h-9 rounded-xl object-contain shadow-sm" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-canvas dark:border-dark-950" />
          </div>
          <span className="text-lg font-display font-bold tracking-tight text-ink">Chatsie</span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={toggleDarkMode}
            className="p-2.5 text-muted hover:text-ink dark:hover:text-white rounded-xl hover:bg-surface-soft/60 dark:hover:bg-dark-800/60 transition-all duration-300 cursor-pointer"
            title="Toggle theme"
          >
            {darkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
          </button>

          <div className="h-6 w-px bg-hairline dark:bg-dark-800 mx-1" />

          <div className="flex items-center space-x-3">
            <div className="hidden md:block text-right">
              <p className="text-xs font-bold text-ink leading-tight">
                {user?.fullName || 'Loading...'}
              </p>
              <p className="text-[10px] text-muted font-medium leading-none mt-0.5">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
            <UserButton afterSignOutUrl="/signin" />
          </div>
        </div>
      </header>

      {/* ===== HERO ===== */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 pt-8 md:pt-14 pb-10 md:pb-14 animate-fade-in-up">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Hero Column (7 cols) */}
          <div className="lg:col-span-7 text-left space-y-5">
            <p className="text-xs font-bold tracking-[0.2em] uppercase text-muted">{formattedDate}</p>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-semibold tracking-tight leading-[1.0] text-ink">
              {greeting},<br />
              <span className="bg-gradient-to-r from-brand-pink to-brand-peach bg-clip-text text-transparent font-semibold">{user?.firstName || 'there'}</span>.
            </h1>
            <p className="text-sm md:text-base text-muted font-normal max-w-lg leading-relaxed">
              Welcome back to Chatsie. Modern, smooth video meetings with a touch of playfulness. Ready to collaborate?
            </p>
            {instantMeetingError && (
              <div className="max-w-md bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/40 p-3 rounded-xl text-xs font-semibold flex items-center justify-between animate-fade-in-up">
                <span>{instantMeetingError}</span>
                <button onClick={() => setInstantMeetingError(null)} className="text-xs underline hover:text-red-800 dark:hover:text-red-300 ml-4 font-normal">Dismiss</button>
              </div>
            )}
          </div>

          {/* Right Hero Column (5 cols) - Claymation Mascot Illustration */}
          <div className="lg:col-span-5 hidden lg:block">
            <div className="bg-surface-soft border border-hairline/80 rounded-3xl p-4 shadow-xl shadow-primary/5 relative overflow-hidden group hover:scale-[1.01] transition-all duration-300">
              <div className="absolute -inset-10 bg-gradient-to-tr from-brand-peach/10 to-brand-pink/10 rounded-full blur-2xl opacity-60" />
              <img 
                src={claymationHero} 
                alt="Chatsie Claymation World" 
                className="w-full h-auto object-contain rounded-2xl relative z-10 border border-hairline/35 shadow-inner"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ===== BENTO GRID ===== */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 md:px-8 pb-10 animate-fade-in-up delay-100">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">

          {/* ── Start Call Card (spans 5 cols) ── */}
          <div className="lg:col-span-5 group relative overflow-hidden rounded-3xl bg-brand-pink p-6 md:p-8 text-white shadow-xl shadow-brand-pink/15 hover:shadow-2xl hover:shadow-brand-pink/25 transition-all duration-500 hover:-translate-y-0.5">
            {/* Decorative clay elements */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
            
            <div className="relative">
              <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300">
                <Video className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-2xl md:text-3xl font-display font-medium mb-2 tracking-tight">Start an instant call</h2>
              <p className="text-white/80 text-sm font-normal mb-6 max-w-xs leading-relaxed">Launch a new room in one click. Share the link with anyone to join.</p>
              <button
                onClick={handleStartInstantMeeting}
                className="px-6 py-3 bg-white text-brand-pink font-bold text-sm rounded-xl hover:bg-white/95 active:scale-[0.97] transition-all duration-200 shadow-lg shadow-black/10 cursor-pointer flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Meeting</span>
              </button>
            </div>
          </div>

          {/* ── Join + Schedule Stack (spans 3 cols) ── */}
          <div className="lg:col-span-3 flex flex-col gap-4">
            {/* Join by Code */}
            <div className="flex-1 bento-card group bg-brand-lavender/15 border-brand-lavender/30 dark:bg-dark-800/10 dark:border-white/5">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-brand-lavender/25 text-indigo-700 dark:text-brand-lavender flex items-center justify-center font-bold">
                  <Link2 className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Join by Code</h3>
              </div>
              <form onSubmit={handleJoinByCode} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="abc-defg-hij"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  className="flex-1 bg-white/80 dark:bg-dark-800/60 border border-hairline/80 dark:border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-ink font-mono tracking-wider placeholder:text-muted/40 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
                />
                <button 
                  type="submit" 
                  disabled={!joinCode}
                  className={`p-2.5 rounded-xl transition-all ${
                    joinCode 
                      ? 'bg-primary text-white dark:bg-white dark:text-dark-950 hover:scale-105 active:scale-95 cursor-pointer shadow-md' 
                      : 'bg-hairline/50 dark:bg-dark-800/50 text-muted/30 pointer-events-none'
                  }`}
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Schedule for Later */}
            <div 
              className="flex-1 bento-card group cursor-pointer hover:-translate-y-0.5 bg-surface-card/60 hover:bg-surface-card border-hairline/60"
              onClick={() => setIsScheduleModalOpen(true)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-xl bg-brand-teal/10 text-brand-teal dark:bg-brand-mint/15 dark:text-brand-mint flex items-center justify-center font-bold">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Schedule</h3>
                    <p className="text-[10px] text-muted font-light mt-0.5">Plan a future meeting</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          </div>

          {/* ── Personal Room Card (spans 4 cols) ── */}
          <div className="lg:col-span-4 bento-card group bg-brand-peach/15 border-brand-peach/30 dark:bg-dark-800/10 dark:border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-brand-peach/25 text-brand-peach flex items-center justify-center">
                  <ExternalLink className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Your Room</h3>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  onClick={handleCopyPersonalLink}
                  className="p-2 rounded-lg hover:bg-surface-soft dark:hover:bg-dark-800 text-muted hover:text-primary transition-all cursor-pointer"
                  title="Copy link"
                >
                  {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] font-mono text-muted truncate bg-white/70 dark:bg-dark-800/40 rounded-lg px-3 py-2 border border-hairline/30 dark:border-white/5 mb-4">
              {window.location.host}/room/personal-{user?.id?.slice(0, 8)}…
            </p>
            <button
              onClick={handleStartPersonalRoom}
              className="w-full px-4 py-2.5 bg-primary hover:bg-primary-active text-white dark:bg-white dark:text-dark-950 font-bold text-xs rounded-xl active:scale-[0.98] transition-all cursor-pointer shadow-sm flex items-center justify-center space-x-2"
            >
              <Video className="w-3.5 h-3.5" />
              <span>Launch Personal Room</span>
            </button>
          </div>

          {/* ── Upcoming Rooms (spans 7 cols) ── */}
          <div className="lg:col-span-7 bento-card bg-surface-card/60 border-hairline/60">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-xl bg-brand-mint/20 text-brand-teal dark:text-brand-mint flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">Upcoming Syncs</h3>
              </div>
              {upcomingMeetings.length > 0 && (
                <span className="text-[10px] font-bold px-2.5 py-1 bg-brand-mint/30 text-brand-teal dark:bg-brand-mint/20 dark:text-brand-mint rounded-full">
                  {upcomingMeetings.length}
                </span>
              )}
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {isLoadingMeetings ? (
                <div className="flex items-center justify-center h-24 text-muted text-xs">
                  <Loader2 className="w-4 h-4 animate-spin mr-2 text-primary/60" />
                  Loading...
                </div>
              ) : upcomingMeetings.length === 0 ? (
                <div className="h-24 flex flex-col items-center justify-center border border-dashed border-hairline/50 dark:border-white/5 rounded-2xl">
                  <Calendar className="w-5 h-5 text-muted/20 mb-2" />
                  <p className="text-[11px] text-muted/50 font-light">No upcoming meetings</p>
                </div>
              ) : (
                upcomingMeetings.map((mtg) => (
                  <div 
                    key={mtg.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-canvas dark:bg-dark-800/30 border border-hairline/40 dark:border-white/5 hover:border-brand-peach/50 dark:hover:border-primary/20 group/item transition-all duration-200"
                  >
                    <div className="truncate mr-3">
                      <p className="text-xs font-bold text-ink truncate group-hover/item:text-brand-pink transition-colors">{mtg.title}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <p className="text-[10px] text-muted font-medium">
                          {mtg.scheduled_start ? new Date(mtg.scheduled_start).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          }) : 'Instant Link'}
                        </p>
                        {mtg.passcode && (
                          <span className="flex items-center text-[9px] text-brand-pink font-bold">
                            <Shield className="w-2.5 h-2.5 mr-0.5" /> Protected
                          </span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => navigate(`/room/${mtg.code}`)}
                      className="px-3.5 py-1.5 bg-primary hover:bg-primary-active text-white dark:bg-white dark:text-dark-950 text-[10px] font-bold rounded-lg transition-all duration-200 cursor-pointer active:scale-95 flex-shrink-0"
                    >
                      Join
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── History Log (spans 5 cols) ── */}
          <div className="lg:col-span-5 bento-card bg-brand-ochre/10 border-brand-ochre/25 dark:bg-dark-800/10 dark:border-white/5">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-brand-ochre/20 text-brand-ochre dark:text-yellow-400 flex items-center justify-center font-bold">
                <History className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-ink uppercase tracking-wider">History</h3>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {isLoadingMeetings ? (
                <div className="text-center py-6 text-muted text-xs">Loading...</div>
              ) : pastMeetings.length === 0 ? (
                <div className="h-24 flex items-center justify-center">
                  <p className="text-[10px] text-muted/45 font-light">No past meetings yet</p>
                </div>
              ) : (
                pastMeetings.map((mtg) => (
                  <div 
                    key={mtg.id}
                    className="flex justify-between items-center p-2.5 rounded-xl bg-white/70 dark:bg-dark-800/20 border border-hairline/20 dark:border-white/5"
                  >
                    <div className="truncate mr-2">
                      <p className="text-xs font-bold text-body-strong truncate">{mtg.title}</p>
                      <p className="text-[9px] text-muted font-mono mt-0.5">{mtg.code}</p>
                    </div>
                    <Badge color="gray">Ended</Badge>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </section>

      {/* ===== FEATURES CAROUSEL ===== */}
      <section 
        className="relative z-10 border-t border-hairline/15 dark:border-white/5 animate-fade-in-up delay-200"
        onMouseEnter={() => setIsCarouselPaused(true)}
        onMouseLeave={() => { setIsCarouselPaused(false); setIsDragging(false); }}
      >
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-canvas dark:from-dark-950 to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-canvas dark:from-dark-950 to-transparent z-10 pointer-events-none" />
        
        <div
          ref={carouselRef}
          className="overflow-x-hidden no-scrollbar cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div 
            className={`flex gap-4 py-5 px-8 w-max ${
              isCarouselPaused ? '' : 'animate-carousel-scroll'
            }`}
          >
            {[...FEATURES, ...FEATURES].map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={`${feature.title}-${idx}`}
                  className="group relative w-60 flex-shrink-0 bg-surface-soft/40 dark:bg-dark-800/30 border border-hairline/30 dark:border-white/5 rounded-2xl p-4 hover:border-primary/25 dark:hover:border-primary/25 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5"
                >
                  <div className="flex items-start space-x-3">
                    <div className={`w-8 h-8 rounded-lg ${feature.iconBg} flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-[11px] font-bold text-ink leading-tight">{feature.title}</h3>
                      <p className="text-[10px] text-muted font-light leading-relaxed mt-1 line-clamp-2">{feature.description}</p>
                    </div>
                  </div>
                  <div className={`absolute bottom-0 left-4 right-4 h-[2px] bg-gradient-to-r ${feature.accent} rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 px-8 py-3 flex items-center justify-between text-[10px] text-muted/60 tracking-widest uppercase font-light border-t border-hairline/15 dark:border-white/5">
        <div>Chatsie • Immersive Screenings</div>
        <div>{new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</div>
      </footer>

      {/* ===== SCHEDULE MEETING MODAL ===== */}
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
