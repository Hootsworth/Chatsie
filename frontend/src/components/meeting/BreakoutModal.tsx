import React, { useState } from 'react';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';
import { Shuffle, Play, StopCircle } from 'lucide-react';
import { Button } from '../ui';

interface BreakoutModalProps {
  onClose: () => void;
  isBreakoutActive: boolean;
  onEndBreakout: () => void;
}

export const BreakoutModal: React.FC<BreakoutModalProps> = ({ onClose, isBreakoutActive, onEndBreakout }) => {
  const { participants, currentMeeting } = useMeetingStore();
  const [roomCount, setRoomCount] = useState(2);
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // { userId: roomCode }
  
  const handleAssignRandomly = () => {
    if (participants.length === 0) return;
    
    const newAssignments: Record<string, string> = {};
    const roomsList = Array.from({ length: roomCount }, (_, i) => `${currentMeeting?.code}-breakout-${i + 1}`);
    
    // Shuffle participants and assign round-robin to rooms
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    shuffled.forEach((p, idx) => {
      const roomCode = roomsList[idx % roomCount];
      newAssignments[p.userId] = roomCode;
    });
    
    setAssignments(newAssignments);
  };

  const handleStartBreakout = () => {
    // 1. Assign anyone who hasn't been assigned yet randomly
    const finalAssignments = { ...assignments };
    const roomsList = Array.from({ length: roomCount }, (_, i) => `${currentMeeting?.code}-breakout-${i + 1}`);
    
    participants.forEach((p, idx) => {
      if (!finalAssignments[p.userId]) {
        finalAssignments[p.userId] = roomsList[idx % roomCount];
      }
    });

    // 2. Broadcast breakout started over sockets
    const durationSeconds = durationMinutes * 60;
    signalingClient.sendStartBreakout(finalAssignments, durationSeconds);
    
    // Close modal
    onClose();
  };

  return (
    <div className="space-y-5 py-2">
      {isBreakoutActive ? (
        <div className="space-y-4 text-center py-4">
          <div className="w-12 h-12 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-500/20 animate-pulse">
            <StopCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-ink">Breakout Rooms are Active</h3>
            <p className="text-xs text-muted">Participants are currently distributed in their sub-rooms.</p>
          </div>
          <Button onClick={onEndBreakout} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5">
            End Breakout Rooms
          </Button>
        </div>
      ) : (
        <>
          {/* Room Count Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Number of Breakout Rooms</label>
            <select
              value={roomCount}
              onChange={(e) => {
                setRoomCount(Number(e.target.value));
                setAssignments({});
              }}
              className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            >
              <option value={2}>2 Rooms</option>
              <option value={3}>3 Rooms</option>
              <option value={4}>4 Rooms</option>
            </select>
          </div>

          {/* Duration Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted uppercase tracking-wider">Duration (Minutes)</label>
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full px-3.5 py-2 text-sm rounded-lg bg-canvas border border-hairline text-ink focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            >
              <option value={1}>1 Minute</option>
              <option value={2}>2 Minutes</option>
              <option value={5}>5 Minutes</option>
              <option value={10}>10 Minutes</option>
              <option value={15}>15 Minutes</option>
            </select>
          </div>

          {/* Assignment Control */}
          <div className="pt-2 border-t border-hairline-soft space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">Assignments</span>
              <button
                onClick={handleAssignRandomly}
                disabled={participants.length === 0}
                className="text-xs font-bold text-primary hover:text-primary-active flex items-center space-x-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Auto Assign Sockets</span>
              </button>
            </div>

            {/* Room Previews */}
            <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1 select-none">
              {Array.from({ length: roomCount }).map((_, roomIdx) => {
                const roomName = `Breakout Room ${roomIdx + 1}`;
                const roomCode = `${currentMeeting?.code}-breakout-${roomIdx + 1}`;
                const assignedPeers = participants.filter((p) => assignments[p.userId] === roomCode);

                return (
                  <div key={roomCode} className="p-2.5 bg-surface-card border border-hairline rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-ink">
                      <span>{roomName}</span>
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-muted px-1.5 py-0.5 rounded">
                        {assignedPeers.length} peers
                      </span>
                    </div>
                    <div className="text-[10px] text-muted flex flex-wrap gap-1">
                      {assignedPeers.map((p) => (
                        <span key={p.userId} className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                          {p.username}
                        </span>
                      ))}
                      {assignedPeers.length === 0 && <span className="italic text-muted-soft">No peers assigned yet</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 border-t border-hairline-soft flex space-x-3 justify-end">
            <Button onClick={onClose} variant="secondary">Cancel</Button>
            <Button
              onClick={handleStartBreakout}
              disabled={participants.length === 0}
              className="bg-primary hover:bg-primary-active text-white font-bold flex items-center space-x-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start Breakouts</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
