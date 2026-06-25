import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { FileText, Sparkles, X, Copy, Check, Key } from 'lucide-react';
import { Button, Input, Card } from '../ui';

export const TranscriptionPanel: React.FC = () => {
  const { transcripts } = useMeetingStore();
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyPrompt, setShowKeyPrompt] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom as new transcript segments arrive
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Export current transcript to Markdown file
  const handleDownload = () => {
    if (transcripts.length === 0) return;

    let mdText = `# Meeting Transcript\nGenerated on: ${new Date().toLocaleString()}\n\n`;
    
    transcripts.forEach((t) => {
      const time = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      mdText += `**[${time}] ${t.username}:** ${t.text}\n\n`;
    });

    const blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `transcript-${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Summarize meeting transcript using Gemini API
  const handleSummarize = async () => {
    const key = localStorage.getItem('gemini_api_key') || '';
    if (!key) {
      setShowKeyPrompt(true);
      return;
    }

    if (transcripts.length === 0) {
      setErrorMsg('No conversation transcription available to summarize yet.');
      return;
    }

    setIsSummarizing(true);
    setErrorMsg(null);

    // Format transcripts into text block
    const conversation = transcripts
      .map(t => `${t.username}: ${t.text}`)
      .join('\n');

    const prompt = `You are an expert AI meeting coordinator. Analyze the following meeting conversation transcript and generate a structured summary including:
1. # MEETING MINUTES & OVERVIEW (Brief summary of the meeting topics)
2. ## KEY DECISIONS MADE (Bullet points of finalized items/agreements)
3. ## ACTION ITEMS & ASSIGNEES (Task lists indicating who needs to do what)

Meeting Transcript:
${conversation}

Please format your response in clean Markdown. Be precise, professional, and clear.`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ]
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini API Error: Status ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!generatedText) {
        throw new Error('Invalid response structure received from Gemini API.');
      }

      setSummary(generatedText);
    } catch (e: any) {
      console.error('Gemini summarization failed:', e);
      setErrorMsg(e?.message || 'Failed to generate AI summary. Please check your internet connection or API key validity.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSaveApiKey = () => {
    if (!apiKeyInput.trim()) return;
    localStorage.setItem('gemini_api_key', apiKeyInput.trim());
    setApiKeyInput('');
    setShowKeyPrompt(false);
    setErrorMsg(null);
    setTimeout(() => handleSummarize(), 200);
  };

  const handleCopySummary = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Simple parser to format Markdown strings on the fly
  const renderFormattedMarkdown = (markdownText: string) => {
    return markdownText.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return (
          <h4 key={idx} className="text-xs font-black text-[#8ab4f8] mt-4 mb-2 uppercase tracking-wider border-b border-white/[0.06] pb-1">
            {line.slice(2)}
          </h4>
        );
      }
      if (line.startsWith('## ')) {
        return (
          <h5 key={idx} className="text-[11px] font-bold text-[#e8eaed] mt-3 mb-1.5 uppercase tracking-wide">
            {line.slice(3)}
          </h5>
        );
      }
      if (line.startsWith('### ')) {
        return (
          <h6 key={idx} className="text-[10px] font-bold text-[#9aa0a6] mt-2.5 mb-1">
            {line.slice(4)}
          </h6>
        );
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return (
          <li key={idx} className="ml-3 list-disc text-[11px] text-[#e8eaed]/80 my-1 pl-0.5 leading-relaxed">
            {line.slice(2)}
          </li>
        );
      }

      let content: React.ReactNode = line;
      if (line.includes('**')) {
        const parts = line.split('**');
        content = parts.map((part, index) => 
          index % 2 === 1 ? <strong key={index} className="font-bold text-[#e8eaed]">{part}</strong> : part
        );
      }

      if (!line.trim()) return <div key={idx} className="h-2" />;

      return (
        <p key={idx} className="text-[11px] text-[#e8eaed]/80 leading-relaxed my-1">
          {content}
        </p>
      );
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#202124] text-[#e8eaed] z-20 relative">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
        <h3 className="font-bold text-xs text-[#e8eaed] uppercase tracking-wider">
          Live Transcription
        </h3>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleDownload}
            disabled={transcripts.length === 0}
            title="Download Transcript"
            className="p-1.5 hover:bg-white/5 text-[#9aa0a6] hover:text-[#e8eaed] rounded-md disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={handleSummarize}
            disabled={transcripts.length === 0 || isSummarizing}
            title="Summarize with Gemini AI"
            className="p-1.5 hover:bg-white/5 text-[#8ab4f8] hover:text-[#aecbfa] rounded-md disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Message banner */}
      {errorMsg && (
        <div className="px-4 py-2.5 bg-red-950/20 border-b border-red-900/30 text-[10px] font-bold text-red-400">
          {errorMsg}
        </div>
      )}

      {/* Transcription List */}
      <div className="flex-grow overflow-y-auto p-4 space-y-3.5 bg-[#202124]">
        {transcripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-xs text-[#9aa0a6] font-semibold p-4">
            <div className="w-8 h-8 rounded-full border border-white/[0.06] flex items-center justify-center mb-2.5 bg-white/2">
              <span className="animate-pulse w-2 h-2 rounded-full bg-[#8ab4f8]" />
            </div>
            Listening for speech... Make sure captions are enabled and microphone is unmuted.
          </div>
        ) : (
          transcripts.map((t, idx) => {
            const isFinal = t.isFinal;
            return (
              <div key={t.id || idx} className="space-y-0.5 animate-in fade-in duration-200">
                <div className="flex items-center space-x-1.5 text-[9px] font-bold text-[#9aa0a6]">
                  <span className="truncate max-w-[120px] text-[#8ab4f8]">{t.username}</span>
                  <span>•</span>
                  <span>
                    {new Date(t.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </span>
                  {!isFinal && (
                    <span className="text-[8px] bg-white/10 text-[#9aa0a6] px-1 rounded uppercase tracking-wider scale-90">
                      Speaking
                    </span>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${isFinal ? 'text-[#e8eaed] font-medium' : 'text-[#9aa0a6] italic'}`}>
                  {t.text}
                </p>
              </div>
            );
          })
        )}
        <div ref={scrollRef} />
      </div>

      {/* API KEY PROMPT OVERLAY */}
      {showKeyPrompt && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm z-30 p-6 flex flex-col justify-center">
          <Card className="p-5 space-y-4 border border-white/[0.06] bg-[#292b2f] text-[#e8eaed]">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-2 text-[#8ab4f8]">
                <Key className="w-5 h-5" />
                <h4 className="font-bold text-sm text-[#e8eaed]">Gemini API Key</h4>
              </div>
              <button 
                onClick={() => setShowKeyPrompt(false)}
                className="text-[#9aa0a6] hover:text-[#e8eaed] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-[#9aa0a6] leading-relaxed">
              To summarize meetings, please provide a Gemini API Key. Your key is stored strictly on your device locally (`localStorage`) and is never sent to our servers.
            </p>
            <div className="space-y-3">
              <Input
                type="password"
                placeholder="Enter Gemini API Key..."
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="bg-[#3c4043] text-[#e8eaed] border-white/[0.06] placeholder-[#9aa0a6] focus:ring-[#8ab4f8] text-xs"
              />
              <div className="flex space-x-2">
                <Button 
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput.trim()}
                  className="flex-grow text-xs h-9 bg-[#8ab4f8] text-[#202124] hover:bg-[#aecbfa] font-bold cursor-pointer disabled:cursor-not-allowed"
                >
                  Save & Summarize
                </Button>
                <Button 
                  variant="tertiary-text" 
                  onClick={() => setShowKeyPrompt(false)}
                  className="text-xs h-9 border border-white/[0.06] text-[#e8eaed] hover:bg-white/5 bg-transparent cursor-pointer"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SUMMARY MODAL OVERLAY */}
      {summary && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-40 p-4 flex flex-col justify-end">
          <div className="w-full h-[90%] bg-[#202124] border border-white/[0.06] rounded-2xl flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-white/[0.06] bg-[#292b2f] flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center space-x-2 text-[#8ab4f8]">
                <Sparkles className="w-4 h-4" />
                <span className="font-black text-xs uppercase tracking-wider text-[#e8eaed]">AI Meeting Summary</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  onClick={handleCopySummary}
                  className="p-1.5 hover:bg-white/5 text-[#9aa0a6] hover:text-[#e8eaed] rounded-md transition-colors cursor-pointer"
                  title="Copy to Clipboard"
                >
                  {isCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setSummary(null)}
                  className="p-1.5 hover:bg-white/5 text-[#9aa0a6] hover:text-[#e8eaed] rounded-md transition-colors cursor-pointer"
                  title="Close Summary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-grow overflow-y-auto p-5 space-y-2 bg-[#202124]">
              {renderFormattedMarkdown(summary)}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/[0.06] bg-[#292b2f] rounded-b-2xl flex justify-end">
              <Button onClick={() => setSummary(null)} className="h-9 text-xs bg-[#8ab4f8] text-[#202124] hover:bg-[#aecbfa] font-bold cursor-pointer">
                Close Summary
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Loader during AI generation */}
      {isSummarizing && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-30 flex flex-col items-center justify-center text-center p-6 animate-in fade-in duration-200">
          <svg className="animate-spin h-7 w-7 text-[#8ab4f8] mb-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs font-bold text-[#e8eaed] tracking-wide animate-pulse">
            Gemini is analyzing meeting transcripts...
          </span>
          <span className="text-[10px] text-[#9aa0a6] mt-1.5 max-w-[200px]">
            Compiling meeting minutes, key decisions, and action items.
          </span>
        </div>
      )}
    </div>
  );
};
export default TranscriptionPanel;
