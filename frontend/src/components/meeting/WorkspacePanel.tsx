import React, { useState, useRef, useEffect } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { 
  FileText, Code, Copy, Check, Eye, PenTool, Layers, 
  ArrowLeft, Bot, Send, Brain, Key, Settings, 
  AlertCircle, RefreshCw, Plus, Trash2, ArrowRight, Play, Music, Palette
} from 'lucide-react';

interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface KanbanTask {
  id: string;
  text: string;
  column: 'todo' | 'progress' | 'done';
}

export const WorkspacePanel: React.FC = () => {
  const {
    markdownContent,
    codeContent,
    setMarkdownContent,
    setCodeContent,
    setWorkspaceOpen,
    transcripts,
    chatMessages
  } = useMeetingStore();

  // Navigation: 'hub' | 'markdown' | 'code' | 'copilot' | 'kanban'
  const [activeView, setActiveView] = useState<'hub' | 'markdown' | 'code' | 'copilot' | 'kanban'>('hub');
  
  // Markdown View State
  const [markdownView, setMarkdownView] = useState<'edit' | 'preview'>('edit');
  const [copied, setCopied] = useState(false);

  // Plugins installation state
  const [isKanbanInstalled, setIsKanbanInstalled] = useState(false);
  const [isInstallingKanban, setIsInstallingKanban] = useState(false);
  const [installProgress, setInstallProgress] = useState(0);
  const [requestedPlugins, setRequestedPlugins] = useState<Record<string, boolean>>({});

  // Kanban Board local state
  const [kanbanTasks, setKanbanTasks] = useState<KanbanTask[]>([
    { id: '1', text: 'Set up spatial audio renderer', column: 'done' },
    { id: '2', text: 'Integrate collaborative plugins hub', column: 'progress' },
    { id: '3', text: 'Draft release notes for v0.5.0', column: 'todo' }
  ]);
  const [newKanbanText, setNewKanbanText] = useState('');

  // AI Copilot state
  const [copilotMessages, setCopilotMessages] = useState<CopilotMessage[]>([
    {
      role: 'assistant',
      content: "Hello! I am your Chatsie Copilot. Ask me to summarize the call, compile action items, or answer questions based on the live transcripts."
    }
  ]);
  const [copilotQuery, setCopilotQuery] = useState('');
  const [isCopilotLoading, setIsCopilotLoading] = useState(false);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  // AI Copilot Settings
  const [showCopilotSettings, setShowCopilotSettings] = useState(false);
  const [copilotProvider, setCopilotProvider] = useState<'ollama' | 'openai' | 'claude'>('ollama');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [copilotModel, setCopilotModel] = useState('llama3');
  const [useLiveContext, setUseLiveContext] = useState(true);

  const copilotMessagesEndRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<any>(null);

  // Load Copilot Settings on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem('chatsie_copilot_provider');
    const savedOpenaiKey = localStorage.getItem('chatsie_openai_key');
    const savedClaudeKey = localStorage.getItem('chatsie_claude_key');
    const savedModel = localStorage.getItem('chatsie_copilot_model');

    if (savedProvider) setCopilotProvider(savedProvider as any);
    if (savedOpenaiKey) setOpenaiApiKey(savedOpenaiKey);
    if (savedClaudeKey) setClaudeApiKey(savedClaudeKey);
    
    if (savedModel) {
      setCopilotModel(savedModel);
    } else {
      if (savedProvider === 'openai') setCopilotModel('gpt-4o-mini');
      else if (savedProvider === 'claude') setCopilotModel('claude-3-5-sonnet-20240620');
      else setCopilotModel('llama3');
    }
  }, []);

  // Scroll to bottom of copilot chat logs
  useEffect(() => {
    if (activeView === 'copilot') {
      copilotMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [copilotMessages, isCopilotLoading, activeView]);

  // Debounced workspace updates
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
    const textToCopy = activeView === 'markdown' ? markdownContent : codeContent;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simulate plugin installation from marketplace
  const handleInstallKanban = () => {
    if (isKanbanInstalled || isInstallingKanban) return;
    setIsInstallingKanban(true);
    setInstallProgress(10);
    
    const interval = setInterval(() => {
      setInstallProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsInstallingKanban(false);
            setIsKanbanInstalled(true);
          }, 300);
          return 100;
        }
        return prev + 15;
      });
    }, 150);
  };

  const handleRequestPlugin = (pluginId: string) => {
    setRequestedPlugins(prev => ({ ...prev, [pluginId]: true }));
  };

  // Kanban interactions
  const handleAddKanbanTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKanbanText.trim()) return;
    const newTask: KanbanTask = {
      id: Date.now().toString(),
      text: newKanbanText.trim(),
      column: 'todo'
    };
    setKanbanTasks(prev => [...prev, newTask]);
    setNewKanbanText('');
  };

  const moveKanbanTask = (id: string, dir: 'left' | 'right') => {
    setKanbanTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      let nextCol: 'todo' | 'progress' | 'done' = t.column;
      if (t.column === 'todo' && dir === 'right') nextCol = 'progress';
      else if (t.column === 'progress') {
        nextCol = dir === 'right' ? 'done' : 'todo';
      } else if (t.column === 'done' && dir === 'left') nextCol = 'progress';
      return { ...t, column: nextCol };
    }));
  };

  const deleteKanbanTask = (id: string) => {
    setKanbanTasks(prev => prev.filter(t => t.id !== id));
  };

  // AI Copilot interactions
  const handleCopilotSend = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || copilotQuery).trim();
    if (!promptToSend || isCopilotLoading) return;

    if (!customPrompt) setCopilotQuery('');
    setCopilotError(null);

    const newMessages = [...copilotMessages, { role: 'user', content: promptToSend } as CopilotMessage];
    setCopilotMessages(newMessages);
    setIsCopilotLoading(true);

    try {
      let systemPrompt = "You are the Chatsie AI Copilot, a helpful real-time meeting companion inside the Chatsie video call application.";
      
      if (useLiveContext) {
        const finalTranscripts = transcripts.filter(t => t.isFinal).map(t => `${t.username}: ${t.text}`);
        const usefulChats = chatMessages.map(m => `${m.username}: ${m.text}`);

        systemPrompt += `\n\nHere is the current meeting transcripts history:\n${
          finalTranscripts.length > 0 ? finalTranscripts.join('\n') : '(No transcript lines captured yet)'
        }`;

        systemPrompt += `\n\nHere are the chat logs posted during this meeting:\n${
          usefulChats.length > 0 ? usefulChats.join('\n') : '(No chat messages posted yet)'
        }`;

        systemPrompt += `\n\nPlease answer the user's queries using the above context if applicable. Keep responses concise, well-structured, and helpful for active meeting participants. Use markdown.`;
      }

      let responseText = '';

      if (copilotProvider === 'ollama') {
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: copilotModel,
            messages: [
              { role: 'system', content: systemPrompt },
              ...newMessages.slice(-5)
            ],
            stream: false
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to query local Ollama at http://localhost:11434. Ensure Ollama is running and has model "${copilotModel}" pulled.`);
        }

        const data = await response.json();
        responseText = data.message?.content || 'Empty response received from Ollama.';
      } else {
        const activeKey = copilotProvider === 'openai' ? openaiApiKey : claudeApiKey;
        const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';

        const response = await fetch(`${backendUrl}/api/copilot/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: copilotProvider,
            apiKey: activeKey,
            systemPrompt,
            messages: newMessages.slice(-5).map(m => ({
              role: m.role,
              content: m.content
            }))
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Server proxy returned error status: ${response.status}`);
        }

        const data = await response.json();
        if (copilotProvider === 'openai') {
          responseText = data.choices?.[0]?.message?.content || 'Empty response from OpenAI.';
        } else {
          responseText = data.content?.[0]?.text || 'Empty response from Claude.';
        }
      }

      setCopilotMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
    } catch (err: any) {
      console.error('Copilot query failed:', err);
      setCopilotError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsCopilotLoading(false);
    }
  };

  const handleCopilotShortcut = (shortcutType: 'summary' | 'actions' | 'decisions') => {
    let prompt = '';
    if (shortcutType === 'summary') {
      prompt = 'Please summarize the meeting so far. Provide a concise bulleted breakdown of topics discussed.';
    } else if (shortcutType === 'actions') {
      prompt = 'Review the transcripts and list all action items, tasks, and assigned owners mentioned.';
    } else {
      prompt = 'What are the key open decisions or consensus reached during the call?';
    }
    handleCopilotSend(prompt);
  };

  const handleProviderChange = (p: 'ollama' | 'openai' | 'claude') => {
    setCopilotProvider(p);
    localStorage.setItem('chatsie_copilot_provider', p);
    let defaultModel = 'llama3';
    if (p === 'openai') defaultModel = 'gpt-4o-mini';
    if (p === 'claude') defaultModel = 'claude-3-5-sonnet-20240620';
    setCopilotModel(defaultModel);
    localStorage.setItem('chatsie_copilot_model', defaultModel);
  };

  const handleKeyChange = (type: 'openai' | 'claude', val: string) => {
    if (type === 'openai') {
      setOpenaiApiKey(val);
      localStorage.setItem('chatsie_openai_key', val);
    } else {
      setClaudeApiKey(val);
      localStorage.setItem('chatsie_claude_key', val);
    }
  };

  // Simple Markdown parsing for preview
  const renderMarkdown = (md: string) => {
    if (!md.trim()) return <p className="text-white/40 italic text-xs">Empty document. Type something to collaborate!</p>;
    
    return md.split('\n').map((line, idx) => {
      if (line.startsWith('# ')) {
        return <h1 key={idx} className="text-lg font-bold border-b border-white/10 pb-1 mt-3 mb-1 text-white">{line.substring(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={idx} className="text-base font-bold mt-3 mb-1 text-white">{line.substring(3)}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} className="text-sm font-bold mt-2 mb-1 text-white">{line.substring(4)}</h3>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={idx} className="ml-4 list-disc text-xs text-white/75">{line.substring(2)}</li>;
      }
      if (line.startsWith('> ')) {
        return <blockquote key={idx} className="border-l-4 border-emerald-500/50 pl-3 italic my-2 text-xs text-white/70 bg-white/5 py-1 rounded-r">{line.substring(2)}</blockquote>;
      }
      return <p key={idx} className="text-xs min-h-[1rem] leading-relaxed text-white/75">{line}</p>;
    });
  };

  return (
    <div className="w-[385px] flex-shrink-0 flex h-[calc(100%-32px)] my-4 mr-4 bg-[#1e2022] border border-white/10 rounded-[28px] shadow-lg overflow-hidden text-white animate-in slide-in-from-right duration-200">
      
      {/* LEFT COMPACT WORKSPACE DOCK - M3 NAVIGATION RAIL (64px) */}
      <div className="w-[64px] bg-[#131417] border-r border-white/[0.06] flex flex-col items-center py-5 justify-between flex-shrink-0">
        <div className="flex flex-col items-center gap-5 w-full">
          {/* Marketplace / Hub Icon */}
          <button
            onClick={() => setActiveView('hub')}
            className="w-full flex flex-col items-center gap-1 cursor-pointer group outline-none"
            title="Plugins Hub"
          >
            <div className={`w-12 h-8 rounded-full flex items-center justify-center transition-all ${
              activeView === 'hub' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}>
              <Layers className="w-4 h-4" />
            </div>
            <span className={`text-[9px] font-bold tracking-wide transition-all ${
              activeView === 'hub' ? 'text-[#a8c7fa]' : 'text-white/40 group-hover:text-white/60'
            }`}>
              Hub
            </span>
          </button>
          
          <div className="w-8 h-px bg-white/10" />

          {/* Collaborative Notes */}
          <button
            onClick={() => setActiveView('markdown')}
            className="w-full flex flex-col items-center gap-1 cursor-pointer group outline-none"
            title="Collaborative Notes"
          >
            <div className={`w-12 h-8 rounded-full flex items-center justify-center transition-all ${
              activeView === 'markdown' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}>
              <FileText className="w-4 h-4" />
            </div>
            <span className={`text-[9px] font-bold tracking-wide transition-all ${
              activeView === 'markdown' ? 'text-[#a8c7fa]' : 'text-white/40 group-hover:text-white/60'
            }`}>
              Notes
            </span>
          </button>

          {/* JS Code Sandbox */}
          <button
            onClick={() => setActiveView('code')}
            className="w-full flex flex-col items-center gap-1 cursor-pointer group outline-none"
            title="Code Sandbox"
          >
            <div className={`w-12 h-8 rounded-full flex items-center justify-center transition-all ${
              activeView === 'code' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}>
              <Code className="w-4 h-4" />
            </div>
            <span className={`text-[9px] font-bold tracking-wide transition-all ${
              activeView === 'code' ? 'text-[#a8c7fa]' : 'text-white/40 group-hover:text-white/60'
            }`}>
              Sandbox
            </span>
          </button>

          {/* AI Copilot */}
          <button
            onClick={() => setActiveView('copilot')}
            className="w-full flex flex-col items-center gap-1 cursor-pointer group outline-none"
            title="AI Copilot"
          >
            <div className={`w-12 h-8 rounded-full flex items-center justify-center transition-all ${
              activeView === 'copilot' ? 'bg-[#a8c7fa] text-[#062e6f]' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}>
              <Brain className="w-4 h-4" />
            </div>
            <span className={`text-[9px] font-bold tracking-wide transition-all ${
              activeView === 'copilot' ? 'text-[#a8c7fa]' : 'text-white/40 group-hover:text-white/60'
            }`}>
              Copilot
            </span>
          </button>

          {/* Kanban Board */}
          <button
            onClick={() => isKanbanInstalled && setActiveView('kanban')}
            disabled={!isKanbanInstalled}
            className="w-full flex flex-col items-center gap-1 group outline-none disabled:opacity-25 disabled:cursor-not-allowed"
            title={isKanbanInstalled ? "Kanban Board" : "Kanban (Install from Hub)"}
          >
            <div className={`w-12 h-8 rounded-full flex items-center justify-center transition-all ${
              !isKanbanInstalled 
                ? 'text-white/20' 
                : activeView === 'kanban' 
                  ? 'bg-[#a8c7fa] text-[#062e6f]' 
                  : 'text-white/60 hover:bg-white/5 hover:text-white cursor-pointer'
            }`}>
              <Layers className="w-4 h-4 rotate-90" />
            </div>
            <span className={`text-[9px] font-bold tracking-wide transition-all ${
              !isKanbanInstalled 
                ? 'text-white/10' 
                : activeView === 'kanban' 
                  ? 'text-[#a8c7fa]' 
                  : 'text-white/40 group-hover:text-white/60 cursor-pointer'
            }`}>
              Kanban
            </span>
          </button>
        </div>
      </div>

      {/* RIGHT MAIN PANEL CONTENT (320px) */}
      <div className="flex-grow flex flex-col min-w-0 h-full">
        
        {/* HEADER */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#202124] flex-shrink-0">
          <div>
            <h2 className="text-xs font-bold text-white tracking-wide">
              {activeView === 'hub' && 'Plugins & Workspace'}
              {activeView === 'markdown' && 'Collaborative Notes'}
              {activeView === 'code' && 'Code Sandbox'}
              {activeView === 'copilot' && 'AI Copilot'}
              {activeView === 'kanban' && 'Kanban Board'}
            </h2>
            <p className="text-[10px] text-white/50">
              {activeView === 'hub' && 'Select or install workspace tools'}
              {activeView === 'markdown' && 'Shared document editing'}
              {activeView === 'code' && 'JavaScript Sandbox editor'}
              {activeView === 'copilot' && 'Context-aware AI meeting assistant'}
              {activeView === 'kanban' && 'Active project board'}
            </p>
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

        {/* 1. MAIN HUB VIEW */}
        {activeView === 'hub' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#1a1b1e]">
            
            {/* Installed Plugins section */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Active Workspace Tools</h3>
              
              {/* Markdown editor */}
              <div className="p-3.5 bg-white/5 border border-white/[0.04] rounded-xl flex items-start gap-3 hover:bg-white/[0.07] transition-all">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 flex-shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-xs font-bold text-white">Collaborative Notes</h4>
                  <p className="text-[10px] text-white/60 leading-normal">Co-write briefs or outlines with live Markdown preview rendering.</p>
                  <div className="pt-1">
                    <button 
                      onClick={() => setActiveView('markdown')}
                      className="text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer"
                    >
                      Launch Tool <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Code Sandbox */}
              <div className="p-3.5 bg-white/5 border border-white/[0.04] rounded-xl flex items-start gap-3 hover:bg-white/[0.07] transition-all">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 flex-shrink-0">
                  <Code className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-xs font-bold text-white">Code Sandbox</h4>
                  <p className="text-[10px] text-white/60 leading-normal">Test code blocks and script ideas simultaneously in real-time.</p>
                  <div className="pt-1">
                    <button 
                      onClick={() => setActiveView('code')}
                      className="text-[10px] font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-0.5 cursor-pointer"
                    >
                      Launch Tool <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* AI Copilot */}
              <div className="p-3.5 bg-white/5 border border-white/[0.04] rounded-xl flex items-start gap-3 hover:bg-white/[0.07] transition-all">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 flex-shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-xs font-bold text-white">AI Meeting Copilot</h4>
                  <p className="text-[10px] text-white/60 leading-normal">Summarize topics, draft follow-ups, and extract decisions from live transcripts.</p>
                  <div className="pt-1">
                    <button 
                      onClick={() => setActiveView('copilot')}
                      className="text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-0.5 cursor-pointer"
                    >
                      Launch Tool <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Kanban (if installed) */}
              {isKanbanInstalled && (
                <div className="p-3.5 bg-white/5 border border-white/[0.04] rounded-xl flex items-start gap-3 hover:bg-white/[0.07] transition-all animate-in fade-in zoom-in-95 duration-200">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 flex-shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-white">Kanban Board</h4>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full">Installed</span>
                    </div>
                    <p className="text-[10px] text-white/60 leading-normal">Organize roadmap columns, add deliverables, and track active project flows.</p>
                    <div className="pt-1">
                      <button 
                        onClick={() => setActiveView('kanban')}
                        className="text-[10px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-0.5 cursor-pointer"
                      >
                        Launch Tool <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Marketplace section */}
            <div className="space-y-3 pt-2">
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider">Explore Plugin Marketplace</h3>
              
              {/* Kanban installation placeholder */}
              {!isKanbanInstalled && (
                <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] border-dashed rounded-xl flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-white/5 text-white/40 flex-shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <h4 className="text-xs font-bold text-white/80">Kanban Board Add-on</h4>
                    <p className="text-[10px] text-white/40 leading-normal">Triage features, assign tasks, and track meeting action items visually.</p>
                    <div className="pt-1.5">
                      {isInstallingKanban ? (
                        <div className="space-y-1 max-w-[120px]">
                          <div className="text-[8px] font-semibold text-amber-400 flex justify-between">
                            <span>Installing...</span>
                            <span>{installProgress}%</span>
                          </div>
                          <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-400 transition-all duration-150" 
                              style={{ width: `${installProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <button 
                          onClick={handleInstallKanban}
                          className="text-[10px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/25 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                        >
                          Install Plugin
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Excalidraw Sketchpad */}
              <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-start gap-3 opacity-70">
                <div className="p-2 rounded-lg bg-white/5 text-white/40 flex-shrink-0">
                  <Palette className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-xs font-bold text-white/80">Excalidraw Canvas</h4>
                  <p className="text-[10px] text-white/45 leading-normal">Shared canvas for architectural diagrams, system maps, and UX wireframes.</p>
                  <div className="pt-1.5">
                    <button 
                      onClick={() => handleRequestPlugin('excalidraw')}
                      disabled={requestedPlugins['excalidraw']}
                      className={`text-[9px] font-bold px-2 py-1 rounded transition-colors cursor-pointer ${
                        requestedPlugins['excalidraw'] 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                      }`}
                    >
                      {requestedPlugins['excalidraw'] ? 'Requested ✓' : 'Request Plugin'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Spotify Room Sync */}
              <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-start gap-3 opacity-70">
                <div className="p-2 rounded-lg bg-white/5 text-white/40 flex-shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-xs font-bold text-white/80">Spotify Sync</h4>
                  <p className="text-[10px] text-white/45 leading-normal">Sync play lists and control background session audio collectively.</p>
                  <div className="pt-1.5">
                    <button 
                      onClick={() => handleRequestPlugin('spotify')}
                      disabled={requestedPlugins['spotify']}
                      className={`text-[9px] font-bold px-2 py-1 rounded transition-colors cursor-pointer ${
                        requestedPlugins['spotify'] 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                      }`}
                    >
                      {requestedPlugins['spotify'] ? 'Requested ✓' : 'Request Plugin'}
                    </button>
                  </div>
                </div>
              </div>

              {/* YouTube Watch Party */}
              <div className="p-3.5 bg-white/[0.02] border border-white/[0.04] rounded-xl flex items-start gap-3 opacity-70">
                <div className="p-2 rounded-lg bg-white/5 text-white/40 flex-shrink-0">
                  <Play className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-xs font-bold text-white/80">YouTube Watch Party</h4>
                  <p className="text-[10px] text-white/45 leading-normal">Embed shared screens for co-watching stream tutorials and captures.</p>
                  <div className="pt-1.5">
                    <button 
                      onClick={() => handleRequestPlugin('youtube')}
                      disabled={requestedPlugins['youtube']}
                      className={`text-[9px] font-bold px-2 py-1 rounded transition-colors cursor-pointer ${
                        requestedPlugins['youtube'] 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                      }`}
                    >
                      {requestedPlugins['youtube'] ? 'Requested ✓' : 'Request Plugin'}
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* 2. MARKDOWN NOTES TOOL */}
        {activeView === 'markdown' && (
          <>
            <div className="px-4 py-2 bg-[#202124] border-b border-white/[0.06] flex items-center justify-between flex-shrink-0">
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
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] font-semibold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded transition-all cursor-pointer border border-white/5"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-[#1a1b1e]">
              {markdownView === 'edit' ? (
                <textarea
                  id="workspace-markdown-textarea"
                  value={markdownContent}
                  onChange={handleMarkdownChange}
                  placeholder="# Project Notes&#10;&#10;- Collaborate live with your team here...&#10;- Markdown support is enabled."
                  className="w-full h-full bg-transparent text-xs text-white/80 placeholder-white/30 border-none outline-none resize-none font-sans leading-relaxed focus:ring-0"
                />
              ) : (
                <div className="space-y-2 select-text text-left font-sans">
                  {renderMarkdown(markdownContent)}
                </div>
              )}
            </div>
          </>
        )}

        {/* 3. CODE SANDBOX TOOL */}
        {activeView === 'code' && (
          <>
            <div className="px-4 py-2 bg-[#202124] border-b border-white/[0.06] flex items-center justify-end flex-shrink-0">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[10px] font-semibold text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1.5 rounded transition-all cursor-pointer border border-white/5"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto bg-[#1a1b1e]">
              <textarea
                id="workspace-code-textarea"
                value={codeContent}
                onChange={handleCodeChange}
                placeholder="// JavaScript Sandbox&#10;function test() {&#10;  console.log('Collaborating live!');&#10;}"
                className="w-full h-full bg-transparent text-xs text-emerald-400 placeholder-white/30 border-none outline-none resize-none font-mono leading-relaxed focus:ring-0"
                style={{ tabSize: 2 }}
              />
            </div>
          </>
        )}

        {/* 4. AI COPILOT TOOL */}
        {activeView === 'copilot' && (
          <div className="flex-grow flex flex-col min-h-0 bg-[#1a1b1e]">
            {/* Settings Sub-Bar */}
            <div className="bg-[#202124] border-b border-white/[0.06] text-xs flex-shrink-0">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-[10px] font-bold text-white/50">
                  LLM Provider: <span className="text-emerald-400 capitalize">{copilotProvider}</span>
                </span>
                <button
                  onClick={() => setShowCopilotSettings(!showCopilotSettings)}
                  className="text-white/60 hover:text-white flex items-center gap-1 text-[10px] cursor-pointer"
                >
                  <Settings className="w-3 h-3" />
                  Configure
                </button>
              </div>

              {/* Dropdown settings */}
              {showCopilotSettings && (
                <div className="p-4 bg-[#27282b] border-t border-white/[0.06] space-y-3.5 text-left animate-in slide-in-from-top-2 duration-150">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-white/60">Provider</label>
                    <select
                      value={copilotProvider}
                      onChange={(e) => handleProviderChange(e.target.value as any)}
                      className="w-full bg-[#1a1b1e] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="ollama">Ollama (Localhost)</option>
                      <option value="openai">OpenAI (Secure Proxy)</option>
                      <option value="claude">Anthropic Claude (Secure Proxy)</option>
                    </select>
                  </div>

                  {copilotProvider === 'ollama' ? (
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-white/60">Ollama Model</label>
                      <input
                        type="text"
                        value={copilotModel}
                        onChange={(e) => {
                          setCopilotModel(e.target.value);
                          localStorage.setItem('chatsie_copilot_model', e.target.value);
                        }}
                        className="w-full bg-[#1a1b1e] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                        placeholder="e.g. llama3, mistral, gemma"
                      />
                      <p className="text-[9px] text-white/40">Ollama must be running locally on your machine on port 11434.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-white/60">API Model</label>
                        <input
                          type="text"
                          value={copilotModel}
                          onChange={(e) => {
                            setCopilotModel(e.target.value);
                            localStorage.setItem('chatsie_copilot_model', e.target.value);
                          }}
                          className="w-full bg-[#1a1b1e] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-white/60">
                          {copilotProvider === 'openai' ? 'OpenAI Secret Key' : 'Claude API Key'}
                        </label>
                        <div className="relative">
                          <Key className="absolute left-2.5 top-2 w-3.5 h-3.5 text-white/40" />
                          <input
                            type="password"
                            value={copilotProvider === 'openai' ? openaiApiKey : claudeApiKey}
                            onChange={(e) => handleKeyChange(copilotProvider as any, e.target.value)}
                            className="w-full bg-[#1a1b1e] border border-white/10 rounded pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none"
                            placeholder="sk-..."
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <label className="text-[10px] font-bold text-white/60 cursor-pointer flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={useLiveContext}
                        onChange={(e) => setUseLiveContext(e.target.checked)}
                        className="rounded border-white/15 bg-white/5 text-emerald-500 focus:ring-0 cursor-pointer"
                      />
                      Inject Meeting Context
                    </label>
                    <button
                      onClick={() => setShowCopilotSettings(false)}
                      className="text-[10px] font-bold bg-white/10 hover:bg-white/15 text-white px-2.5 py-1 rounded"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Shortcuts Bar */}
            <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between gap-1 flex-shrink-0">
              <button
                onClick={() => handleCopilotShortcut('summary')}
                disabled={isCopilotLoading}
                className="flex-1 py-1 bg-white/5 hover:bg-white/10 text-white text-[9px] font-semibold rounded text-center transition-all cursor-pointer border border-white/5"
              >
                Summarize Call
              </button>
              <button
                onClick={() => handleCopilotShortcut('actions')}
                disabled={isCopilotLoading}
                className="flex-1 py-1 bg-white/5 hover:bg-white/10 text-white text-[9px] font-semibold rounded text-center transition-all cursor-pointer border border-white/5"
              >
                Action Items
              </button>
              <button
                onClick={() => handleCopilotShortcut('decisions')}
                disabled={isCopilotLoading}
                className="flex-1 py-1 bg-white/5 hover:bg-white/10 text-white text-[9px] font-semibold rounded text-center transition-all cursor-pointer border border-white/5"
              >
                Consensus
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 select-text text-left text-xs bg-[#1a1b1e]">
              {copilotMessages.map((msg, idx) => {
                const isAssistant = msg.role === 'assistant';
                return (
                  <div 
                    key={idx} 
                    className={`flex gap-2.5 ${isAssistant ? '' : 'justify-end'}`}
                  >
                    {isAssistant && (
                      <div className="w-6 h-6 rounded bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0 border border-indigo-500/20">
                        <Brain className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className={`p-3 rounded-lg leading-relaxed max-w-[85%] ${
                      isAssistant 
                        ? 'bg-white/5 text-white/90 border border-white/[0.04]' 
                        : 'bg-indigo-600 text-white font-medium shadow-md'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                );
              })}

              {isCopilotLoading && (
                <div className="flex gap-2.5">
                  <div className="w-6 h-6 rounded bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0 animate-spin border border-indigo-500/20">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </div>
                  <div className="bg-white/5 text-white/50 p-3 rounded-lg text-left italic border border-white/[0.04]">
                    Copilot is formulating response...
                  </div>
                </div>
              )}

              {copilotError && (
                <div className="p-3 bg-red-500/15 border border-red-500/25 rounded-lg flex gap-2 text-red-400 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <span className="font-bold">Query Error:</span> {copilotError}
                  </div>
                </div>
              )}
              <div ref={copilotMessagesEndRef} />
            </div>

            {/* Send Input Area */}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleCopilotSend(); }}
              className="p-3 bg-[#202124] border-t border-white/[0.08] flex items-center gap-2 flex-shrink-0"
            >
              <input
                type="text"
                value={copilotQuery}
                onChange={(e) => setCopilotQuery(e.target.value)}
                placeholder="Ask Copilot anything..."
                disabled={isCopilotLoading}
                className="flex-1 bg-[#1a1b1e] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!copilotQuery.trim() || isCopilotLoading}
                className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center disabled:opacity-40 transition-all cursor-pointer flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}

        {/* 5. KANBAN BOARD PLUGIN */}
        {activeView === 'kanban' && (
          <div className="flex-grow flex flex-col min-h-0 bg-[#1a1b1e] p-4 space-y-4">
            
            {/* Add task bar */}
            <form onSubmit={handleAddKanbanTask} className="flex gap-2 flex-shrink-0">
              <input
                type="text"
                value={newKanbanText}
                onChange={(e) => setNewKanbanText(e.target.value)}
                placeholder="Add new task to backlog..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                disabled={!newKanbanText.trim()}
                className="px-3 bg-amber-500 hover:bg-amber-600 text-gray-900 rounded-lg flex items-center justify-center font-bold text-xs disabled:opacity-40 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </form>

            {/* Kanban columns */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              
              {/* COLUMN: TODO */}
              <div className="bg-white/5 border border-white/[0.04] rounded-xl p-3.5 space-y-3">
                <div className="flex justify-between items-center border-b border-white/[0.06] pb-1.5">
                  <span className="text-xs font-bold text-white/80">📋 To Do</span>
                  <span className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                    {kanbanTasks.filter(t => t.column === 'todo').length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {kanbanTasks.filter(t => t.column === 'todo').length === 0 ? (
                    <p className="text-[10px] text-white/30 italic py-1 text-center">No tasks in backlog</p>
                  ) : (
                    kanbanTasks.filter(t => t.column === 'todo').map(task => (
                      <div key={task.id} className="p-2.5 bg-white/[0.03] border border-white/[0.04] rounded-lg text-xs space-y-2">
                        <p className="text-white/85 leading-normal">{task.text}</p>
                        <div className="flex justify-between items-center pt-1 border-t border-white/[0.04]">
                          <button 
                            onClick={() => deleteKanbanTask(task.id)}
                            className="text-white/40 hover:text-red-400 p-0.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={() => moveKanbanTask(task.id, 'right')}
                            className="text-amber-400 hover:text-amber-300 flex items-center gap-0.5 text-[10px] font-bold cursor-pointer"
                          >
                            Start <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* COLUMN: IN PROGRESS */}
              <div className="bg-white/5 border border-white/[0.04] rounded-xl p-3.5 space-y-3">
                <div className="flex justify-between items-center border-b border-white/[0.06] pb-1.5">
                  <span className="text-xs font-bold text-white/80">⚡ In Progress</span>
                  <span className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                    {kanbanTasks.filter(t => t.column === 'progress').length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {kanbanTasks.filter(t => t.column === 'progress').length === 0 ? (
                    <p className="text-[10px] text-white/30 italic py-1 text-center">No active tasks</p>
                  ) : (
                    kanbanTasks.filter(t => t.column === 'progress').map(task => (
                      <div key={task.id} className="p-2.5 bg-white/[0.03] border border-white/[0.04] rounded-lg text-xs space-y-2">
                        <p className="text-white/85 leading-normal">{task.text}</p>
                        <div className="flex justify-between items-center pt-1 border-t border-white/[0.04]">
                          <button 
                            onClick={() => moveKanbanTask(task.id, 'left')}
                            className="text-white/55 hover:text-white flex items-center gap-0.5 text-[10px] font-bold cursor-pointer"
                          >
                            <ArrowLeft className="w-3 h-3" /> Back
                          </button>
                          <button 
                            onClick={() => moveKanbanTask(task.id, 'right')}
                            className="text-emerald-400 hover:text-emerald-300 flex items-center gap-0.5 text-[10px] font-bold cursor-pointer"
                          >
                            Complete <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* COLUMN: DONE */}
              <div className="bg-white/5 border border-white/[0.04] rounded-xl p-3.5 space-y-3">
                <div className="flex justify-between items-center border-b border-white/[0.06] pb-1.5">
                  <span className="text-xs font-bold text-white/80">✅ Completed</span>
                  <span className="text-[10px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                    {kanbanTasks.filter(t => t.column === 'done').length}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {kanbanTasks.filter(t => t.column === 'done').length === 0 ? (
                    <p className="text-[10px] text-white/30 italic py-1 text-center">No completed tasks yet</p>
                  ) : (
                    kanbanTasks.filter(t => t.column === 'done').map(task => (
                      <div key={task.id} className="p-2.5 bg-white/[0.03] border border-white/[0.04] rounded-lg text-xs space-y-2 opacity-80">
                        <p className="text-white/85 leading-normal line-through">{task.text}</p>
                        <div className="flex justify-between items-center pt-1 border-t border-white/[0.04]">
                          <button 
                            onClick={() => moveKanbanTask(task.id, 'left')}
                            className="text-white/55 hover:text-white flex items-center gap-0.5 text-[10px] font-bold cursor-pointer"
                          >
                            <ArrowLeft className="w-3 h-3" /> Reopen
                        </button>
                          <button 
                            onClick={() => deleteKanbanTask(task.id)}
                            className="text-white/40 hover:text-red-400 p-0.5 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default WorkspacePanel;
