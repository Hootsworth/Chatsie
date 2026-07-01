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
      canvas.height = container.clientHeight - 60; // Offset for toolbar height

      // Restore background and contents
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff'; // white background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    signalingClient.on('whiteboard-draw', handleRemoteDraw);
    signalingClient.on('whiteboard-clear', handleRemoteClear);

    return () => {
      signalingClient.off('whiteboard-draw', handleRemoteDraw);
      signalingClient.off('whiteboard-clear', handleRemoteClear);
    };
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
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
    const drawColor = tool === 'eraser' ? '#ffffff' : color;
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

    if (window.confirm('Are you sure you want to clear the whiteboard for all participants?')) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      signalingClient.sendClearWhiteboard();
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col bg-[#1a1b1e] rounded-none overflow-hidden select-none">
      
      {/* Dynamic Toolbox (fits in sidebar) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#202124] border-b border-white/[0.08] text-xs">
        
        {/* Toggle Mode */}
        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/[0.04]">
          <button
            onClick={() => setTool('pen')}
            className={`p-1.5 rounded transition-all cursor-pointer ${
              tool === 'pen' ? 'bg-white/10 text-white font-bold' : 'text-white/60 hover:text-white'
            }`}
            title="Pen"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setTool('eraser')}
            className={`p-1.5 rounded transition-all cursor-pointer ${
              tool === 'eraser' ? 'bg-white/10 text-white font-bold' : 'text-white/60 hover:text-white'
            }`}
            title="Eraser"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Thickness Select */}
        <div className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded-lg border border-white/[0.04]">
          <select
            value={thickness}
            onChange={(e) => setThickness(Number(e.target.value))}
            className="bg-transparent text-[10px] font-bold text-white border-none focus:ring-0 focus:outline-none cursor-pointer outline-none"
          >
            <option className="bg-[#202124] text-white" value={2}>2px</option>
            <option className="bg-[#202124] text-white" value={4}>4px</option>
            <option className="bg-[#202124] text-white" value={8}>8px</option>
            <option className="bg-[#202124] text-white" value={15}>15px</option>
          </select>
        </div>

        {/* Trash Clear */}
        <button
          onClick={handleClear}
          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 hover:text-red-300 rounded-lg transition-all cursor-pointer border border-red-500/15"
          title="Clear Whiteboard"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Color Palette Row */}
        {tool === 'pen' && (
          <div className="w-full flex items-center justify-between gap-1.5 pt-1 border-t border-white/[0.04]">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Palette</span>
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-4 h-4 rounded-full border transition-all cursor-pointer relative ${
                    color === c.value ? 'scale-110 border-white ring-1 ring-white/30' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grid Canvas */}
      <div className="flex-1 relative bg-white">
        {/* Graph grid paper overlay using SVG in CSS */}
        <div 
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, #000000 1px, transparent 1px),
              linear-gradient(to bottom, #000000 1px, transparent 1px)
            `,
            backgroundSize: '16px 16px'
          }}
        />
        
        <canvas
          ref={canvasRef}
          onMouseDown={handleStartDraw}
          onMouseMove={handleDraw}
          onMouseUp={handleEndDraw}
          onMouseLeave={handleEndDraw}
          onTouchStart={handleStartDraw}
          onTouchMove={handleDraw}
          onTouchEnd={handleEndDraw}
          className="w-full h-full block cursor-crosshair touch-none relative z-10"
        />
      </div>
    </div>
  );
};

export default WhiteboardPanel;
