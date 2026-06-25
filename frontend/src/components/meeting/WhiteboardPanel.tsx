import React, { useRef, useState, useEffect } from 'react';
import { signalingClient } from '../../services/signaling';
import { Trash2, Edit2, Eraser } from 'lucide-react';

export const WhiteboardPanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#0a0a0a'); // Default ink
  const [thickness, setThickness] = useState(4);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  
  const lastPos = useRef({ x: 0, y: 0 });

  // Predefined palette colors
  const COLORS = [
    { value: '#0a0a0a', label: 'Ink' },
    { value: '#f43f5e', label: 'Rose' },
    { value: '#10b981', label: 'Emerald' },
    { value: '#3b82f6', label: 'Blue' },
    { value: '#eab308', label: 'Yellow' },
    { value: '#6366f1', label: 'Indigo' },
  ];

  // Set up resize handler to keep canvas scaling in sync
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;

      // Save canvas contents before resize
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
      }

      // Resize canvas to fit container
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      // Restore background
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#f9f9f9'; // canvas background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Draw the saved drawing back
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Listen to remote whiteboard events
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const handleRemoteDraw = (data: { x1: number; y1: number; x2: number; y2: number; color: string; thickness: number }) => {
      ctx.beginPath();
      ctx.strokeStyle = data.color;
      ctx.lineWidth = data.thickness;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(data.x1 * canvas.width, data.y1 * canvas.height);
      ctx.lineTo(data.x2 * canvas.width, data.y2 * canvas.height);
      ctx.stroke();
    };

    const handleRemoteClear = () => {
      ctx.fillStyle = '#f9f9f9';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    signalingClient.on('whiteboard-draw', handleRemoteDraw);
    signalingClient.on('whiteboard-clear', handleRemoteClear);

    return () => {
      signalingClient.off('whiteboard-draw', handleRemoteDraw);
      signalingClient.off('whiteboard-clear', handleRemoteClear);
    };
  }, []);

  // Drawing event handlers
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    // Check if TouchEvent or MouseEvent
    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  };

  const drawLine = (x1: number, y1: number, x2: number, y2: number, drawColor: string, drawThickness: number, local: boolean = true) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = drawThickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (local) {
      // Broadcast coordinates normalized as percentages (0 to 1) so it fits other screen sizes correctly!
      signalingClient.sendDraw(
        x1 / canvas.width,
        y1 / canvas.height,
        x2 / canvas.width,
        y2 / canvas.height,
        drawColor,
        drawThickness
      );
    }
  };

  const handleStartDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const pos = getCoordinates(e);
    lastPos.current = pos;
  };

  const handleDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const currentPos = getCoordinates(e);
    
    // Choose color based on active tool (Eraser draws background color)
    const drawColor = tool === 'eraser' ? '#f9f9f9' : color;
    
    drawLine(lastPos.current.x, lastPos.current.y, currentPos.x, currentPos.y, drawColor, thickness);
    lastPos.current = currentPos;
  };

  const handleEndDraw = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#f9f9f9';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Broadcast clear event
    signalingClient.sendClearWhiteboard();
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[350px] bg-canvas rounded-none border border-hairline overflow-hidden flex flex-col shadow-none">
      {/* Tool control bar overlay */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-block-cream border border-hairline px-4 py-2.5 rounded-pill flex items-center space-x-4 z-10 shadow-sm select-none">
        {/* Tool Pen/Eraser Toggle */}
        <div className="flex items-center space-x-1 border-r border-hairline pr-4">
          <button
            onClick={() => setTool('pen')}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              tool === 'pen' ? 'bg-primary text-white' : 'text-ink/70 hover:text-ink hover:bg-hairline'
            }`}
            title="Pen Tool"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
              tool === 'eraser' ? 'bg-primary text-white' : 'text-ink/70 hover:text-ink hover:bg-hairline'
            }`}
            title="Eraser Tool"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>

        {/* Color Palette */}
        {tool === 'pen' && (
          <div className="flex items-center space-x-1.5 border-r border-hairline pr-4">
            {COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setColor(c.value)}
                className={`w-5 h-5 rounded-full border transition-all cursor-pointer relative ${
                  color === c.value ? 'scale-110 border-white ring-2 ring-primary/45' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>
        )}

        {/* Brush Thickness selector */}
        <div className="flex items-center space-x-2 border-r border-hairline pr-4">
          <span className="text-[10px] font-bold text-ink/70">SIZE</span>
          <select
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
            className="bg-transparent text-xs text-ink border-0 focus:ring-0 focus:outline-none cursor-pointer font-bold"
          >
            <option className="bg-canvas text-ink" value={2}>Thin (2px)</option>
            <option className="bg-canvas text-ink" value={4}>Medium (4px)</option>
            <option className="bg-canvas text-ink" value={8}>Thick (8px)</option>
            <option className="bg-canvas text-ink" value={15}>Extra (15px)</option>
          </select>
        </div>

        {/* Clear Action Button */}
        <button
          onClick={handleClear}
          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 hover:text-red-300 rounded-lg transition-all cursor-pointer"
          title="Clear Whiteboard"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={handleStartDraw}
        onMouseMove={handleDraw}
        onMouseUp={handleEndDraw}
        onMouseLeave={handleEndDraw}
        onTouchStart={handleStartDraw}
        onTouchMove={handleDraw}
        onTouchEnd={handleEndDraw}
        className="w-full h-full block cursor-crosshair touch-none"
      />
    </div>
  );
};
