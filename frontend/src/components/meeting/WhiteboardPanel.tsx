import React, { useRef, useState, useEffect } from 'react';
import { signalingClient } from '../../services/signaling';
import { Trash2, Edit2, Eraser } from 'lucide-react';

export const WhiteboardPanel: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#1a1a1a'); // Default ink
  const [thickness, setThickness] = useState(4);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  
  const lastPos = useRef({ x: 0, y: 0 });

  // Predefined Material-inspired palette colors
  const COLORS = [
    { value: '#1a1a1a', label: 'Ink' },
    { value: '#ea4335', label: 'Red' },
    { value: '#34a853', label: 'Green' },
    { value: '#4285f4', label: 'Blue' },
    { value: '#fbbc05', label: 'Yellow' },
    { value: '#a8c7fa', label: 'Pastel Blue' },
    { value: '#ff6d00', label: 'Orange' },
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
      canvas.height = container.clientHeight - 64; // Offset for Material toolbar height

      // Restore background and contents
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff'; // white background
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
      }
    };

    handleResize();
    // Add a tiny delay to allow parent layout to settle
    const timer = setTimeout(handleResize, 100);

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timer);
    };
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

    if (window.confirm('Clear the shared whiteboard for all participants?')) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      signalingClient.sendClearWhiteboard();
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col bg-[#1e1f20] select-none text-white relative">
      
      {/* Material Expressive Flat Toolbar */}
      <div className="flex items-center justify-between gap-4 px-5 h-16 bg-[#131314] border-b border-white/[0.08] flex-shrink-0">
        
        <div className="flex items-center gap-3">
          {/* Tool Toggles */}
          <div className="flex bg-[#303134] rounded-full p-1 border border-white/[0.04]">
            <button
              onClick={() => setTool('pen')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                tool === 'pen' ? 'bg-[#c4eed0] text-[#072711]' : 'text-white/60 hover:text-white'
              }`}
              title="Pen Draw"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Draw
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                tool === 'eraser' ? 'bg-[#c4eed0] text-[#072711]' : 'text-white/60 hover:text-white'
              }`}
              title="Eraser Tool"
            >
              <Eraser className="w-3.5 h-3.5" />
              Eraser
            </button>
          </div>

          {/* Stroke Width Selector */}
          <div className="flex items-center gap-1.5 bg-[#303134] px-3.5 py-1.5 rounded-full border border-white/[0.04]">
            <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider">Size:</span>
            <select
              value={thickness}
              onChange={(e) => setThickness(Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-white border-none focus:ring-0 focus:outline-none cursor-pointer outline-none"
            >
              <option className="bg-[#202124] text-white" value={2}>Thin (2px)</option>
              <option className="bg-[#202124] text-white" value={4}>Medium (4px)</option>
              <option className="bg-[#202124] text-white" value={8}>Bold (8px)</option>
              <option className="bg-[#202124] text-white" value={15}>Extra Bold (15px)</option>
            </select>
          </div>
        </div>

        {/* Dynamic Color Selector */}
        {tool === 'pen' && (
          <div className="hidden sm:flex items-center gap-2 bg-[#303134] px-4 py-1.5 rounded-full border border-white/[0.04]">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mr-1">Color Palette</span>
            <div className="flex items-center gap-2">
              {COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`w-5 h-5 rounded-full border transition-all cursor-pointer relative ${
                    color === c.value 
                      ? 'scale-110 border-white ring-2 ring-emerald-400/50' 
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        )}

        {/* Actions (Clear canvas) */}
        <div>
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-[#f2b8b5] hover:bg-[#f9dedc] text-[#601410] active:scale-95 font-bold rounded-full transition-all cursor-pointer flex items-center gap-1.5 border-none text-xs"
            title="Clear canvas for everyone"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Canvas
          </button>
        </div>
      </div>

      {/* Grid Canvas Wrapper */}
      <div className="flex-1 relative bg-white overflow-hidden">
        {/* Graph grid paper overlay with clean SVG grid */}
        <div 
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(to right, #000000 1px, transparent 1px),
              linear-gradient(to bottom, #000000 1px, transparent 1px)
            `,
            backgroundSize: '20px 20px'
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
