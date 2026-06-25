let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export const SOUND_DEFINITIONS = [
  { id: 'coin', name: 'Coin (Mario)', key: '1' },
  { id: 'jump', name: 'Jump (Retro)', key: '2' },
  { id: 'laser', name: 'Laser (Sci-Fi)', key: '3' },
  { id: 'powerup', name: 'Power Up (RPG)', key: '4' },
  { id: 'alert', name: 'Alert (MGS "!")', key: '5' },
  { id: 'bassdrop', name: 'Bass Drop (Boom)', key: '6' },
  { id: 'trombone', name: 'Sad Trombone', key: '7' },
  { id: 'airhorn', name: 'Airhorn (Hype)', key: '8' }
] as const;

export type SoundId = typeof SOUND_DEFINITIONS[number]['id'];

export function playSynthesizedSound(soundId: string) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    switch (soundId) {
      case 'coin': {
        // Two quick square wave notes
        const playTone = (freq: number, start: number, duration: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(freq, start);
          gain.gain.setValueAtTime(0.08, start);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + duration);
        };
        playTone(987.77, now, 0.08); // B5
        playTone(1318.51, now + 0.08, 0.25); // E6
        break;
      }

      case 'jump': {
        // Triangle wave sweeping up
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(650, now + 0.16);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }

      case 'laser': {
        // Descending sawtooth wave sweep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.13);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.13);
        break;
      }

      case 'powerup': {
        // Ascending triangle wave arpeggio (C4, E4, G4, C5)
        const notes = [261.63, 329.63, 392.00, 523.25];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.075);
          gain.gain.setValueAtTime(0.08, now + idx * 0.075);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.075 + 0.18);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.075);
          osc.stop(now + idx * 0.075 + 0.18);
        });
        break;
      }

      case 'alert': {
        // Sharp dual-pulse square wave transient
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(1050, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.setValueAtTime(0, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 0.07);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }

      case 'bassdrop': {
        // Low sine sweep to sub-bass
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 1.2);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.2);
        break;
      }

      case 'trombone': {
        // Four descending brassy flatting notes
        const notes = [261.63, 246.94, 233.08, 220.00];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          const start = now + idx * 0.23;
          osc.frequency.setValueAtTime(freq, start);
          if (idx === 3) {
            // slide flat
            osc.frequency.linearRampToValueAtTime(190, start + 0.55);
          }
          gain.gain.setValueAtTime(0.06, start);
          gain.gain.linearRampToValueAtTime(0.0001, start + (idx === 3 ? 0.55 : 0.21));
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(start);
          osc.stop(start + (idx === 3 ? 0.55 : 0.23));
        });
        break;
      }

      case 'airhorn': {
        // Thick, detuned sawtooth clusters
        const freqs = [311.13, 316.50, 321.00, 622.25, 630.00];
        freqs.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          
          // Triple-pulse airhorn rhythm
          gain.gain.setValueAtTime(0.03, now);
          gain.gain.setValueAtTime(0.001, now + 0.08);
          gain.gain.setValueAtTime(0.03, now + 0.1);
          gain.gain.setValueAtTime(0.001, now + 0.18);
          gain.gain.setValueAtTime(0.03, now + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.5);
        });
        break;
      }

      default:
        console.warn(`Unknown sound id: ${soundId}`);
    }
  } catch (error) {
    console.error('Failed to play synthesized sound:', error);
  }
}
