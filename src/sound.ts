import { useSyncExternalStore } from "react";

/* Every sound is made on the spot from oscillators and noise, so there are no audio files to fetch. */

const MUTED_KEY = "31hops.muted.v1";
/** C major pentatonic: any run of hops makes a tune and never a wrong note. */
const SCALE = [262, 294, 330, 392, 440, 523, 587, 659, 784, 880];

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => {
  try {
    return localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
})();
const watchers = new Set<() => void>();

/** The audio clock to schedule on, or null while muted or where the browser has no audio. */
function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted) return null;
  try {
    if (!context) {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    }
    // Browsers keep audio asleep until the page has been touched. Anything scheduled meanwhile would wait
    // and then all sound at once, so a sound asked for while asleep is dropped and only wakes the audio up.
    if (context.state !== "running") {
      void context.resume();
      return null;
    }
    return { ctx: context, out: master! };
  } catch {
    return null;
  }
}

interface Tone {
  wave?: OscillatorType;
  from: number;
  /** Where the pitch slides to; stays put if left out. */
  to?: number;
  after?: number;
  length: number;
  level?: number;
}

function tone({ wave = "triangle", from, to = from, after = 0, length, level = 0.22 }: Tone): void {
  const playing = audio();
  if (!playing) return;
  const { ctx, out } = playing;
  const at = ctx.currentTime + after;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(from, at);
  if (to !== from) oscillator.frequency.exponentialRampToValueAtTime(to, at + length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(out);
  oscillator.start(at);
  oscillator.stop(at + length + 0.03);
}

/** A puff of filtered noise: paper, a pop, a rustle. */
function puff({ after = 0, length, level = 0.3, pitch }: { after?: number; length: number; level?: number; pitch: number }): void {
  const playing = audio();
  if (!playing) return;
  const { ctx, out } = playing;
  const at = ctx.currentTime + after;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = pitch;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(level, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(gain).connect(out);
  source.start(at);
}

export const sound = {
  /** A hop to a project already visited. */
  hop: () => tone({ from: 196, to: 174, length: 0.11, level: 0.16 }),
  /** A hop to a new project: one note up the scale for each one found. */
  discover: (found: number) => {
    const note = SCALE[(found - 1) % SCALE.length];
    tone({ from: note, length: 0.2 });
    tone({ from: note * 2, after: 0.07, length: 0.24, level: 0.1, wave: "sine" });
  },
  /** An arrow with no thread behind it. */
  bump: () => tone({ wave: "square", from: 110, to: 82, length: 0.09, level: 0.07 }),
  /** A project's sheet sliding up, or back down. */
  page: () => puff({ length: 0.16, level: 0.12, pitch: 2400 }),
  /** Something has wandered into the way. */
  visitor: () => {
    tone({ wave: "sine", from: 330, to: 660, length: 0.14, level: 0.14 });
    tone({ wave: "sine", from: 660, to: 440, after: 0.14, length: 0.16, level: 0.14 });
  },
  /** It has been scared off. */
  shoo: () => tone({ wave: "sawtooth", from: 300, to: 1500, length: 0.28, level: 0.07 }),
  /** Into a wormhole and out somewhere else. */
  warp: () => {
    tone({ wave: "sine", from: 220, to: 1760, length: 0.5, level: 0.16 });
    tone({ wave: "triangle", from: 1760, to: 330, after: 0.5, length: 0.55, level: 0.14 });
    puff({ after: 0.1, length: 0.8, level: 0.08, pitch: 3200 });
  },
  /** Into the black hole. */
  oblivion: () => {
    tone({ wave: "sawtooth", from: 440, to: 28, length: 1.5, level: 0.16 });
    tone({ wave: "sine", from: 110, to: 30, after: 0.2, length: 1.6, level: 0.2 });
    puff({ after: 0.1, length: 1.4, level: 0.1, pitch: 300 });
  },
  /** All 31: a party popper, then a fanfare with the paper still coming down. */
  finale: () => {
    puff({ length: 0.09, level: 0.9, pitch: 900 });
    tone({ wave: "square", from: 180, to: 60, length: 0.1, level: 0.2 });
    puff({ after: 0.05, length: 0.9, level: 0.16, pitch: 5200 });
    [523, 659, 784, 1047].forEach((note, i) => tone({ from: note, after: 0.16 + i * 0.12, length: i === 3 ? 0.7 : 0.2, level: 0.2 }));
    for (let i = 0; i < 9; i++) tone({ wave: "sine", from: 1400 + Math.random() * 1800, after: 0.3 + Math.random() * 0.9, length: 0.08, level: 0.05 });
  },
};

function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTED_KEY, next ? "1" : "0");
  } catch {
    // Private browsing: the choice lasts for this visit.
  }
  watchers.forEach((notify) => notify());
}

/** Whether sound is off, and the switch for it. The choice is kept on the device. */
export function useMuted(): [boolean, () => void] {
  const now = useSyncExternalStore(
    (notify) => {
      watchers.add(notify);
      return () => watchers.delete(notify);
    },
    () => muted,
  );
  return [now, () => setMuted(!now)];
}
