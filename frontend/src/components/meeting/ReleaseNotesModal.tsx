import React from 'react';
import { Sparkles, Headphones, FileText, Bot, ShieldCheck, Zap } from 'lucide-react';

interface ReleaseNotesModalProps {
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ onClose }) => {
  const features = [
    {
      title: 'Spatial 3D Stereo Audio',
      desc: 'Voices are panned horizontally across the stereo spectrum based on grid positions. Distinguishes remote speakers naturally and eliminates video call ear fatigue.',
      icon: <Headphones className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
    },
    {
      title: 'Plugins & Collaborative Workspace',
      desc: 'Activate, toggle, and install collaborative tools. Default active tools include Markdown editor and JS Code sandbox, with more available to request.',
      icon: <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400" />
    },
    {
      title: 'Integrated AI Copilot',
      desc: 'Ask the sidebar assistant to summarize conversations, identify owners, or draft action items. Configurable with local Ollama, OpenAI, and Anthropic Claude.',
      icon: <Bot className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
    },
    {
      title: 'Host Moderation Panel',
      desc: 'Host privileges expanded. Lock public text chat, disable screen sharing for participants, mute peers, clear raised hands, and broadcast announcements.',
      icon: <ShieldCheck className="w-5 h-5 text-rose-600 dark:text-rose-400" />
    },
    {
      title: 'Lobby Diagnostics',
      desc: 'Verify connection downlink speed, verify microphone signal activity, and test audio/video configurations before joining the live room.',
      icon: <Zap className="w-5 h-5 text-amber-600 dark:text-amber-400" />
    }
  ];

  return (
    <div className="space-y-6 text-left select-text max-h-[500px] overflow-y-auto pr-1">
      {/* Hero Badge */}
      <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-center space-y-3">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-full mx-auto">
          <Sparkles className="w-3.5 h-3.5" />
          Major Release v0.5.0
        </span>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">Welcome to Chatsie 0.5.0</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
          This release brings spatial stereo acoustics, real-time shared documents, active plugin extension support, and deep LLM capabilities directly into your video meetings.
        </p>
      </div>

      {/* Feature List */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold text-gray-900 dark:text-white border-b border-gray-150 dark:border-zinc-800 pb-2">
          Key Features & Upgrades
        </h4>
        <div className="grid gap-3.5">
          {features.map((f, idx) => (
            <div key={idx} className="flex gap-4 p-3.5 bg-gray-50/50 dark:bg-zinc-900/40 border border-gray-150 dark:border-zinc-800/60 rounded-xl hover:bg-gray-50 dark:hover:bg-zinc-800/60 transition-all duration-200">
              <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-zinc-800/60 flex items-center justify-center flex-shrink-0">
                {f.icon}
              </div>
              <div className="space-y-0.5">
                <h5 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{f.title}</h5>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed mt-0.5">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 flex justify-between items-center text-xs text-gray-500 dark:text-zinc-500 border-t border-gray-150 dark:border-zinc-800/60">
        <span>Released July 2026</span>
        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-800 dark:text-gray-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default ReleaseNotesModal;
