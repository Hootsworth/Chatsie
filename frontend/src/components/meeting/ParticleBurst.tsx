import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  rotation?: number;
  rotationSpeed?: number;
  isShape?: boolean;
  shapeText?: string;
}

interface ParticleBurstProps {
  type: string;
  onComplete?: () => void;
}

export const ParticleBurst: React.FC<ParticleBurstProps> = ({ type, onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions based on client bounding rect
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || 200;
    const height = rect.height || 200;

    const particles: Particle[] = [];
    const particleCount = 40;

    // Define themes based on reaction type
    let colors: string[] = ['#ff3d8b', '#ffc700', '#00e5ff', '#ff3d00', '#7b2cbf'];
    let shapeText = '';
    let isEmojiReaction = false;

    if (type === '👍') {
      colors = ['#ffc700', '#ffa200', '#ffeb3b', '#ffffff'];
      shapeText = '👍';
      isEmojiReaction = true;
    } else if (type === 'nod') {
      colors = ['#00e5ff', '#00f5d4', '#e8f0fe', '#34a853'];
      shapeText = '✨';
      isEmojiReaction = true;
    } else if (type === '❤️') {
      colors = ['#ff3d8b', '#ff2a6d', '#ff758f', '#ffffff'];
      shapeText = '❤️';
      isEmojiReaction = true;
    } else if (type === '👏') {
      colors = ['#ffc700', '#ffa200', '#ffffff', '#fa7b17'];
      shapeText = '👏';
      isEmojiReaction = true;
    } else if (type === '😂') {
      colors = ['#ffeb3b', '#ffc700', '#ffa200'];
      shapeText = '😂';
      isEmojiReaction = true;
    } else if (type === '🔥') {
      colors = ['#ff3d00', '#ff9100', '#ffea00', '#d50000'];
      shapeText = '🔥';
      isEmojiReaction = true;
    } else if (type === '🎉') {
      colors = ['#ff3d8b', '#ffc700', '#00e5ff', '#34a853', '#7b2cbf', '#fa7b17'];
      shapeText = '🎉';
      isEmojiReaction = true;
    }

    // Initialize particles starting at the center
    const startX = width / 2;
    const startY = height / 2;

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4.5;
      const isShape = isEmojiReaction && Math.random() < 0.25; // 25% are emojis, rest are particles

      particles.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (type === '🔥' || type === '🎉' ? 1.5 : 0), // fire/party floats upward
        size: isShape ? 12 + Math.random() * 8 : 2 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        isShape,
        shapeText
      });
    }

    let animationId: number;
    let frame = 0;

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      let alive = false;

      particles.forEach((p) => {
        if (p.alpha <= 0) return;

        alive = true;

        // Apply physics
        p.x += p.vx;
        p.y += p.vy;

        // Gravity/drag
        if (type === '🎉') {
          p.vy += 0.08; // heavier falling confetti
          p.vx *= 0.98;
        } else if (type === '🔥') {
          p.vy -= 0.04; // float up
          p.vx += (Math.random() - 0.5) * 0.2; // flicker
        } else {
          p.vy += 0.03; // normal mild gravity
          p.vx *= 0.97;
          p.vy *= 0.97;
        }

        p.alpha -= p.decay;

        if (p.rotation !== undefined && p.rotationSpeed !== undefined) {
          p.rotation += p.rotationSpeed;
        }

        // Draw particle
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);

        if (p.isShape && p.shapeText) {
          ctx.rotate(p.rotation || 0);
          ctx.font = `${p.size}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.shapeText, 0, 0);
        } else {
          // Sleek glowing circle
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          
          // Subtle glow effect for premium look
          ctx.shadowBlur = 10;
          ctx.shadowColor = p.color;
          
          ctx.fill();
        }

        ctx.restore();
      });

      frame++;

      if (alive) {
        animationId = requestAnimationFrame(animate);
      } else {
        if (onComplete) onComplete();
      }
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [type, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-30"
    />
  );
};

export default ParticleBurst;
