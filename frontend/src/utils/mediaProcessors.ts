// Client-side Video Processing Utilities for Virtual Backgrounds and Blur
// Uses MediaPipe Selfie Segmentation via dynamic CDN script loading.

let selfieSegmentationPromise: Promise<any> | null = null;

// Dynamically load MediaPipe Selfie Segmentation scripts
const loadSelfieSegmentation = (): Promise<any> => {
  if (selfieSegmentationPromise) return selfieSegmentationPromise;

  selfieSegmentationPromise = new Promise((resolve, reject) => {
    if ((window as any).SelfieSegmentation) {
      resolve((window as any).SelfieSegmentation);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js';
    script.async = true;
    script.onload = () => {
      if ((window as any).SelfieSegmentation) {
        resolve((window as any).SelfieSegmentation);
      } else {
        reject(new Error('MediaPipe SelfieSegmentation not found after script load'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load MediaPipe SelfieSegmentation from CDN'));
    };

    document.head.appendChild(script);

    // Timeout fallback after 5 seconds to prevent hanging
    setTimeout(() => {
      reject(new Error('MediaPipe loading timed out'));
    }, 5000);
  });

  return selfieSegmentationPromise;
};

// Create a static warm office background image template
const createOfficeBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  // Draw a professional corporate background using gradients
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#1e293b'); // slate-800
  grad.addColorStop(1, '#0f172a'); // slate-900
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Draw bookshelves/decor shapes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(width * 0.1, height * 0.1, width * 0.2, height * 0.8);
  ctx.fillRect(width * 0.7, height * 0.2, width * 0.2, height * 0.7);

  // Draw warm ambient ceiling light cones
  const lightGrad = ctx.createRadialGradient(width / 2, 0, 10, width / 2, 0, height / 2);
  lightGrad.addColorStop(0, 'rgba(251, 191, 36, 0.15)'); // Warm amber
  lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = lightGrad;
  ctx.beginPath();
  ctx.moveTo(width / 2 - 100, 0);
  ctx.lineTo(width / 2 + 100, 0);
  ctx.lineTo(width / 2 + 250, height);
  ctx.lineTo(width / 2 - 250, height);
  ctx.closePath();
  ctx.fill();
};

// Create a warm aura gradient background template
const createGradientBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#f43f5e'); // rose-500
  grad.addColorStop(0.5, '#ec4899'); // pink-500
  grad.addColorStop(1, '#8b5cf6'); // violet-500
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
};

export const applyVirtualBackgroundToStream = async (
  rawStream: MediaStream,
  mode: 'none' | 'blur' | 'office' | 'gradient'
): Promise<MediaStream> => {
  if (mode === 'none') return rawStream;

  const videoTrack = rawStream.getVideoTracks()[0];
  if (!videoTrack) return rawStream;

  try {
    const SelfieSegmentationClass = await loadSelfieSegmentation();
    
    // Create elements dynamically
    const video = document.createElement('video');
    video.srcObject = rawStream;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve);
      };
    });

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawStream;

    // Canvas to process background/blur
    const bgCanvas = document.createElement('canvas');
    bgCanvas.width = width;
    bgCanvas.height = height;
    const bgCtx = bgCanvas.getContext('2d');

    const segmenter = new SelfieSegmentationClass({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
    });

    segmenter.setOptions({
      modelSelection: 1, // landscape model for lower latency
    });

    let currentResults: any = null;
    segmenter.onResults((results: any) => {
      currentResults = results;
    });

    let active = true;
    let isTabVisible = true;

    const handleVisibilityChange = () => {
      isTabVisible = document.visibilityState === 'visible';
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Start segmentation loops (Throttled to 15 FPS to optimize CPU usage)
    const sendLoop = async () => {
      const fps = 15;
      const interval = 1000 / fps;
      let lastTime = performance.now();

      while (active && videoTrack.readyState === 'live') {
        if (!isTabVisible) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        const now = performance.now();
        const elapsed = now - lastTime;

        if (elapsed >= interval) {
          try {
            await segmenter.send({ image: video });
            lastTime = now - (elapsed % interval);
          } catch (e) {
            console.error('SelfieSegmentation send error:', e);
          }
        }
        await new Promise((r) => setTimeout(r, Math.max(1, interval - elapsed)));
      }
    };
    sendLoop();

    const drawLoop = () => {
      if (!active || videoTrack.readyState !== 'live') return;

      if (!isTabVisible) {
        setTimeout(drawLoop, 500);
        return;
      }

      if (currentResults && ctx) {
        ctx.save();
        ctx.clearRect(0, 0, width, height);

        // Draw segmented mask to canvas
        ctx.drawImage(currentResults.segmentationMask, 0, 0, width, height);

        // Apply compositing to draw human element only
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(currentResults.image, 0, 0, width, height);

        // Restore compositing to draw background behind user
        ctx.globalCompositeOperation = 'destination-over';

        if (mode === 'blur') {
          if (bgCtx) {
            bgCtx.clearRect(0, 0, width, height);
            bgCtx.filter = 'blur(10px)';
            bgCtx.drawImage(video, 0, 0, width, height);
            ctx.drawImage(bgCanvas, 0, 0, width, height);
          } else {
            ctx.drawImage(video, 0, 0, width, height); // Fallback to normal
          }
        } else if (mode === 'office') {
          createOfficeBackground(ctx, width, height);
        } else if (mode === 'gradient') {
          createGradientBackground(ctx, width, height);
        }

        ctx.restore();
      } else {
        // Fallback: draw raw video if results are not ready yet
        ctx.drawImage(video, 0, 0, width, height);
      }

      requestAnimationFrame(drawLoop);
    };
    drawLoop();

    // Capture processed video stream
    const processedStream = (canvas as any).captureStream(24);
    const processedTrack = processedStream.getVideoTracks()[0];
    
    // Stop segmenter on stream end
    const originalStop = videoTrack.stop.bind(videoTrack);
    videoTrack.stop = () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      originalStop();
      try {
        segmenter.close();
      } catch (e) {}
    };

    processedTrack.addEventListener('ended', () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      try {
        segmenter.close();
      } catch (e) {}
    });

    const newStream = new MediaStream([processedTrack]);
    const audioTrack = rawStream.getAudioTracks()[0];
    if (audioTrack) {
      newStream.addTrack(audioTrack);
    }
    return newStream;

  } catch (err) {
    console.error('Failed to load selfie segmentation, falling back to original stream:', err);
    return rawStream;
  }
};
