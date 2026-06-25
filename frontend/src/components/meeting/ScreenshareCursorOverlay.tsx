import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import cursorArrow from '../../assets/arrow_2x.png';

interface CursorData {
  userId: string;
  username: string;
  x: number;
  y: number;
  timestamp: number;
}

interface ScreenshareCursorOverlayProps {
  roomId: string;
  isLocalPresenter: boolean;
  participant: any;
}

export const ScreenshareCursorOverlay: React.FC<ScreenshareCursorOverlayProps> = ({
  isLocalPresenter
}) => {
  const { isMultiplayerCursorEnabled, setMultiplayerCursorEnabled } = useMeetingStore();
  const { user } = useUser();
  const [remoteCursors, setRemoteCursors] = useState<Record<string, CursorData>>({});
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const myUserId = user?.id || 'guest';
  const lastSentRef = useRef<number>(0);

  // Sync cursor enablement and coordinates with signaling channel
  useEffect(() => {
    const handleToggled = ({ enabled }: { enabled: boolean }) => {
      setMultiplayerCursorEnabled(enabled);
    };

    const handleMoved = ({ userId, username, x, y }: { userId: string; username: string; x: number; y: number }) => {
      if (userId === myUserId) return;
      
      setRemoteCursors(prev => ({
        ...prev,
        [userId]: {
          userId,
          username,
          x,
          y,
          timestamp: Date.now()
        }
      }));
    };

    signalingClient.on('multiplayer-cursors-toggled', handleToggled);
    signalingClient.on('screenshare-cursor-moved', handleMoved);

    return () => {
      signalingClient.off('multiplayer-cursors-toggled', handleToggled);
      signalingClient.off('screenshare-cursor-moved', handleMoved);
    };
  }, [myUserId, setMultiplayerCursorEnabled]);

  // Clean up stale cursors (older than 3.5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors(prev => {
        const cleaned: Record<string, CursorData> = {};
        let changed = false;
        Object.keys(prev).forEach(key => {
          if (now - prev[key].timestamp < 3500) {
            cleaned[key] = prev[key];
          } else {
            changed = true;
          }
        });
        return changed ? cleaned : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isMultiplayerCursorEnabled) return null;

  // Calculate mouse position inside overlay
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isLocalPresenter) return;
    if (!overlayRef.current) return;

    const rect = overlayRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Limit socket broadcasts to every 55ms
    const now = Date.now();
    if (now - lastSentRef.current > 55) {
      signalingClient.sendScreenshareCursorMove(x, y);
      lastSentRef.current = now;
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div
      ref={overlayRef}
      onMouseMove={handleMouseMove}
      className={`absolute inset-0 z-20 select-none bg-transparent ${isLocalPresenter ? 'pointer-events-none' : 'pointer-events-auto cursor-none'}`}
    >
      {/* Render remote cursors */}
      {Object.values(remoteCursors).map((cur) => {
        const colors = ['bg-rose-500', 'bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500'];
        const hash = cur.username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const colorClass = colors[hash % colors.length];

        return (
          <div
            key={cur.userId}
            className="absolute pointer-events-none transition-all duration-75 ease-out flex items-center space-x-1"
            style={{
              left: `${cur.x * 100}%`,
              top: `${cur.y * 100}%`,
              transform: 'translate(-2px, -2px)'
            }}
          >
            {/* Custom arrow image */}
            <img
              src={cursorArrow}
              alt="Cursor Arrow"
              className="w-4.5 h-4.5 object-contain drop-shadow"
            />
            {/* Initials badge */}
            <div className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[9px] font-black text-white ${colorClass} shadow-md border border-white/20`}>
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span>{getInitials(cur.username)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ScreenshareCursorOverlay;
