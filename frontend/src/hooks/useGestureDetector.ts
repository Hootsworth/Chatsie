import { useEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import { useLocalParticipant } from '@livekit/components-react';
import { signalingClient } from '../services/signaling';

interface Centroid {
  x: number;
  y: number;
}

export const useGestureDetector = (enabled: boolean, debugCanvasRef?: React.RefObject<HTMLCanvasElement | null>) => {
  const { localParticipant } = useLocalParticipant();
  const [isNodding, setIsNodding] = useState(false);
  const [isThumbsUp, setIsThumbsUp] = useState(false);
  const [centroid, setCentroid] = useState<Centroid | null>(null);

  const loopRef = useRef<number | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Heuristics history state
  const yHistoryRef = useRef<number[]>([]);
  const nodStateRef = useRef<'idle' | 'down'>('idle');
  const nodTimestampRef = useRef<number>(0);
  const nodCooldownRef = useRef<number>(0);

  // Thumbs up tracking state
  const bottomClusterHistoryRef = useRef<number[]>([]);
  const thumbsUpCooldownRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
        loopRef.current = null;
      }
      setCentroid(null);
      return;
    }

    // Set up hidden elements for processing
    if (!videoElementRef.current) {
      videoElementRef.current = document.createElement('video');
      videoElementRef.current.muted = true;
      videoElementRef.current.setAttribute('playsinline', '');
    }

    if (!analysisCanvasRef.current) {
      analysisCanvasRef.current = document.createElement('canvas');
      analysisCanvasRef.current.width = 64;
      analysisCanvasRef.current.height = 48;
    }

    const video = videoElementRef.current;
    const canvas = analysisCanvasRef.current;
    const ctx = canvas.getContext('2d');

    let activeStream: MediaStream | null = null;

    const startTracking = async () => {
      try {
        // Try to get track from LiveKit local camera first
        const localVideoTrack = localParticipant?.getTrackPublication(Track.Source.Camera)?.videoTrack;
        let streamTrack = localVideoTrack?.mediaStreamTrack;

        if (!streamTrack) {
          // Fallback: request standard camera directly
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: 'user' }
          });
          activeStream = fallbackStream;
          streamTrack = fallbackStream.getVideoTracks()[0];
        }

        if (streamTrack) {
          video.srcObject = new MediaStream([streamTrack]);
          video.play().catch(() => {});
        }
      } catch (err) {
        console.warn('Gesture detector camera access failed:', err);
      }
    };

    startTracking();

    // Start detection loop
    const runDetection = () => {
      if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
        // Draw frame to small canvas
        ctx.drawImage(video, 0, 0, 64, 48);
        const imgData = ctx.getImageData(0, 0, 64, 48);
        const data = imgData.data;

        let skinCount = 0;
        let sumX = 0;
        let sumY = 0;

        let minX = 64, maxX = 0, minY = 48, maxY = 0;
        let bottomSkinCount = 0;

        // Loop through pixels
        for (let y = 0; y < 48; y++) {
          for (let x = 0; x < 64; x++) {
            const idx = (y * 64 + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Skin tone color heuristic (famous RGB skin classifier)
            const isSkin =
              r > 80 &&
              g > 30 &&
              b > 15 &&
              r - g > 15 &&
              r > g &&
              r > b &&
              Math.max(r, g, b) - Math.min(r, g, b) > 15;

            if (isSkin) {
              skinCount++;
              sumX += x;
              sumY += y;

              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;

              // Track skin pixels in the bottom 45% of the frame (potential hand)
              if (y > 26) {
                bottomSkinCount++;
              }
            }
          }
        }

        const now = Date.now();

        if (skinCount > 80) {
          const cx = sumX / skinCount;
          const cy = sumY / skinCount;
          setCentroid({ x: cx / 64, y: cy / 48 });

          // Nod detection logic
          yHistoryRef.current.push(cy);
          if (yHistoryRef.current.length > 25) {
            yHistoryRef.current.shift();
          }

          // Calculate running average of vertical position (baseline)
          const baselineY =
            yHistoryRef.current.reduce((sum, val) => sum + val, 0) /
            yHistoryRef.current.length;

          // Detect nod down phase
          if (
            nodStateRef.current === 'idle' &&
            cy - baselineY > 3.0 && // Head moved down significantly in screen space
            now - nodCooldownRef.current > 1800
          ) {
            nodStateRef.current = 'down';
            nodTimestampRef.current = now;
          }

          // Detect nod return phase
          if (nodStateRef.current === 'down') {
            const timeDiff = now - nodTimestampRef.current;
            if (timeDiff > 800) {
              nodStateRef.current = 'idle'; // Timed out
            } else if (cy - baselineY < 0.8 && timeDiff > 180) {
              // Head returned to center
              setIsNodding(true);
              signalingClient.sendReaction('nod');
              nodCooldownRef.current = now;
              nodStateRef.current = 'idle';
              setTimeout(() => setIsNodding(false), 1200);
            }
          }

          // Thumbs Up detection logic
          // A thumbs up gesture shows a rising cluster of skin pixels in the lower half of the screen
          bottomClusterHistoryRef.current.push(bottomSkinCount);
          if (bottomClusterHistoryRef.current.length > 15) {
            bottomClusterHistoryRef.current.shift();
          }

          const avgBottomSkin =
            bottomClusterHistoryRef.current.reduce((sum, val) => sum + val, 0) /
            bottomClusterHistoryRef.current.length;

          // If bottom skin count suddenly spikes and we are not in cooldown
          if (
            bottomSkinCount > 90 &&
            avgBottomSkin < 30 &&
            now - thumbsUpCooldownRef.current > 2000
          ) {
            setIsThumbsUp(true);
            signalingClient.sendReaction('👍');
            thumbsUpCooldownRef.current = now;
            setTimeout(() => setIsThumbsUp(false), 1200);
          }
        }

        // Draw debug overlay if debug canvas ref is active
        const debugCanvas = debugCanvasRef?.current;
        if (debugCanvas) {
          const debugCtx = debugCanvas.getContext('2d');
          if (debugCtx) {
            // Draw camera input resized to fit debug canvas
            debugCtx.drawImage(video, 0, 0, debugCanvas.width, debugCanvas.height);

            if (skinCount > 80) {
              const cxReal = (sumX / skinCount) * (debugCanvas.width / 64);
              const cyReal = (sumY / skinCount) * (debugCanvas.height / 48);

              // Draw skin tone bounding box
              debugCtx.strokeStyle = '#00f5d4';
              debugCtx.lineWidth = 2;
              debugCtx.strokeRect(
                minX * (debugCanvas.width / 64),
                minY * (debugCanvas.height / 48),
                (maxX - minX) * (debugCanvas.width / 64),
                (maxY - minY) * (debugCanvas.height / 48)
              );

              // Draw face centroid dot
              debugCtx.fillStyle = '#ff3d8b';
              debugCtx.beginPath();
              debugCtx.arc(cxReal, cyReal, 6, 0, Math.PI * 2);
              debugCtx.fill();

              // Draw trace path lines
              debugCtx.fillStyle = 'rgba(0, 229, 255, 0.4)';
              debugCtx.font = '10px Courier';
              debugCtx.fillText(
                `Centroid: (${Math.round(cxReal)}, ${Math.round(cyReal)})`,
                10,
                20
              );
              debugCtx.fillText(`Skin pixels: ${skinCount}`, 10, 35);
              debugCtx.fillText(`State: ${nodStateRef.current.toUpperCase()}`, 10, 50);

              if (nodStateRef.current === 'down') {
                debugCtx.fillStyle = '#ffc700';
                debugCtx.fillText('NOD PITCH DETECTED', 10, 65);
              }
            } else {
              debugCtx.fillStyle = 'rgba(239, 68, 68, 0.7)';
              debugCtx.font = '10px Courier';
              debugCtx.fillText('No Face Detected in range', 10, 20);
            }
          }
        }
      }

      loopRef.current = requestAnimationFrame(runDetection);
    };

    loopRef.current = requestAnimationFrame(runDetection);

    return () => {
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
      }
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [enabled, localParticipant, debugCanvasRef]);

  return { isNodding, isThumbsUp, centroid };
};
