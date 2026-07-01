import React from 'react';
import { Sparkles, Headphones, FileText, Bot, ShieldCheck, Zap } from 'lucide-react';

interface ReleaseNotesModalProps {
  onClose: () => void;
}

export const ReleaseNotesModal: React.FC<ReleaseNotesModalProps> = ({ onClose }) => {
  const features = [
    {
      title: 'Spatial 3D Audio',
      desc: 'Voices are panned horizontally across the stereo spectrum based on grid positions. Distinguishes remote speakers naturally and eliminates video call ear fatigue.',
      icon: <Headphones className="w-5 h-5 text-emerald-400" />
    },
    {
      title: 'Collaborative App Workspace',
      desc: 'Co-edit project briefs or script snippets in real-time with Markdown and raw code editors. Markdown tab contains a live visual preview renderer.',
      icon: <FileText className="w-5 h-5 text-sky-400" />
    },
    {
      title: 'AI Copilot Integration',
      desc: 'Ask your sidebar AI to summarize conversations, identify owners, or draft action items. Configurable with local Ollama, OpenAI (GPT-4o-mini), and Anthropic Claude.',
      icon: <Bot className="w-5 h-5 text-indigo-400" />
    },
    {
      title: 'Host Moderation Panel',
      desc: 'Host privileges expanded. Lock public text chat, disable screen sharing for participants, mute peers, clear raised hands, and broadcast announcements to breakout rooms.',
      icon: <ShieldCheck className="w-5 h-5 text-rose-400" />
    },
    {
      title: 'Lobby Diagnostics & Diagnostics',
      desc: 'Check connection downlink speed, verify microphone signal activity, and test audio/video configurations before joining the live room.',
      icon: <Zap className="w-5 h-5 text-amber-400" />
    }
  ];

  return (
    <div className="space-y-6 text-left select-text max-h-[500px] overflow-y-auto pr-1">
      {/* Hero Badge */}
      <div className="bg-gradient-to-r from-emerald-500/20 to-indigo-500/20 border border-white/10 rounded-2xl p-5 text-center space-y-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider rounded-full">
          <Sparkles className="w-3.5 h-3.5" />
          Major Release
        </span>
        <h3 className="text-2xl font-serif text-white">Chatsie Version 0.5.0</h3>
        <p className="text-xs text-white/60 leading-relaxed max-w-sm mx-auto">
          Welcome to Chatsie 0.5.0! This release brings spatial stereo acoustics, real-time shared documents, and deep LLM capabilities directly into your video meetings.
        </p>
      </div>

      {/* Feature List */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-white/40">Key Features & Upgrades</h4>
        <div className="grid gap-3.5">
          {features.map((f, idx) => (
            <div key={idx} className="flex gap-4 p-3 bg-white/5 border border-white/[0.04] rounded-xl hover:bg-white/[0.08] transition-all">
              <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                {f.icon}
              </div>
              <div className="space-y-0.5">
                <h5 className="text-xs font-bold text-white">{f.title}</h5>
                <p className="text-[11px] text-white/60 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="pt-4 flex justify-between items-center text-[10px] text-white/40 border-t border-white/[0.06]">
        <span>Released July 2026</span>
        <button
          onClick={onClose}
          className="px-3 py-1 bg-white/5 hover:bg-white/10 text-white rounded text-[10px] font-bold transition-all cursor-pointer"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

export default ReleaseNotesModal;
