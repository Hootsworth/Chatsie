export function generateGoogleCalendarUrl(
  title: string,
  scheduledStart: string | null,
  durationMinutes: number | null,
  roomCode: string
): string {
  const baseUrl = 'https://calendar.google.com/calendar/render?action=TEMPLATE';
  const meetingUrl = `${window.location.origin}${import.meta.env.BASE_URL || '/'}room/${roomCode}`;
  
  let datesParam = '';
  const startDate = scheduledStart ? new Date(scheduledStart) : new Date();
  const duration = durationMinutes || 30;
  const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
  
  const toIsoWithoutSpecialChars = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  datesParam = `&dates=${toIsoWithoutSpecialChars(startDate)}/${toIsoWithoutSpecialChars(endDate)}`;
  
  const text = encodeURIComponent(title || 'Chatsie Sync');
  const details = encodeURIComponent(`Join Chatsie Meeting:\n${meetingUrl}`);
  const location = encodeURIComponent(meetingUrl);
  
  return `${baseUrl}&text=${text}${datesParam}&details=${details}&location=${location}`;
}

export function downloadIcsFile(
  title: string,
  scheduledStart: string | null,
  durationMinutes: number | null,
  roomCode: string
): void {
  const meetingUrl = `${window.location.origin}${import.meta.env.BASE_URL || '/'}room/${roomCode}`;
  const startDate = scheduledStart ? new Date(scheduledStart) : new Date();
  const duration = durationMinutes || 30;
  const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
  
  const formatIcsDate = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };
  
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chatsie//Meeting Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${roomCode}-${Date.now()}@chatsie`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(startDate)}`,
    `DTEND:${formatIcsDate(endDate)}`,
    `SUMMARY:${title || 'Chatsie Sync'}`,
    `DESCRIPTION:Join Chatsie Meeting at: ${meetingUrl}`,
    `LOCATION:${meetingUrl}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  
  const icsString = icsLines.join('\r\n');
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'chatsie-sync'}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
