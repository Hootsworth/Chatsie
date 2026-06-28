import React from 'react';
import { Copy, Mail, Send } from 'lucide-react';
import { Button } from '../ui';
import type { ChatMessage, Participant, Transcript } from '../../stores/meetingStore';

interface FollowUpEmailModalProps {
  meetingTitle: string;
  meetingCode: string;
  participants: Participant[];
  transcripts: Transcript[];
  chatMessages: ChatMessage[];
}

const summarizeLines = (items: string[], fallback: string) => {
  const clean = items.map(item => item.trim()).filter(Boolean).slice(-8);
  return clean.length > 0 ? clean.map(item => `- ${item}`).join('\n') : `- ${fallback}`;
};

export const FollowUpEmailModal: React.FC<FollowUpEmailModalProps> = ({
  meetingTitle,
  meetingCode,
  participants,
  transcripts,
  chatMessages
}) => {
  const [recipients, setRecipients] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const participantNames = ['You', ...participants.map(p => p.username)].filter(Boolean);
  const finalTranscripts = transcripts.filter(t => t.isFinal).map(t => `${t.username}: ${t.text}`);
  const usefulChats = chatMessages.map(m => `${m.username}: ${m.text}`);

  const body = [
    `Hi,`,
    ``,
    `Here is the follow-up from "${meetingTitle}".`,
    ``,
    `Meeting code: ${meetingCode}`,
    `Participants: ${participantNames.join(', ')}`,
    ``,
    `Discussion highlights:`,
    summarizeLines(finalTranscripts, 'No finalized transcript lines were captured.'),
    ``,
    `Chat notes:`,
    summarizeLines(usefulChats, 'No chat notes were posted.'),
    ``,
    `Suggested next steps:`,
    `- Confirm owners for open decisions.`,
    `- Share the recording or transcript with anyone who missed the meeting.`,
    `- Schedule a follow-up if unresolved items remain.`,
    ``,
    `Thanks,`
  ].join('\n');

  const subject = `Follow-up: ${meetingTitle}`;
  const mailto = `mailto:${encodeURIComponent(recipients)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted uppercase tracking-wider">Recipients</label>
        <input
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="teammate@example.com, team@example.com"
          className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      <div className="bg-surface-card border border-hairline rounded-lg p-3 max-h-72 overflow-y-auto">
        <pre className="whitespace-pre-wrap text-xs leading-relaxed text-ink font-sans">{body}</pre>
      </div>

      <div className="flex justify-end gap-2">
        <Button onClick={handleCopy} variant="secondary" className="gap-2">
          <Copy className="w-4 h-4" />
          {copied ? 'Copied' : 'Copy Draft'}
        </Button>
        <a href={mailto}>
          <Button className="gap-2">
            {recipients.trim() ? <Send className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
            Open Email
          </Button>
        </a>
      </div>
    </div>
  );
};

export default FollowUpEmailModal;
