import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { FileText, Sparkles, AlertTriangle } from 'lucide-react';

export const TranscriptionPanel: React.FC = () => {
  const { transcripts } = useMeetingStore();
  const listRef = useRef<HTMLDivElement | null>(null);

  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const summaryType = 'brief';
  const [showSettings, setShowSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Settings local storage keys
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    setApiKey(localStorage.getItem('gemini_api_key') || '');
  }, []);

  // Scroll to bottom of transcripts
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [transcripts]);

  const handleDownload = () => {
    const textContent = transcripts
      .map((t) => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.username}: ${t.text}`)
      .join('\n');

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `transcript-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSummarize = async () => {
    if (transcripts.length === 0) return;
    setErrorMsg(null);
    setIsSummarizing(true);

    try {
      const activeKey = apiKey || localStorage.getItem('gemini_api_key') || '';
      if (!activeKey) {
        setErrorMsg('Gemini API key is required. Click the Settings icon in the header to set your API Key.');
        setShowSettings(true);
        setIsSummarizing(false);
        return;
      }

      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';
      
      const transcriptLines = transcripts
        .map((t) => `${t.username}: ${t.text}`)
        .join('\n');

      const prompt = `You are a professional meeting summarizer. Review the following meeting transcript lines and generate a ${summaryType} summary. Outline key topics, decisions, and action items if applicable. Use clean bullet points.\n\nMeeting Transcripts:\n${transcriptLines}`;

      const response = await fetch(`${backendUrl}/api/ai/summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          apiKey: activeKey,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate summary.');
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to generate transcription summary.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('gemini_api_key', apiKey.trim());
    setShowSettings(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#1e2022] text-[#e3e2e6] relative select-none">
      
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#131417] flex-shrink-0">
        <h3 className="font-bold text-xs text-white uppercase tracking-wider">
          Live Transcription
        </h3>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={handleDownload}
            disabled={transcripts.length === 0}
            title="Download Transcript"
            className="p-1.5 text-white/60 hover:text-white hover:bg-white/5 rounded-full disabled:opacity-30 cursor-pointer transition-all"
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            onClick={handleSummarize}
            disabled={transcripts.length === 0 || isSummarizing}
            title="Summarize with Gemini AI"
            className="p-1.5 text-[#a8c7fa] hover:text-white hover:bg-[#a8c7fa]/10 rounded-full disabled:opacity-30 cursor-pointer transition-all"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Message banner */}
      {errorMsg && (
        <div className="px-4 py-2 bg-[#f2b8b5]/15 border-b border-[#f2b8b5]/20 text-[10px] font-bold text-[#f2b8b5] flex items-center gap-1.5 text-left flex-shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Transcription List */}
      <div ref={listRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-[#1e2022] select-text">
        {transcripts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-xs text-white/30 p-4 space-y-2">
            <div className="w-10 h-10 rounded-full border border-white/[0.08] flex items-center justify-center bg-[#131417]">
              <span className="animate-pulse w-2.5 h-2.5 rounded-full bg-[#a8c7fa]" />
            </div>
            <p className="font-bold text-white/90">Awaiting audio signals...</p>
            <p className="text-[10px] opacity-75">Transcriptions will display here once speech is captured.</p>
          </div>
        ) : (
          transcripts.map((t, idx) => (
            <div key={idx} className="space-y-1 text-xs text-left">
              <div className="flex items-center gap-1.5 text-white/50 text-[10px]">
                <span className="font-bold">{t.username}</span>
                <span>·</span>
                <span>{new Date(t.timestamp).toLocaleTimeString()}</span>
                {!t.isFinal && (
                  <span className="text-[8px] bg-white/5 text-[#a8c7fa] px-1.5 py-0.5 rounded-full select-none font-bold">
                    Drafting
                  </span>
                )}
              </div>
              <p className={`leading-relaxed ${t.isFinal ? 'text-white/80' : 'text-white/40 italic'}`}>
                {t.text}
              </p>
            </div>
          ))
        )}
      </div>

      {/* MODAL overlay: Settings API Key */}
      {showSettings && (
        <div className="absolute inset-0 bg-[#0a0b0d]/80 z-30 p-6 flex flex-col justify-center text-left">
          <div className="p-5 space-y-4 border border-white/[0.08] bg-[#131417] text-white rounded-[24px] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">Gemini API Key Required</h4>
              <p className="text-[10px] text-white/50 leading-relaxed">
                Gemini AI powers transcripts summarization. Set your key below.
              </p>
            </div>
            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-[#1e2022] text-white border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-[#a8c7fa]"
                required
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3.5 py-2 bg-[#303134] text-white/80 hover:text-white rounded-full text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4.5 py-2 bg-[#a8c7fa] text-[#062e6f] hover:bg-[#c4eed0] font-bold rounded-full text-xs transition-all cursor-pointer"
                >
                  Save API Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL overlay: Summary details */}
      {summary && (
        <div className="absolute inset-0 bg-[#0a0b0d]/75 z-40 p-4 flex flex-col justify-end text-left select-text">
          <div className="w-full h-[90%] bg-[#1e2022] border border-white/[0.08] rounded-[28px] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300 overflow-hidden">
            
            {/* Header */}
            <div className="px-5 py-4 border-b border-white/[0.08] bg-[#131417] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#a8c7fa]" />
                <h4 className="text-xs font-bold text-white">Gemini Summary Result</h4>
              </div>
              <button
                onClick={() => handleDownload()}
                className="px-3 py-1 bg-[#303134] hover:bg-[#3c4043] text-white rounded-full text-[10px] font-bold transition-colors cursor-pointer"
              >
                Save Summary
              </button>
            </div>

            {/* Content body */}
            <div className="flex-grow overflow-y-auto p-5 space-y-2 bg-[#1e2022]">
              <p className="text-[11px] leading-relaxed text-white/80 whitespace-pre-wrap">
                {summary}
              </p>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/[0.08] bg-[#131417] flex justify-end flex-shrink-0">
              <button 
                onClick={() => setSummary(null)} 
                className="h-9 px-4.5 text-xs bg-[#a8c7fa] text-[#062e6f] hover:bg-[#c4eed0] font-bold rounded-full cursor-pointer flex items-center justify-center transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default TranscriptionPanel;
