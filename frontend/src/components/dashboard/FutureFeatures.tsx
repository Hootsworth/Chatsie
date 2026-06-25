import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.png';
import cursorArrow from '../../assets/arrow_2x.png';
import { Button } from '../ui';
import { ArrowLeft, Mic, Sparkles, Smile, MousePointer } from 'lucide-react';

/* ────────────────────────────────────────────────────────
   1. INTENT-TO-SPEAK SIMULATION WIDGET
   ──────────────────────────────────────────────────────── */
const IntentToSpeakDemo: React.FC = () => {
  const [isBreathing, setIsBreathing] = useState(false);
  const [pulseRipples, setPulseRipples] = useState<number[]>([]);

  const handleSimulate = () => {
    setIsBreathing(true);
    setPulseRipples([1, 2, 3]);
    setTimeout(() => {
      setIsBreathing(false);
      setPulseRipples([]);
    }, 2500);
  };

  return (
    <div className="bg-canvas border border-hairline rounded-xl p-6 shadow-sm flex flex-col items-center justify-center space-y-6 relative overflow-hidden h-72 w-full">
      <div className="relative flex items-center justify-center">
        {/* Pulse Waves */}
        {pulseRipples.map((_, idx) => (
          <div
            key={idx}
            className="absolute inset-0 rounded-full border-4 border-emerald-400 opacity-0"
            style={{
              animation: `pulseRipple 1.8s cubic-bezier(0, 0, 0.2, 1) infinite`,
              animationDelay: `${idx * 0.5}s`,
              width: '100%',
              height: '100%',
            }}
          />
        ))}
        {/* Avatar */}
        <div className={`w-20 h-20 rounded-full bg-[#c5b0f4]/30 border-2 flex items-center justify-center font-bold text-xl text-ink transition-all duration-300 relative z-10 ${isBreathing ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.6)] scale-105' : 'border-hairline'}`}>
          JD
        </div>
        {/* Micro indicator */}
        {isBreathing && (
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-400 border-2 border-canvas flex items-center justify-center z-20 animate-pulse">
            <Mic className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      <div className="text-center z-10">
        <h4 className="text-body-sm font-bold text-ink">Jane Doe</h4>
        <p className="text-body-xs text-muted mt-0.5">
          {isBreathing ? 'Detected intake of breath' : 'Listening...'}
        </p>
      </div>

      <Button
        onClick={handleSimulate}
        disabled={isBreathing}
        variant={isBreathing ? 'secondary' : 'primary'}
        className="z-10 py-1.5 px-4 text-xs cursor-pointer w-full text-center"
      >
        {isBreathing ? 'Detecting Inhale...' : 'Simulate Breath Intake'}
      </Button>

      {isBreathing && (
        <div className="absolute top-3 bg-emerald-500 text-white text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded shadow">
          Intent Detected
        </div>
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   2. HARDWARE-SYNCHRONIZED MUTE WIDGET
   ──────────────────────────────────────────────────────── */
const HardwareMuteDemo: React.FC = () => {
  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className={`relative bg-canvas border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center space-y-6 overflow-hidden h-72 w-full transition-all duration-300 ${isMuted ? 'border-red-500 ring-4 ring-red-500/20' : 'border-hairline'}`}>
      <div className="flex items-center justify-between w-full px-2">
        {/* Headset representation */}
        <div className={`p-3.5 rounded-lg border flex flex-col items-center justify-center space-y-1.5 transition-all duration-300 ${isMuted ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-surface-soft border-hairline text-ink'}`}>
          <span className="text-2xl">🎧</span>
          <span className="text-[9px] font-black uppercase tracking-wider">Physical Mic</span>
        </div>

        {/* Sync Indicator */}
        <div className={`text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${isMuted ? 'text-red-500 animate-pulse' : 'text-muted'}`}>
          {isMuted ? '◀── SYNC ──' : '─── SYNC ──▶'}
        </div>

        {/* App UI representation */}
        <div className={`p-3.5 rounded-lg border flex flex-col items-center justify-center space-y-1.5 transition-all duration-300 ${isMuted ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-surface-soft border-hairline text-ink'}`}>
          <span className="text-2xl">💻</span>
          <span className="text-[9px] font-black uppercase tracking-wider">Software UI</span>
        </div>
      </div>

      <div className="text-center">
        <h4 className="text-body-sm font-bold text-ink">{isMuted ? 'OS-LEVEL MUTED' : 'MICROPHONE ACTIVE'}</h4>
        <p className="text-body-xs text-muted mt-0.5">
          {isMuted ? 'Flawless hardware signal sync' : 'Press button below to mute'}
        </p>
      </div>

      <button
        onClick={toggleMute}
        className="w-full text-center py-2 px-4 rounded-pill text-xs font-bold transition-all cursor-pointer text-white"
        style={{ backgroundColor: isMuted ? '#202124' : '#ea4335' }}
      >
        {isMuted ? 'Press Headset Button to Unmute' : 'Press Headset Button to Mute'}
      </button>

      {/* Glowing red app border simulation */}
      {isMuted && (
        <div className="absolute inset-0 border-8 border-red-500/50 pointer-events-none" style={{ animation: 'redAppPulse 2s infinite' }} />
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   3. "VIBE CHECK" WAITING ROOM WIDGET
   ──────────────────────────────────────────────────────── */
const VibeCheckDemo: React.FC = () => {
  const [blurLevel, setBlurLevel] = useState(20);
  const [isSimulatingActivity, setIsSimulatingActivity] = useState(true);
  const [emojis, setEmojis] = useState<Array<{ id: number; text: string; x: number }>>([]);
  const emojiIdRef = useRef(0);

  const emojiPool = ['👏', '😂', '🔥', '❤️', '🎉', '🙌'];

  useEffect(() => {
    if (!isSimulatingActivity) return;

    const interval = setInterval(() => {
      const randomEmoji = emojiPool[Math.floor(Math.random() * emojiPool.length)];
      const newEmoji = {
        id: emojiIdRef.current++,
        text: randomEmoji,
        x: 15 + Math.random() * 70, // horizontal start
      };
      setEmojis(prev => [...prev, newEmoji]);

      setTimeout(() => {
        setEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
      }, 1800);
    }, 500);

    return () => clearInterval(interval);
  }, [isSimulatingActivity]);

  return (
    <div className="bg-canvas border border-hairline rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4 overflow-hidden h-72 w-full">
      <div className="relative aspect-[16/10] bg-[#202124] border border-white/5 rounded-lg overflow-hidden flex items-center justify-center">
        
        {/* Blurry live feed background */}
        <div 
          className="absolute inset-0 grid grid-cols-2 gap-1.5 p-2 transition-all duration-300"
          style={{ filter: `blur(${blurLevel}px)` }}
        >
          <div className="bg-[#292b2f] rounded flex items-center justify-center relative">
            <div className={`w-8 h-8 rounded-full bg-emerald-400 absolute transition-all duration-500 ${isSimulatingActivity ? 'scale-110 translate-y-1' : ''}`} />
          </div>
          <div className="bg-[#292b2f] rounded flex items-center justify-center relative">
            <div className={`w-8 h-8 rounded-full bg-[#fbbc04] absolute transition-all duration-500 ${isSimulatingActivity ? 'scale-105 -translate-y-1' : ''}`} />
          </div>
          <div className="bg-[#292b2f] rounded flex items-center justify-center relative">
            <div className={`w-8 h-8 rounded-full bg-[#c5b0f4] absolute transition-all duration-500 ${isSimulatingActivity ? 'scale-110 translate-x-1' : ''}`} />
          </div>
          <div className="bg-[#292b2f] rounded flex items-center justify-center relative">
            <div className={`w-8 h-8 rounded-full bg-[#ffb084] absolute transition-all duration-500 ${isSimulatingActivity ? 'scale-95 -translate-x-1' : ''}`} />
          </div>
        </div>

        {/* Floating live emojis */}
        {emojis.map((emoji) => (
          <span
            key={emoji.id}
            className="absolute text-lg pointer-events-none"
            style={{
              left: `${emoji.x}%`,
              animation: 'doodleBubble 1.8s ease-out forwards',
            }}
          >
            {emoji.text}
          </span>
        ))}

        {/* Overlay caption */}
        <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center text-center p-2">
          <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-400/20 px-2 py-0.5 rounded border border-emerald-400/30 mb-0.5 animate-pulse">
            Vibe Check Feed
          </span>
          <span className="text-[10px] text-white/70">Blurred to protect privacy</span>
        </div>
      </div>

      {/* Sliders */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] text-muted font-bold uppercase tracking-wider">
          <span>Privacy Blur</span>
          <span>{blurLevel}px</span>
        </div>
        <input
          type="range"
          min="2"
          max="35"
          value={blurLevel}
          onChange={(e) => setBlurLevel(parseInt(e.target.value))}
          className="w-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between items-center text-[10px] pt-1">
          <span className="text-muted">Simulate Call Activity</span>
          <input 
            type="checkbox" 
            checked={isSimulatingActivity} 
            onChange={(e) => setIsSimulatingActivity(e.target.checked)}
            className="w-3.5 h-3.5 accent-primary cursor-pointer" 
          />
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   3.5 GESTURE TRIGGERS SIMULATION WIDGET
   ──────────────────────────────────────────────────────── */
const GestureTriggersDemo: React.FC = () => {
  const [activeGesture, setActiveGesture] = useState<string | null>(null);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; vx: number; vy: number; color: string; size: number; alpha: number }>>([]);

  const triggerBurst = (type: string) => {
    setActiveGesture(type);
    
    const colors = type === 'nod' ? ['#00e5ff', '#00f5d4', '#ffffff'] : ['#ffc700', '#ffa200', '#ffeb3b'];
    const newParticles = Array.from({ length: 25 }).map((_, idx) => ({
      id: Math.random() + idx,
      x: 50, // center (percentage)
      y: 50,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.7) * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 5,
      alpha: 1.0
    }));
    
    setParticles(newParticles);
    
    setTimeout(() => {
      setActiveGesture(null);
    }, 1500);
  };

  useEffect(() => {
    if (particles.length === 0) return;
    
    const interval = setInterval(() => {
      setParticles(prev => {
        return prev.map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          vy: p.vy + 0.08, // gravity
          alpha: p.alpha - 0.025
        })).filter(p => p.alpha > 0);
      });
    }, 30);
    
    return () => clearInterval(interval);
  }, [particles.length]);

  return (
    <div className="bg-canvas border border-hairline rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-4 overflow-hidden h-72 w-full relative">
      <div className="relative aspect-[16/10] bg-[#202124] border border-white/5 rounded-lg overflow-hidden flex items-center justify-center">
        {/* Avatar */}
        <div className={`w-16 h-16 rounded-full bg-[#fa7b17]/25 border-2 flex items-center justify-center font-bold text-lg text-[#e8eaed] transition-all duration-300 relative z-10 ${activeGesture ? 'border-[#ffc700] scale-105 shadow-[0_0_15px_rgba(255,199,0,0.5)]' : 'border-white/10'}`}>
          GT
        </div>

        {/* Particles */}
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              opacity: p.alpha,
              boxShadow: `0 0 6px ${p.color}`
            }}
          />
        ))}

        {/* Floating text reaction indicator */}
        {activeGesture && (
          <div className="absolute top-2 bg-black/75 text-[#ffc700] border border-white/10 text-[9px] uppercase font-black tracking-wider px-2 py-0.5 rounded shadow z-20 animate-pulse">
            {activeGesture === 'nod' ? 'NOD DETECTED 👤' : 'THUMBS UP 👍'}
          </div>
        )}
      </div>

      <div className="flex gap-2 w-full">
        <button
          onClick={() => triggerBurst('nod')}
          className="flex-1 text-center py-1.5 px-2 bg-block-mint border border-hairline rounded-full text-[10px] font-bold text-ink hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          Simulate Nod
        </button>
        <button
          onClick={() => triggerBurst('thumbsup')}
          className="flex-1 text-center py-1.5 px-2 bg-block-cream border border-hairline rounded-full text-[10px] font-bold text-ink hover:scale-105 active:scale-95 transition-all cursor-pointer"
        >
          Simulate 👍
        </button>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   3.6 MULTIPLAYER CURSORS SIMULATION WIDGET
   ──────────────────────────────────────────────────────── */
const MultiplayerCursorsDemo: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [localPos, setLocalPos] = useState({ x: 50, y: 50 });
  const [remotePos1, setRemotePos1] = useState({ x: 25, y: 30 });
  const [remotePos2, setRemotePos2] = useState({ x: 75, y: 65 });

  useEffect(() => {
    const interval = setInterval(() => {
      setRemotePos1(prev => ({
        x: Math.max(10, Math.min(90, prev.x + (Math.random() - 0.5) * 10)),
        y: Math.max(10, Math.min(90, prev.y + (Math.random() - 0.5) * 10))
      }));
      setRemotePos2(prev => ({
        x: Math.max(10, Math.min(90, prev.x + (Math.random() - 0.5) * 10)),
        y: Math.max(10, Math.min(90, prev.y + (Math.random() - 0.5) * 10))
      }));
    }, 400);

    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setLocalPos({ x, y });
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="bg-canvas border border-hairline rounded-xl p-4 shadow-sm flex flex-col justify-between space-y-4 overflow-hidden h-72 w-full cursor-none relative"
    >
      <div className="relative aspect-[16/10] bg-[#1e1e1e] border border-white/5 rounded-lg overflow-hidden flex flex-col items-center justify-center select-none">
        
        {/* Mock content panel */}
        <div className="absolute top-2 left-2 right-2 flex justify-between items-center text-[8px] text-white/40 border-b border-white/5 pb-1">
          <span>📁 interactive_whiteboard.svg</span>
          <span className="bg-emerald-500/20 text-emerald-400 px-1 py-0.2 rounded font-black text-[7px]">LIVE CANVAS</span>
        </div>
        
        <div className="text-center p-3">
          <div className="w-10 h-1 bg-[#ff3d8b] rounded mb-1 mx-auto" />
          <h5 className="text-[10px] text-white font-bold tracking-tight">Screenshare Canvas</h5>
          <p className="text-[7px] text-white/30 mt-0.5">Move mouse to check coordinates</p>
        </div>

        {/* Local user cursor */}
        <div 
          className="absolute pointer-events-none transition-all duration-75 flex items-center space-x-0.5"
          style={{ left: `${localPos.x}%`, top: `${localPos.y}%`, transform: 'translate(-2px, -2px)' }}
        >
          <img src={cursorArrow} alt="Cursor" className="w-4 h-4 object-contain drop-shadow" />
          <div className="bg-primary text-white text-[7px] font-black px-1.5 py-0.5 rounded-full border border-white/20 shadow-md">
            ME
          </div>
        </div>

        {/* Remote cursor 1 */}
        <div 
          className="absolute pointer-events-none transition-all duration-300 ease-out flex items-center space-x-0.5"
          style={{ left: `${remotePos1.x}%`, top: `${remotePos1.y}%`, transform: 'translate(-2px, -2px)' }}
        >
          <img src={cursorArrow} alt="Cursor" className="w-4 h-4 object-contain drop-shadow" />
          <div className="bg-emerald-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full border border-white/20 shadow-md">
            JD
          </div>
        </div>

        {/* Remote cursor 2 */}
        <div 
          className="absolute pointer-events-none transition-all duration-300 ease-out flex items-center space-x-0.5"
          style={{ left: `${remotePos2.x}%`, top: `${remotePos2.y}%`, transform: 'translate(-2px, -2px)' }}
        >
          <img src={cursorArrow} alt="Cursor" className="w-4 h-4 object-contain drop-shadow" />
          <div className="bg-purple-500 text-white text-[7px] font-black px-1.5 py-0.5 rounded-full border border-white/20 shadow-md">
            AM
          </div>
        </div>
      </div>

      <div className="text-center text-[9px] text-muted font-black uppercase tracking-wider">
        Move inside widget to trace
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   4. MAIN FUTURE FEATURES SCREEN COMPONENT
   ──────────────────────────────────────────────────────── */
export const FutureFeatures: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col">
      {/* Dynamic Keyframes */}
      <style>{`
        @keyframes pulseRipple {
          0% {
            transform: scale(1.0);
            opacity: 0.6;
          }
          100% {
            transform: scale(2.0);
            opacity: 0;
          }
        }
        @keyframes redAppPulse {
          0%, 100% {
            border-color: rgba(239, 68, 68, 0.4);
          }
          50% {
            border-color: rgba(239, 68, 68, 0.85);
          }
        }
        @keyframes doodleBubble {
          0% {
            transform: translateY(20px) scale(0.6);
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translateY(0px) scale(1.2);
          }
          100% {
            transform: translateY(-90px) scale(0.9);
            opacity: 0;
          }
        }
      `}</style>

      {/* NAVBAR */}
      <header className="h-[56px] px-6 flex items-center justify-between border-b border-hairline sticky top-0 bg-canvas z-40">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => navigate('/')}>
          <img src={logo} alt="Chatsie Logo" className="w-8 h-8 rounded-sm object-contain" />
          <span className="text-body-sm font-bold tracking-tight">Chatsie</span>
        </div>
        <Button onClick={() => navigate('/')} variant="secondary" className="text-xs py-1.5 px-4 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5 inline" /> Back to Dashboard
        </Button>
      </header>

      <main className="flex-1 w-full max-w-[1080px] mx-auto px-6 py-24 space-y-24">
        {/* HERO */}
        <section className="text-center max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center space-x-2 bg-block-mint px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-ink border border-ink/10">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Coming Soon</span>
          </div>
          <h1 className="text-display-xl tracking-tight leading-none">
            Next-Gen<br />Collaboration.
          </h1>
          <p className="text-subhead max-w-xl mx-auto">
            Discover the future additions built to eliminate WebRTC friction and coordinate fluid remote work.
          </p>
        </section>

        {/* INTERACTIVE FEATURE STICKY NOTES */}
        <div className="space-y-16">
          
          {/* FEATURE 1: Intent-to-Speak */}
          <section className="bg-block-lime rounded-2xl p-8 md:p-12 flex flex-col md:flex-row gap-10 items-center border border-hairline shadow-sm">
            <div className="flex-1 space-y-4">
              <span className="text-eyebrow text-ink/60">Coming Soon • Feature 01</span>
              <h2 className="text-headline text-ink font-bold leading-tight">Intent-to-Speak Indicators</h2>
              <p className="text-body-default text-ink/80 leading-relaxed">
                In large groups, people constantly talk over each other because they lack body language cues. By monitoring micro-patterns in voice inputs, Chatsie detects sharp intakes of breath or throat-clearing and translates that into a visual, gentle green glow around your avatar. It signals, <span className="font-bold">"I am about to talk,"</span> avoiding verbal collisions before they happen.
              </p>
            </div>
            <div className="w-full md:w-[320px] flex-shrink-0 flex justify-center">
              <IntentToSpeakDemo />
            </div>
          </section>

          {/* FEATURE 2: Hardware Sync Mute */}
          <section className="bg-block-lilac rounded-2xl p-8 md:p-12 flex flex-col md:flex-row-reverse gap-10 items-center border border-hairline shadow-sm">
            <div className="flex-1 space-y-4">
              <span className="text-eyebrow text-ink/60">Coming Soon • Feature 02</span>
              <h2 className="text-headline text-ink font-bold leading-tight">Hardware-Synchronized Mute</h2>
              <p className="text-body-default text-ink/80 leading-relaxed">
                Build flawless OS-level driver integration so that hitting the physical mute button on your USB headset or keyboard updates the software UI instantly. To guarantee peace of mind, we display an unmistakable glowing red border frame around the entire screen so you never experience "am I muted?" panic.
              </p>
            </div>
            <div className="w-full md:w-[320px] flex-shrink-0 flex justify-center">
              <HardwareMuteDemo />
            </div>
          </section>

          {/* FEATURE 3: Vibe Check Waiting Room */}
          <section className="bg-block-cream rounded-2xl p-8 md:p-12 flex flex-col md:flex-row gap-10 items-center border border-hairline shadow-sm">
            <div className="flex-1 space-y-4">
              <span className="text-eyebrow text-ink/60">Coming Soon • Feature 03</span>
              <h2 className="text-headline text-ink font-bold leading-tight">"Vibe Check" Waiting Rooms</h2>
              <p className="text-body-default text-ink/80 leading-relaxed">
                Waiting on a static black loader screen feels isolated. Vibe Check allows the waiting room to overlay a heavily blurred, audio-less stream of the active call. You can't hear conversations or make out specifics, but you can feel the room's energy (laughter, presentations, active chats) before you drop in.
              </p>
            </div>
            <div className="w-full md:w-[320px] flex-shrink-0 flex justify-center">
              <VibeCheckDemo />
            </div>
          </section>

          {/* FEATURE 4: Silky Gesture Triggers */}
          <section className="bg-block-mint rounded-2xl p-8 md:p-12 flex flex-col md:flex-row-reverse gap-10 items-center border border-hairline shadow-sm">
            <div className="flex-1 space-y-4">
              <span className="text-eyebrow text-ink/60">Coming Soon • Feature 04</span>
              <h2 className="text-headline text-ink font-bold leading-tight flex items-center">
                <Smile className="w-6 h-6 mr-2 text-primary" /> Silky Gesture Triggers
              </h2>
              <p className="text-body-default text-ink/80 leading-relaxed">
                Reactions shouldn't feel like a chore. Rather than forcing you to look down, hunt for, and click tiny emoji reaction buttons, Chatsie uses local on-device computer vision to detect real-world physical gestures—like a subtle nod of agreement or a physical thumbs up—and instantly maps them to premium, high-fidelity canvas particle bursts overlaid on your video card.
              </p>
            </div>
            <div className="w-full md:w-[320px] flex-shrink-0 flex justify-center">
              <GestureTriggersDemo />
            </div>
          </section>

          {/* FEATURE 5: Multiplayer Screenshare Cursors */}
          <section className="bg-block-pink rounded-2xl p-8 md:p-12 flex flex-col md:flex-row gap-10 items-center border border-hairline shadow-sm">
            <div className="flex-1 space-y-4">
              <span className="text-eyebrow text-ink/60">Coming Soon • Feature 05</span>
              <h2 className="text-headline text-ink font-bold leading-tight flex items-center">
                <MousePointer className="w-6 h-6 mr-2 text-primary" /> Multiplayer Screenshare Canvas
              </h2>
              <p className="text-body-default text-ink/80 leading-relaxed">
                Screen sharing is traditionally a clunky, passive broadcast where you have to direct viewers verbally. Instead, Chatsie overlays a transparent multiplayer canvas. When opted in by the host, viewers can move their own localized cursors on top of the shared screen. Rendered as glowing orbs with initials, it turns any broadcast into an interactive collaborative whiteboard.
              </p>
            </div>
            <div className="w-full md:w-[320px] flex-shrink-0 flex justify-center">
              <MultiplayerCursorsDemo />
            </div>
          </section>

        </div>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#eaeaea] border-t border-hairline py-8 px-6 text-center text-caption text-ink/50 mt-12 rounded-t-xl">
        <p className="font-bold">Chatsie Future Features Roadmap • Built with love by singulr.tech</p>
      </footer>
    </div>
  );
};

export default FutureFeatures;
