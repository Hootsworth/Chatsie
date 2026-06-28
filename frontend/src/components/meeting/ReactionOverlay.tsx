import React, { useState, useEffect } from 'react';

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number; // horizontal position in %
  createdAt: number;
}

interface ReactionOverlayProps {
  /**
   * Array of reaction events received via signaling.
   * Each time a new object is pushed, an emoji floats up.
   */
  reactions: Array<{ id: string; emoji: string }>;
}

/**
 * Full-screen overlay that renders floating emoji reactions.
 * Emojis float upward with a randomized wiggle and fade out.
 */
export const ReactionOverlay: React.FC<ReactionOverlayProps> = ({ reactions }) => {
  const [activeReactions, setActiveReactions] = useState<FloatingReaction[]>([]);

  // When a new reaction arrives, add it to the active list
  useEffect(() => {
    if (reactions.length === 0) return;
    const latest = reactions[reactions.length - 1];

    // Prevent duplicates
    setActiveReactions(prev => {
      if (prev.some(r => r.id === latest.id)) return prev;
      return [
        ...prev,
        {
          id: latest.id,
          emoji: latest.emoji,
          x: 5 + Math.random() * 90, // random horizontal position (5-95%)
          createdAt: Date.now()
        }
      ];
    });
  }, [reactions]);

  // Cleanup expired reactions (older than 3.5s)
  useEffect(() => {
    if (activeReactions.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setActiveReactions(prev => prev.filter(r => now - r.createdAt < 3500));
    }, 500);
    return () => clearInterval(timer);
  }, [activeReactions.length]);

  if (activeReactions.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {activeReactions.map((reaction) => {
        const isDoodle = reaction.emoji.startsWith('doodle:');
        if (isDoodle) {
          const dataUrl = reaction.emoji.slice(7);
          return (
            <img
              key={reaction.id}
              src={dataUrl}
              alt="doodle reaction"
              className="absolute w-24 h-24 object-contain animate-reaction-float select-none pointer-events-none filter drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-white/10 rounded-lg p-0.5 bg-white/5 backdrop-blur-[1px]"
              style={{
                left: `${reaction.x}%`,
                bottom: '80px',
              }}
            />
          );
        }
        if (reaction.emoji === 'intent' || reaction.emoji === 'nod') {
          return (
            <div
              key={reaction.id}
              className="absolute animate-reaction-float select-none bg-emerald-500 text-white rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-wider shadow-xl border border-white/20"
              style={{
                left: `${reaction.x}%`,
                bottom: '80px',
              }}
            >
              {reaction.emoji === 'intent' ? 'Intent to speak' : 'Nod detected'}
            </div>
          );
        }
        return (
          <span
            key={reaction.id}
            className="absolute text-4xl animate-reaction-float select-none"
            style={{
              left: `${reaction.x}%`,
              bottom: '80px',
            }}
          >
            {reaction.emoji}
          </span>
        );
      })}
    </div>
  );
};

export default ReactionOverlay;
