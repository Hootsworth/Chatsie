import React, { useState, useEffect, useRef } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { Sparkles, Send, Brain, Bot, Key, Settings, AlertCircle, RefreshCw } from 'lucide-react';

interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const AiCopilotPanel: React.FC = () => {
  const {
    transcripts,
    chatMessages,
    setCopilotOpen
  } = useMeetingStore();

  const [messages, setMessages] = useState<CopilotMessage[]>([
    {
      role: 'assistant',
      content: "Hello! I am your Chatsie Copilot. Ask me to summarize the call, compile action items, or answer questions based on the live transcripts."
    }
  ]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [provider, setProvider] = useState<'ollama' | 'openai' | 'claude'>('ollama');
  const [openaiKey, setOpenaiKey] = useState('');
  const [claudeKey, setClaudeKey] = useState('');
  const [modelName, setModelName] = useState('llama3');
  const [useContext, setUseContext] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedProvider = localStorage.getItem('chatsie_copilot_provider');
    const savedOpenaiKey = localStorage.getItem('chatsie_openai_key');
    const savedClaudeKey = localStorage.getItem('chatsie_claude_key');
    const savedModel = localStorage.getItem('chatsie_copilot_model');

    if (savedProvider) setProvider(savedProvider as any);
    if (savedOpenaiKey) setOpenaiKey(savedOpenaiKey);
    if (savedClaudeKey) setClaudeKey(savedClaudeKey);
    
    if (savedModel) {
      setModelName(savedModel);
    } else {
      // Set defaults based on provider
      if (savedProvider === 'openai') setModelName('gpt-4o-mini');
      else if (savedProvider === 'claude') setModelName('claude-3-5-sonnet-20240620');
      else setModelName('llama3');
    }
  }, []);

  // Update default model names when provider changes
  const handleProviderChange = (p: 'ollama' | 'openai' | 'claude') => {
    setProvider(p);
    localStorage.setItem('chatsie_copilot_provider', p);
    let defaultModel = 'llama3';
    if (p === 'openai') defaultModel = 'gpt-4o-mini';
    if (p === 'claude') defaultModel = 'claude-3-5-sonnet-20240620';
    setModelName(defaultModel);
    localStorage.setItem('chatsie_copilot_model', defaultModel);
  };

  const handleKeyChange = (type: 'openai' | 'claude', val: string) => {
    if (type === 'openai') {
      setOpenaiKey(val);
      localStorage.setItem('chatsie_openai_key', val);
    } else {
      setClaudeKey(val);
      localStorage.setItem('chatsie_claude_key', val);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSend = async (customPrompt?: string) => {
    const promptToSend = (customPrompt || query).trim();
    if (!promptToSend || isLoading) return;

    if (!customPrompt) setQuery('');
    setErrorMsg(null);

    const newMessages = [...messages, { role: 'user', content: promptToSend } as CopilotMessage];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // 1. Build system context prompt
      let systemPrompt = "You are the Chatsie AI Copilot, a helpful real-time meeting companion inside the Chatsie video call application.";
      
      if (useContext) {
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

      // 2. Route request to chosen provider
      if (provider === 'ollama') {
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: systemPrompt },
              ...newMessages.slice(-5) // Send last few messages for context
            ],
            stream: false
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to query local Ollama at http://localhost:11434. Ensure Ollama is running and has model "${modelName}" pulled.`);
        }

        const data = await response.json();
        responseText = data.message?.content || 'Empty response received from Ollama.';
      } else {
        // OpenAI or Claude via backend proxy
        const activeKey = provider === 'openai' ? openaiKey : claudeKey;
        const backendUrl = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'http://localhost:5001';

        const response = await fetch(`${backendUrl}/api/copilot/query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider,
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

        if (provider === 'openai') {
          responseText = data.choices?.[0]?.message?.content || 'Empty response from OpenAI.';
        } else {
          // Claude response format
          responseText = data.content?.[0]?.text || 'Empty response from Claude.';
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
    } catch (err: any) {
      console.error('Copilot query failed:', err);
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleShortcut = (shortcutType: 'summary' | 'actions' | 'decisions') => {
    let prompt = '';
    if (shortcutType === 'summary') {
      prompt = 'Please summarize the meeting so far. Provide a concise bulleted breakdown of topics discussed.';
    } else if (shortcutType === 'actions') {
      prompt = 'Review the transcripts and list all action items, tasks, and assigned owners mentioned.';
    } else {
      prompt = 'What are the key open decisions or consensus reached during the call?';
    }
    handleSend(prompt);
  };

  return (
    <div className="w-[380px] bg-[#1a1b1e] border-l border-white/[0.08] flex flex-col h-full text-white animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.08] flex items-center justify-between bg-[#202124]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-wider text-emerald-400">Chatsie AI Copilot</h2>
            <p className="text-[10px] text-white/50">Smart real-time meeting assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-full transition-colors cursor-pointer hover:bg-white/10 ${
              showSettings ? 'text-emerald-400' : 'text-white/60 hover:text-white'
            }`}
            title="Copilot Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCopilotOpen(false)}
            className="text-white/60 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Settings Drawer */}
      {showSettings && (
        <div className="p-4 bg-[#202124] border-b border-white/[0.08] space-y-3.5 text-left">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50">AI Provider</label>
            <div className="grid grid-cols-3 gap-1.5 bg-white/5 rounded-lg p-0.5">
              {(['ollama', 'openai', 'claude'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  className={`py-1 rounded-md text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                    provider === p ? 'bg-emerald-500/20 text-emerald-400 font-extrabold' : 'text-white/60 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-white/50">Model Name</label>
            <input
              value={modelName}
              onChange={(e) => {
                setModelName(e.target.value);
                localStorage.setItem('chatsie_copilot_model', e.target.value);
              }}
              placeholder={provider === 'ollama' ? 'llama3' : provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-20240620'}
              className="w-full px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {provider !== 'ollama' && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-white/40" />
                <label className="text-[10px] font-black uppercase tracking-wider text-white/50">API Key</label>
              </div>
              <input
                type="password"
                value={provider === 'openai' ? openaiKey : claudeKey}
                onChange={(e) => handleKeyChange(provider === 'openai' ? 'openai' : 'claude', e.target.value)}
                placeholder={`Enter your ${provider === 'openai' ? 'OpenAI' : 'Anthropic Claude'} key...`}
                className="w-full px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-white/50">Inject Transcripts Context</span>
            <input
              type="checkbox"
              checked={useContext}
              onChange={(e) => setUseContext(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#1a1b1e] select-text">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col text-left space-y-1 ${
              m.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div className="flex items-center gap-1">
              {m.role === 'assistant' ? (
                <>
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Copilot</span>
                </>
              ) : (
                <span className="text-[9px] font-black uppercase tracking-wider text-white/40">You</span>
              )}
            </div>
            <div
              className={`p-3 rounded-2xl text-xs leading-relaxed max-w-[85%] ${
                m.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-tr-none'
                  : 'bg-[#27282b] text-white/90 rounded-tl-none border border-white/[0.04]'
              }`}
              style={{ whiteSpace: 'pre-wrap' }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-white/40 text-[10px] font-bold">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>Thinking...</span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg flex gap-2 text-xs text-left">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Error querying AI:</span>
              <p className="text-[10px] mt-1">{errorMsg}</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Helper Prompt Chips */}
      {messages.length <= 1 && !isLoading && (
        <div className="px-4 py-2 bg-[#1a1b1e] border-t border-white/[0.04] flex flex-wrap gap-1.5 text-left">
          <button
            onClick={() => handleShortcut('summary')}
            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded-full cursor-pointer transition-all"
          >
            <Brain className="w-3 h-3 text-emerald-400" />
            Summarize Meeting
          </button>
          <button
            onClick={() => handleShortcut('actions')}
            className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded-full cursor-pointer transition-all"
          >
            <Bot className="w-3 h-3 text-emerald-400" />
            List Actions
          </button>
        </div>
      )}

      {/* Input Area */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="p-4 bg-[#202124] border-t border-white/[0.08]"
      >
        <div className="relative flex items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={isLoading}
            placeholder={
              provider === 'ollama'
                ? `Ask llama3 (local)...`
                : `Ask ${provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5'}...`
            }
            className="w-full bg-[#2a2d32] border border-white/10 rounded-full pl-4 pr-11 py-2.5 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-1.5 w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-[#3c4043] text-white flex items-center justify-center transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default AiCopilotPanel;
