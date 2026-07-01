import React, { useState, useRef } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { FileText, Code, Copy, Check, Eye, PenTool } from 'lucide-react';

export const WorkspacePanel: React.FC = () => {
  const {
    markdownContent,
    codeContent,
    setMarkdownContent,
    setCodeContent,
    setWorkspaceOpen
  } = useMeetingStore();

  const [activeTab, setActiveTab] = useState<'markdown' | 'code'>('markdown');
  const [markdownView, setMarkdownView] = useState<'edit' | 'preview'>('edit');
  const [copied, setCopied] = useState(false);

  const timeoutRef = useRef<any>(null);

  // Debounced signaling update sender
  const sendUpdateDebounced = (type: 'markdown' | 'code', content: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      signalingClient.sendWorkspaceUpdate(type, content);
    }, 300);
  };

  const handleMarkdownChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMarkdownContent(val);
    sendUpdateDebounced('markdown', val);
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setCodeContent(val);
    sendUpdateDebounced('code', val);
  };

  const handleCopy = () => {
    const textToCopy = activeTab === 'markdown' ? markdownContent : codeContent;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple Markdown parsing for preview
  const renderMarkdown = (md: string) => {
    if (!md.trim()) return <p className="text-muted italic text-xs">Empty document. Type something to collaborate!</p>;
    
    return md.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-xl font-bold border-b border-white/10 pb-1 mt-3 mb-1 text-ink">{line.substring(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-lg font-bold mt-3 mb-1 text-ink">{line.substring(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-sm font-bold mt-2 mb-1 text-ink">{line.substring(4)}</h3>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={idx} className="ml-4 list-disc text-xs text-muted">{line.substring(2)}</li>;
      }
      if (line.startsWith('> ')) {
        return <blockquote key={idx} className="border-l-4 border-emerald-500/50 pl-3 italic my-2 text-xs text-muted bg-white/5 py-1 rounded-r">{line.substring(2)}</blockquote>;
      }
      return <p key={idx} className="text-xs min-h-[1rem] leading-relaxed text-muted">{line}</p>;
    });
  };

  return (
    <div className="w-[380px] bg-[#1a1b1e] border-l border-white/[0.08] flex flex-col h-full text-white animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#202124]">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">Collaborative App Workspace</h2>
          <p className="text-[10px] text-white/50">Edit simultaneously with participants</p>
        </div>
        <button
          onClick={() => setWorkspaceOpen(false)}
          className="text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-[#27282b] border-b border-white/[0.06]">
        <button
          onClick={() => setActiveTab('markdown')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
            activeTab === 'markdown' ? 'text-emerald-400 border-emerald-400 bg-white/[0.03]' : 'text-white/60 border-transparent hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          Markdown Notes
        </button>
        <button
          onClick={() => setActiveTab('code')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer border-b-2 ${
            activeTab === 'code' ? 'text-emerald-400 border-emerald-400 bg-white/[0.03]' : 'text-white/60 border-transparent hover:text-white'
          }`}
        >
          <Code className="w-3.5 h-3.5" />
          Code Sandbox
        </button>
      </div>

      {/* Secondary Controls Bar */}
      <div className="px-4 py-2 bg-[#202124] border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex gap-2">
          {activeTab === 'markdown' && (
            <div className="flex bg-white/5 rounded-md p-0.5">
              <button
                onClick={() => setMarkdownView('edit')}
                className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  markdownView === 'edit' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/60 hover:text-white'
                }`}
              >
                <PenTool className="w-3 h-3" />
                Write
              </button>
              <button
                onClick={() => setMarkdownView('preview')}
                className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  markdownView === 'preview' ? 'bg-emerald-500/20 text-emerald-400' : 'text-white/60 hover:text-white'
                }`}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded transition-all cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Workspace Editor Area */}
      <div className="flex-1 p-4 overflow-y-auto bg-[#1a1b1e]">
        {activeTab === 'markdown' ? (
          markdownView === 'edit' ? (
            <textarea
              id="workspace-markdown-textarea"
              value={markdownContent}
              onChange={handleMarkdownChange}
              placeholder="# Project Notes&#10;&#10;- Collaborate live with your team here...&#10;- Markdown support is enabled."
              className="w-full h-full bg-transparent text-sm text-ink placeholder-white/30 border-none outline-none resize-none font-sans leading-relaxed focus:ring-0"
            />
          ) : (
            <div className="space-y-2 select-text text-left font-sans">
              {renderMarkdown(markdownContent)}
            </div>
          )
        ) : (
          <div className="w-full h-full relative">
            <textarea
              id="workspace-code-textarea"
              value={codeContent}
              onChange={handleCodeChange}
              placeholder="// JavaScript Sandbox&#10;function test() {&#10;  console.log('Collaborating live!');&#10;}"
              className="w-full h-full bg-transparent text-xs text-emerald-400 placeholder-white/30 border-none outline-none resize-none font-mono leading-relaxed focus:ring-0"
              style={{ tabSize: 2 }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkspacePanel;
