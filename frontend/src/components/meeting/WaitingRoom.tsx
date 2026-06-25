import React, { useRef, useState, useEffect } from 'react';
import { Card, Button } from '../ui';
import { Loader2, ArrowLeft, Eraser, Send, Palette } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMeetingStore } from '../../stores/meetingStore';
import { signalingClient } from '../../services/signaling';

interface WaitingRoomProps {
  meetingTitle: string;
}

const DOODLE_COLORS = [
  { name: 'Rose', value: '#f43f5e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Primary', value: '#6366f1' },
  { name: 'Gold', value: '#eab308' },
  { name: 'White', value: '#ffffff' }
];

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ meetingTitle }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#f43f5e'); // Default to Rose
  const [thickness, setThickness] = useState(4);
  const isCanvasDirtyRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use higher resolution for crisp drawing on high DPI screens
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.scale(2, 2);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;

    // Set transparent background for exported reactions
    context.clearRect(0, 0, rect.width, rect.height);
  }, []);

  // Sync doodle strokes from other waiting participants
  useEffect(() => {
    const handleRemoteDraw = ({ x1, y1, x2, y2, color: remoteColor, thickness: remoteThickness }: any) => {
      const context = contextRef.current;
      if (!context) return;

      context.beginPath();
      context.strokeStyle = remoteColor;
      context.lineWidth = remoteThickness;
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    };

    const handleRemoteClear = () => {
      const canvas = canvasRef.current;
      const context = contextRef.current;
      if (!canvas || !context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      isCanvasDirtyRef.current = false;
    };

    signalingClient.on('waiting-doodle-draw', handleRemoteDraw);
    signalingClient.on('waiting-doodle-clear', handleRemoteClear);

    return () => {
      signalingClient.off('waiting-doodle-draw', handleRemoteDraw);
      signalingClient.off('waiting-doodle-clear', handleRemoteClear);
    };
  }, []);

  // Auto-send doodle reaction when approved
  useEffect(() => {
    return () => {
      const storeStatus = useMeetingStore.getState().waitingStatus;
      if (storeStatus === 'approved' && isCanvasDirtyRef.current && canvasRef.current) {
        // Create temporary canvas with the drawn contents scaled down to float size
        const canvas = canvasRef.current;
        const dataUrl = canvas.toDataURL('image/png');
        signalingClient.sendReaction('doodle:' + dataUrl);
      }
    };
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const coords = getCoordinates(e);
    if (!coords) return;
    setIsDrawing(true);
    lastPosRef.current = coords;
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !lastPosRef.current) return;
    const coords = getCoordinates(e);
    if (!coords) return;

    const context = contextRef.current;
    if (!context) return;

    // Draw locally
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = thickness;
    context.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    context.lineTo(coords.x, coords.y);
    context.stroke();

    // Broadcast stroke to other waiting room peers
    signalingClient.sendWaitingDoodleDraw(
      lastPosRef.current.x,
      lastPosRef.current.y,
      coords.x,
      coords.y,
      color,
      thickness
    );

    isCanvasDirtyRef.current = true;
    lastPosRef.current = coords;
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    lastPosRef.current = null;
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    signalingClient.sendWaitingDoodleClear();
    isCanvasDirtyRef.current = false;
  };

  const handleSendReaction = () => {
    if (!canvasRef.current || !isCanvasDirtyRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    signalingClient.sendReaction('doodle:' + dataUrl);
    
    // Briefly visual feedback and clear
    handleClear();
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row items-center justify-center bg-canvas px-4 md:px-8 py-6 transition-colors duration-200 gap-8">
      
      {/* Left panel: Info & Loading state */}
      <div className="w-full max-w-sm text-center md:text-left space-y-6">
        <div className="flex flex-col items-center md:items-start space-y-4">
          <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/5">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-display font-semibold text-ink tracking-tight">
              Waiting Room
            </h2>
            <p className="text-sm text-muted">
              You're in queue for <span className="font-bold text-body-strong">{meetingTitle}</span>.
            </p>
          </div>
        </div>

        <Card className="p-5 bg-surface-card border-hairline space-y-4">
          <p className="text-sm font-semibold text-body-strong leading-relaxed">
            The host will admit you shortly. In the meantime, doodle on the board! Your drawings are shared with other guests, and you can send them to the live meeting as floating reactions!
          </p>
          
          <div className="pt-2 border-t border-hairline">
            <Link to="/">
              <Button variant="secondary" size="sm" className="w-full h-10 rounded-md">
                <ArrowLeft className="w-4 h-4 mr-2" /> Leave Queue
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* Right panel: Doodle drawing board */}
      <div className="w-full max-w-xl flex flex-col space-y-4">
        <Card className="p-4 bg-surface-card border-hairline flex flex-col space-y-3.5 shadow-xl shadow-black/5">
          <div className="flex items-center justify-between border-b border-hairline pb-2.5">
            <span className="text-xs font-black uppercase text-muted tracking-wider flex items-center">
              <Palette className="w-4 h-4 mr-1.5 text-primary" /> Waiting Room Doodle Board
            </span>
            <span className="text-[10px] text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Live Collaborative
            </span>
          </div>

          {/* Canvas Wrapper */}
          <div className="relative aspect-[16/10] bg-surface-dark/95 border border-white/5 rounded-xl overflow-hidden shadow-inner cursor-crosshair">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-full block"
            />
          </div>

          {/* Drawing Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center space-x-2">
              {DOODLE_COLORS.map((col) => (
                <button
                  key={col.value}
                  onClick={() => setColor(col.value)}
                  className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 active:scale-95 cursor-pointer ${
                    color === col.value ? 'border-primary scale-110 shadow-md' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: col.value }}
                  title={col.name}
                />
              ))}
            </div>

            <div className="flex items-center space-x-4">
              {/* Thickness selector */}
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold text-muted uppercase">Size</span>
                <input
                  type="range"
                  min="2"
                  max="12"
                  value={thickness}
                  onChange={(e) => setThickness(parseInt(e.target.value))}
                  className="w-20 accent-primary cursor-pointer"
                />
              </div>

              {/* Action buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleClear}
                  className="p-2 bg-surface-dark-soft hover:bg-surface-dark border border-white/10 text-on-dark rounded-lg transition-colors cursor-pointer"
                  title="Clear Doodle Canvas"
                >
                  <Eraser className="w-4 h-4" />
                </button>
                <Button
                  onClick={handleSendReaction}
                  size="sm"
                  className="rounded-lg h-8.5 px-3 flex items-center space-x-1 shadow-md shadow-primary/10 active:scale-[0.98] cursor-pointer"
                  title="Send Doodle as Reaction to Call"
                >
                  <Send className="w-3.5 h-3.5 mr-1" />
                  <span>Send Reaction</span>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default WaitingRoom;
