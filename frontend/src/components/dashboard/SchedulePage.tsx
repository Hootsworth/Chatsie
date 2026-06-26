import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Button, Input } from '../ui';
import { generateGoogleCalendarUrl, downloadIcsFile } from '../../utils/calendar';
import { 
  ArrowLeft, 
  Calendar as CalendarIcon, 
  Clock as ClockIcon, 
  ChevronLeft, 
  ChevronRight, 
  Copy, 
  Check, 
  Lock, 
  Mail, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  ExternalLink 
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

export const SchedulePage: React.FC = () => {
  const { getToken } = useAuth();
  const navigate = useNavigate();

  // ----------------------------------------------------
  // FORM & PICKER STATES
  // ----------------------------------------------------
  const [meetingTitle, setMeetingTitle] = useState('');
  
  // Date State (Defaults to today)
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());

  // Time States
  const [selectedHour, setSelectedHour] = useState<number>(10);
  const [selectedMinute, setSelectedMinute] = useState<number>(30);
  const [selectedAmpm, setSelectedAmpm] = useState<'AM' | 'PM'>('AM');
  const [clockActiveTab, setClockActiveTab] = useState<'hours' | 'minutes'>('hours');
  const [isDragging, setIsDragging] = useState(false);

  // Duration State
  const [durationPreset, setDurationPreset] = useState<'15' | '30' | '45' | '60' | 'custom'>('30');
  const [customDuration, setCustomDuration] = useState('30');

  // Other Meeting Options
  const [meetingPasscode, setMeetingPasscode] = useState('');
  const [isWaitingRoomEnabled, setIsWaitingRoomEnabled] = useState(false);
  const [blockEarlyJoin, setBlockEarlyJoin] = useState(false);
  const [inviteOnly, setInviteOnly] = useState(false);

  // Guests State
  const [guestEmailInput, setGuestEmailInput] = useState('');
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Request States
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  const [createMeetingError, setCreateMeetingError] = useState<string | null>(null);
  const [scheduledMeetingResult, setScheduledMeetingResult] = useState<ScheduledMeeting | null>(null);
  const [isResultCopied, setIsResultCopied] = useState(false);

  // ----------------------------------------------------
  // CALENDAR CALCULATION HELPERS
  // ----------------------------------------------------
  const monthsList = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  const getCalendarDays = () => {
    const daysInCurrentMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const firstDayIndex = new Date(calendarYear, calendarMonth, 1).getDay();
    const daysInPrevMonth = new Date(calendarYear, calendarMonth, 0).getDate();
    
    const cells = [];
    
    // Prev Month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      cells.push({
        day: daysInPrevMonth - i,
        month: calendarMonth === 0 ? 11 : calendarMonth - 1,
        year: calendarMonth === 0 ? calendarYear - 1 : calendarYear,
        isCurrentMonth: false,
      });
    }
    
    // Current Month days
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      cells.push({
        day: i,
        month: calendarMonth,
        year: calendarYear,
        isCurrentMonth: true,
      });
    }
    
    // Next Month padding (fill up to 42 cells for standard 6 rows)
    const totalCells = cells.length;
    const padCells = 42 - totalCells;
    for (let i = 1; i <= padCells; i++) {
      cells.push({
        day: i,
        month: calendarMonth === 11 ? 0 : calendarMonth + 1,
        year: calendarMonth === 11 ? calendarYear + 1 : calendarYear,
        isCurrentMonth: false,
      });
    }
    
    return cells;
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear(prev => prev - 1);
    } else {
      setCalendarMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear(prev => prev + 1);
    } else {
      setCalendarMonth(prev => prev + 1);
    }
  };

  const isPastDate = (year: number, month: number, day: number) => {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const cellDate = new Date(year, month, day);
    return cellDate < todayMidnight;
  };

  const isToday = (year: number, month: number, day: number) => {
    return (
      today.getDate() === day &&
      today.getMonth() === month &&
      today.getFullYear() === year
    );
  };

  const isSelectedDate = (year: number, month: number, day: number) => {
    return (
      selectedDate &&
      selectedDate.getDate() === day &&
      selectedDate.getMonth() === month &&
      selectedDate.getFullYear() === year
    );
  };

  // ----------------------------------------------------
  // CLOCK PICKER SVG HELPERS
  // ----------------------------------------------------
  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const getHourCoords = (h: number) => {
    const angle = (h % 12) * 30 * Math.PI / 180;
    return {
      x: 100 + 64 * Math.sin(angle),
      y: 100 - 64 * Math.cos(angle)
    };
  };

  const getMinuteCoords = (m: number) => {
    const angle = m * 6 * Math.PI / 180;
    return {
      x: 100 + 64 * Math.sin(angle),
      y: 100 - 64 * Math.cos(angle)
    };
  };

  const incrementMinutes = () => {
    setSelectedMinute(prev => (prev + 1) % 60);
  };

  const decrementMinutes = () => {
    setSelectedMinute(prev => (prev - 1 + 60) % 60);
  };

  const handleClockInteraction = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    
    // Map px, py to SVG viewBox coordinates (0 to 200)
    const svgX = (px / rect.width) * 200;
    const svgY = (py / rect.height) * 200;
    
    const dx = svgX - 100;
    const dy = 100 - svgY;
    
    let angleRad = Math.atan2(dx, dy);
    let angleDeg = (angleRad * 180) / Math.PI;
    if (angleDeg < 0) angleDeg += 360;
    
    if (clockActiveTab === 'hours') {
      let hour = Math.round(angleDeg / 30);
      if (hour === 0) hour = 12;
      setSelectedHour(hour);
    } else {
      let minute = Math.round(angleDeg / 6);
      if (minute === 60) minute = 0;
      setSelectedMinute(minute);
    }
  };

  // ----------------------------------------------------
  // EMAIL / GUESTS CHIPS HELPERS
  // ----------------------------------------------------
  const handleAddEmail = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setEmailError(null);
    const email = guestEmailInput.trim().toLowerCase();
    
    if (!email) return;
    
    // Simple email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    
    if (invitedEmails.includes(email)) {
      setEmailError('Email already added.');
      return;
    }
    
    setInvitedEmails([...invitedEmails, email]);
    setGuestEmailInput('');
  };

  const handleRemoveEmail = (indexToRemove: number) => {
    setInvitedEmails(invitedEmails.filter((_, i) => i !== indexToRemove));
  };

  const handleKeyDownEmail = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddEmail();
    } else if (e.key === ',' || e.key === ' ') {
      e.preventDefault();
      handleAddEmail();
    }
  };

  // ----------------------------------------------------
  // SUBMISSION LOGIC
  // ----------------------------------------------------
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateMeetingError(null);
    setIsCreatingMeeting(true);

    if (!meetingTitle.trim()) {
      setCreateMeetingError('Meeting title is required.');
      setIsCreatingMeeting(false);
      return;
    }

    try {
      // Calculate ISO start time
      const dateCopy = new Date(selectedDate);
      let hour = selectedHour;
      if (selectedAmpm === 'PM' && hour !== 12) {
        hour += 12;
      } else if (selectedAmpm === 'AM' && hour === 12) {
        hour = 0;
      }
      dateCopy.setHours(hour, selectedMinute, 0, 0);

      // Validate date is in the future
      if (dateCopy < new Date()) {
        setCreateMeetingError('Cannot schedule a meeting in the past.');
        setIsCreatingMeeting(false);
        return;
      }

      const scheduledStartISO = dateCopy.toISOString();
      const finalDuration = durationPreset === 'custom' ? parseInt(customDuration, 10) : parseInt(durationPreset, 10);

      if (isNaN(finalDuration) || finalDuration <= 0) {
        setCreateMeetingError('Please enter a valid positive duration.');
        setIsCreatingMeeting(false);
        return;
      }

      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) throw new Error("API URL not configured.");
      
      const token = await getToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${apiUrl}/api/meetings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: meetingTitle,
          passcode: meetingPasscode || null,
          isWaitingRoomEnabled,
          scheduledStart: scheduledStartISO,
          duration: finalDuration,
          blockEarlyJoin,
          inviteOnly,
          invitedEmails
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to schedule meeting');
      }

      const data = await response.json();
      setScheduledMeetingResult(data.meeting);
    } catch (err: any) {
      setCreateMeetingError(err.message || 'An error occurred while scheduling.');
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  const formatMeetingTime = (dateObj: Date, h: number, m: number, ampm: 'AM' | 'PM') => {
    const month = monthsList[dateObj.getMonth()].substring(0, 3);
    const day = dateObj.getDate();
    const year = dateObj.getFullYear();
    const padMin = String(m).padStart(2, '0');
    return `${month} ${day}, ${year} at ${h}:${padMin} ${ampm}`;
  };

  return (
    <div className="min-h-screen bg-canvas text-ink dark:bg-inverse-canvas dark:text-inverse-ink transition-colors duration-200 py-10 px-4 md:px-8">
      <div className="max-w-5xl mx-auto space-y-8 animate-fade-in-up">
        
        {/* HEADER BAR */}
        <div className="flex items-center gap-4 border-b border-hairline pb-6">
          <button 
            onClick={() => navigate('/')}
            className="p-2 rounded-full border border-hairline hover:bg-surface-soft active:scale-95 transition-all text-ink/70 hover:text-ink cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-[32px] font-black tracking-tight leading-none font-sans">
              {scheduledMeetingResult ? 'Meeting Booked!' : 'Schedule a Sync'}
            </h1>
            <p className="text-body-sm text-ink/60 mt-1">
              {scheduledMeetingResult ? 'Invitation details and calendar links generated successfully.' : 'Arrange a future audio/video room, security controls, and calendar invites.'}
            </p>
          </div>
        </div>

        {scheduledMeetingResult ? (
          // ----------------------------------------------------
          // SUCCESS STATE VIEW
          // ----------------------------------------------------
          <div className="bg-block-mint/15 border border-block-mint/40 rounded-2xl p-6 md:p-10 space-y-8 max-w-2xl mx-auto shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-block-mint rounded-full text-ink flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <span className="text-eyebrow text-ink/60 text-xs">Successfully Created</span>
                <h2 className="text-card-title tracking-tight font-black">{scheduledMeetingResult.title}</h2>
                <p className="text-body-default font-medium text-ink/80">
                  {formatMeetingTime(selectedDate, selectedHour, selectedMinute, selectedAmpm)}
                </p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-semibold bg-primary/5 text-primary border border-primary/10 mt-1.5">
                  <ClockIcon className="w-3.5 h-3.5" />
                  {durationPreset === 'custom' ? customDuration : durationPreset} Minutes
                </div>
              </div>
            </div>

            {/* ROOM LINK BOX */}
            <div className="space-y-2 bg-canvas border border-hairline rounded-xl p-4">
              <label className="text-caption font-bold text-ink/60 block">Meeting Room Link</label>
              <div className="flex items-center gap-3">
                <span className="font-mono text-body-sm select-all truncate flex-1">
                  {window.location.origin}/room/{scheduledMeetingResult.code}
                </span>
                <Button 
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/room/${scheduledMeetingResult.code}`);
                    setIsResultCopied(true);
                    setTimeout(() => setIsResultCopied(false), 2000);
                  }}
                  className="py-1 px-3 text-xs shrink-0 rounded-md"
                >
                  {isResultCopied ? (
                    <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Copied</span>
                  ) : (
                    <span className="flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</span>
                  )}
                </Button>
              </div>
            </div>

            {/* CALENDAR UTILITIES */}
            <div className="space-y-3 pt-2">
              <h4 className="text-caption font-bold text-ink/70">Add Sync to Calendar</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  className="w-full flex items-center justify-center gap-2 border border-hairline py-3 bg-canvas"
                >
                  <ExternalLink className="w-4 h-4 text-muted" />
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
                  className="w-full flex items-center justify-center gap-2 border border-hairline py-3 bg-canvas"
                >
                  <CalendarIcon className="w-4 h-4 text-muted" />
                  Outlook / Apple Calendar
                </Button>
              </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-hairline justify-end">
              <Button 
                variant="secondary" 
                onClick={() => navigate('/')}
                className="py-3 px-6"
              >
                Go to Dashboard
              </Button>
              <Button 
                variant="primary" 
                onClick={() => navigate(`/room/${scheduledMeetingResult.code}`)}
                className="py-3 px-6"
              >
                Join Room Now
              </Button>
            </div>
          </div>
        ) : (
          // ----------------------------------------------------
          // SCHEDULING FORM / EDITING VIEW
          // ----------------------------------------------------
          <form onSubmit={handleScheduleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT COLUMN: INTERACTIVE DATE & TIME SELECTORS (7/12 cols) */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* CARD CONTAINER */}
              <div className="bg-canvas border border-hairline rounded-2xl overflow-hidden shadow-sm flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-hairline">
                
                {/* CALENDAR SECTION */}
                <div className="flex-1 p-5 space-y-4">
                  <div className="flex items-center justify-between pb-2">
                    <h3 className="text-body-sm font-bold text-ink flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-ink/70" />
                      1. Select Date
                    </h3>
                    {/* Calendar Month Switchers */}
                    <div className="flex items-center gap-1">
                      <button 
                        type="button" 
                        onClick={handlePrevMonth}
                        className="p-1 rounded hover:bg-surface-soft text-ink/70 active:scale-90 transition-transform cursor-pointer"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-body-xs font-mono font-bold tracking-tight">
                        {monthsList[calendarMonth].substring(0, 3)} {calendarYear}
                      </span>
                      <button 
                        type="button" 
                        onClick={handleNextMonth}
                        className="p-1 rounded hover:bg-surface-soft text-ink/70 active:scale-90 transition-transform cursor-pointer"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7 gap-1 text-center text-xs">
                    {/* Header: Sun - Sat */}
                    {daysOfWeek.map((day) => (
                      <div key={day} className="py-1 text-caption text-ink/40 font-bold">
                        {day}
                      </div>
                    ))}
                    
                    {/* Cells */}
                    {getCalendarDays().map((cell, idx) => {
                      const isDisabled = isPastDate(cell.year, cell.month, cell.day);
                      const isSel = isSelectedDate(cell.year, cell.month, cell.day);
                      const isTdy = isToday(cell.year, cell.month, cell.day);
                      
                      return (
                        <button
                          key={idx}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setSelectedDate(new Date(cell.year, cell.month, cell.day))}
                          className={`py-2 rounded-md font-mono relative transition-all cursor-pointer text-center flex items-center justify-center aspect-square ${
                            !cell.isCurrentMonth ? 'opacity-30' : ''
                          } ${
                            isDisabled 
                              ? 'text-ink/20 line-through cursor-not-allowed pointer-events-none' 
                              : 'text-ink/80 hover:bg-surface-soft'
                          } ${
                            isTdy ? 'ring-1 ring-primary/45 font-bold' : ''
                          } ${
                            isSel ? 'bg-block-lilac text-ink font-bold scale-105 shadow-sm' : ''
                          }`}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Selected Date Indicator */}
                  <div className="pt-2 text-center text-body-xs text-ink/60 font-mono">
                    Selected: {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                {/* CLOCK SECTION */}
                <div className="flex-1 p-5 flex flex-col items-center justify-between space-y-4">
                  <div className="w-full flex items-center justify-between pb-2 border-b border-hairline/50">
                    <h3 className="text-body-sm font-bold text-ink flex items-center gap-2">
                      <ClockIcon className="w-4 h-4 text-ink/70" />
                      2. Select Time
                    </h3>
                    
                    {/* Switch Hour/Minute tabs */}
                    <div className="flex bg-surface-soft border border-hairline/65 rounded-md p-0.5 text-xs font-mono">
                      <button
                        type="button"
                        onClick={() => setClockActiveTab('hours')}
                        className={`px-2 py-0.5 rounded-sm transition-colors ${
                          clockActiveTab === 'hours' ? 'bg-canvas text-ink font-bold shadow-sm' : 'text-ink/60'
                        }`}
                      >
                        Hrs
                      </button>
                      <button
                        type="button"
                        onClick={() => setClockActiveTab('minutes')}
                        className={`px-2 py-0.5 rounded-sm transition-colors ${
                          clockActiveTab === 'minutes' ? 'bg-canvas text-ink font-bold shadow-sm' : 'text-ink/60'
                        }`}
                      >
                        Mins
                      </button>
                    </div>
                  </div>

                  {/* Digital Clock readout & Tuning */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-surface-soft border border-hairline rounded-lg px-4 py-2 font-mono text-xl font-bold select-none shadow-inner">
                      <span 
                        onClick={() => setClockActiveTab('hours')}
                        className={`cursor-pointer px-1.5 py-0.5 rounded transition-colors ${
                          clockActiveTab === 'hours' ? 'bg-block-lilac text-ink' : 'hover:bg-hairline-soft'
                        }`}
                      >
                        {String(selectedHour).padStart(2, '0')}
                      </span>
                      <span className="mx-1 animate-pulse text-ink/40">:</span>
                      <span 
                        onClick={() => setClockActiveTab('minutes')}
                        className={`cursor-pointer px-1.5 py-0.5 rounded transition-colors ${
                          clockActiveTab === 'minutes' ? 'bg-block-lime text-ink' : 'hover:bg-hairline-soft'
                        }`}
                      >
                        {String(selectedMinute).padStart(2, '0')}
                      </span>
                    </div>

                    {/* Plus/minus buttons */}
                    <div className="flex flex-col gap-1">
                      <button 
                        type="button" 
                        onClick={incrementMinutes} 
                        className="p-1 rounded bg-surface-soft border border-hairline hover:bg-hairline active:scale-90 transition-transform cursor-pointer"
                        title="Add 1 minute"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        type="button" 
                        onClick={decrementMinutes} 
                        className="p-1 rounded bg-surface-soft border border-hairline hover:bg-hairline active:scale-90 transition-transform cursor-pointer"
                        title="Subtract 1 minute"
                      >
                        <span className="text-[14px] font-black leading-none block h-3.5 w-3.5 text-center">-</span>
                      </button>
                    </div>
                  </div>

                  {/* Interactive Clock Dial */}
                  <div className="relative w-full flex justify-center py-2">
                    <svg
                      viewBox="0 0 200 200"
                      className="w-full max-w-[190px] aspect-square select-none cursor-pointer"
                      onMouseDown={(e) => {
                        setIsDragging(true);
                        handleClockInteraction(e);
                      }}
                      onMouseMove={(e) => {
                        if (isDragging) handleClockInteraction(e);
                      }}
                      onMouseUp={() => setIsDragging(false)}
                      onMouseLeave={() => setIsDragging(false)}
                    >
                      <circle cx="100" cy="100" r="92" className="fill-surface-soft/40 stroke-hairline-soft" strokeWidth="2.5" />
                      <circle cx="100" cy="100" r="82" className="fill-canvas stroke-hairline" strokeWidth="1" />
                      
                      {/* Active value highlight */}
                      {clockActiveTab === 'hours' ? (
                        <circle
                          cx={getHourCoords(selectedHour).x}
                          cy={getHourCoords(selectedHour).y}
                          r="14"
                          className="fill-block-lilac"
                        />
                      ) : (
                        // Highlight closest discrete 5-min cell
                        <circle
                          cx={getMinuteCoords(selectedMinute).x}
                          cy={getMinuteCoords(selectedMinute).y}
                          r="14"
                          className="fill-block-lime"
                        />
                      )}

                      {/* Direction Pointer Hand */}
                      <line
                        x1="100"
                        y1="100"
                        x2={clockActiveTab === 'hours' ? getHourCoords(selectedHour).x : getMinuteCoords(selectedMinute).x}
                        y2={clockActiveTab === 'hours' ? getHourCoords(selectedHour).y : getMinuteCoords(selectedMinute).y}
                        className="stroke-ink"
                        strokeWidth="2"
                      />
                      <circle cx="100" cy="100" r="4.5" className="fill-ink" />

                      {/* Render Marks */}
                      {clockActiveTab === 'hours' ? (
                        hours.map((h) => {
                          const coords = getHourCoords(h);
                          const isSel = selectedHour === h;
                          return (
                            <text
                              key={h}
                              x={coords.x}
                              y={coords.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className={`text-[12px] font-sans font-bold transition-all ${
                                isSel ? 'fill-ink scale-110' : 'fill-ink/50'
                              }`}
                            >
                              {h}
                            </text>
                          );
                        })
                      ) : (
                        minutes.map((m) => {
                          const coords = getMinuteCoords(m);
                          const isSel = Math.round(selectedMinute / 5) * 5 === m;
                          return (
                            <text
                              key={m}
                              x={coords.x}
                              y={coords.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              className={`text-[11px] font-mono transition-all ${
                                isSel ? 'fill-ink font-bold scale-110' : 'fill-ink/50'
                              }`}
                            >
                              {String(m).padStart(2, '0')}
                            </text>
                          );
                        })
                      )}
                    </svg>
                  </div>

                  {/* AM/PM Pill Selector */}
                  <div className="flex bg-surface-soft border border-hairline/80 rounded-full p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setSelectedAmpm('AM')}
                      className={`px-4 py-1 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                        selectedAmpm === 'AM' ? 'bg-primary text-on-primary' : 'text-ink/50 hover:text-ink'
                      }`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedAmpm('PM')}
                      className={`px-4 py-1 rounded-full text-xs font-mono font-bold transition-all cursor-pointer ${
                        selectedAmpm === 'PM' ? 'bg-primary text-on-primary' : 'text-ink/50 hover:text-ink'
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>

              </div>

              {/* QUICK INFO ALERTS */}
              <div className="bg-block-cream/20 border border-block-cream/60 rounded-xl p-4 text-body-xs font-mono text-ink/75 leading-relaxed space-y-1">
                <span className="font-bold text-ink">Sync Summary:</span>
                <p>
                  Meeting scheduled for <strong className="text-ink">{formatMeetingTime(selectedDate, selectedHour, selectedMinute, selectedAmpm)}</strong>. Local browser time will be calculated accordingly in invitations.
                </p>
              </div>

            </div>

            {/* RIGHT COLUMN: MEETING DETAILS FORM (5/12 cols) */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* CORE OPTIONS CARD */}
              <div className="bg-canvas border border-hairline rounded-2xl p-6 space-y-6 shadow-sm">
                
                {/* Title */}
                <div className="space-y-1.5">
                  <Input 
                    label="Meeting Title" 
                    placeholder="e.g. Weekly Standup / Design Review"
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    required
                  />
                </div>

                {/* Duration Pills */}
                <div className="space-y-2">
                  <label className="block text-body font-semibold text-ink">Duration (minutes)</label>
                  <div className="grid grid-cols-5 gap-2">
                    {['15', '30', '45', '60'].map((pres) => (
                      <button
                        key={pres}
                        type="button"
                        onClick={() => {
                          setDurationPreset(pres as any);
                          setCustomDuration(pres);
                        }}
                        className={`py-2 px-1 text-center rounded-md font-mono text-body-xs transition-all cursor-pointer border ${
                          durationPreset === pres && durationPreset !== 'custom'
                            ? 'bg-primary text-on-primary border-primary shadow-sm font-bold'
                            : 'bg-canvas border-hairline hover:bg-surface-soft text-ink/70'
                        }`}
                      >
                        {pres}m
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDurationPreset('custom')}
                      className={`py-2 px-1 text-center rounded-md font-mono text-body-xs transition-all cursor-pointer border ${
                        durationPreset === 'custom'
                          ? 'bg-primary text-on-primary border-primary shadow-sm font-bold'
                          : 'bg-canvas border-hairline hover:bg-surface-soft text-ink/70'
                      }`}
                    >
                      Other
                    </button>
                  </div>
                  
                  {/* Custom Duration input field */}
                  {durationPreset === 'custom' && (
                    <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <Input
                        type="number"
                        placeholder="Minutes"
                        min="1"
                        value={customDuration}
                        onChange={(e) => setCustomDuration(e.target.value)}
                        className="font-mono text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* Passcode (Optional) */}
                <div className="space-y-1.5">
                  <Input
                    label="Meeting Passcode (Optional)"
                    placeholder="e.g. secure-code-123"
                    value={meetingPasscode}
                    onChange={(e) => setMeetingPasscode(e.target.value)}
                  />
                  <p className="text-[11px] text-ink/50 leading-normal">
                    Guests must enter this code to enter the call workspace.
                  </p>
                </div>

                {/* Guest Invites tags */}
                <div className="space-y-2">
                  <label className="block text-body font-semibold text-ink flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-ink/60" />
                    Invited Guest Emails (Optional)
                  </label>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type email and press enter"
                      value={guestEmailInput}
                      onChange={(e) => setGuestEmailInput(e.target.value)}
                      onKeyDown={handleKeyDownEmail}
                      className="w-full px-[14px] py-[12px] text-body rounded-md bg-canvas border border-hairline text-ink placeholder-ink/50 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all duration-200"
                    />
                    <Button 
                      type="button" 
                      onClick={() => handleAddEmail()}
                      variant="secondary"
                      className="px-4"
                    >
                      Add
                    </Button>
                  </div>
                  {emailError && <p className="text-xs text-red-500 font-medium">{emailError}</p>}

                  {/* List of Email Chips */}
                  {invitedEmails.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 max-h-36 overflow-y-auto pr-1">
                      {invitedEmails.map((email, idx) => (
                        <div 
                          key={idx} 
                          className="flex items-center gap-1.5 bg-surface-soft border border-hairline rounded-full pl-3 pr-2 py-1 text-xs text-ink animate-in zoom-in-95 duration-150"
                        >
                          <span className="font-mono truncate max-w-[180px]">{email}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveEmail(idx)}
                            className="p-0.5 rounded-full hover:bg-hairline text-ink/50 hover:text-ink cursor-pointer transition-colors active:scale-90"
                            title="Remove invitation"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* SECURITY & PERMISSIONS CARD */}
              <div className="bg-canvas border border-hairline rounded-2xl p-6 space-y-4 shadow-sm">
                <h4 className="text-eyebrow text-ink/50 text-xs flex items-center gap-1.5 pb-2 border-b border-hairline">
                  <Lock className="w-3.5 h-3.5" />
                  Security Settings
                </h4>
                
                {/* 1. Waiting Room Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5 max-w-[80%]">
                    <label className="text-body-sm font-bold text-ink">Enable Waiting Room</label>
                    <p className="text-[11px] text-ink/50 leading-normal">
                      Host must manually approve participants before they can join.
                    </p>
                  </div>
                  {/* Switch */}
                  <button
                    type="button"
                    onClick={() => setIsWaitingRoomEnabled(!isWaitingRoomEnabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isWaitingRoomEnabled ? 'bg-primary' : 'bg-surface-soft border-hairline'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        isWaitingRoomEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 2. Block Early Join Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5 max-w-[80%]">
                    <label className="text-body-sm font-bold text-ink">Prevent Early Join</label>
                    <p className="text-[11px] text-ink/50 leading-normal">
                      Route users to waiting room if they click join before scheduled start.
                    </p>
                  </div>
                  {/* Switch */}
                  <button
                    type="button"
                    onClick={() => setBlockEarlyJoin(!blockEarlyJoin)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      blockEarlyJoin ? 'bg-primary' : 'bg-surface-soft border-hairline'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        blockEarlyJoin ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 3. Invite Only Toggle */}
                <div className="flex items-center justify-between py-1">
                  <div className="space-y-0.5 max-w-[80%]">
                    <label className="text-body-sm font-bold text-ink">Strict Invite Only</label>
                    <p className="text-[11px] text-ink/50 leading-normal">
                      Only Clerk accounts matching the invited email list above are allowed.
                    </p>
                  </div>
                  {/* Switch */}
                  <button
                    type="button"
                    onClick={() => setInviteOnly(!inviteOnly)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      inviteOnly ? 'bg-primary' : 'bg-surface-soft border-hairline'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        inviteOnly ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

              </div>

              {/* ERROR NOTIFICATION */}
              {createMeetingError && (
                <div className="p-4 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 rounded-xl text-body-sm border border-red-200 dark:border-red-900/40">
                  {createMeetingError}
                </div>
              )}

              {/* ACTION FOOTER BAR */}
              <div className="flex gap-4 justify-end">
                <Button 
                  variant="secondary" 
                  type="button" 
                  onClick={() => navigate('/')}
                  className="py-3 px-6"
                >
                  Cancel
                </Button>
                <Button 
                  variant="primary" 
                  type="submit" 
                  isLoading={isCreatingMeeting}
                  className="py-3 px-8"
                >
                  Create Meeting
                </Button>
              </div>

            </div>

          </form>
        )}

      </div>
    </div>
  );
};

export default SchedulePage;
