import { useCallback, useEffect, useState } from "react";
import data from "./posters.json";

export interface Question {
  question: string;
  options: string[];
  answer: number;
  hint: string;
  difficulty: string;
}

export interface Poster {
  id: number;
  title: string;
  leads: string;
  posterTitle: string;
  oneLiner: string;
  highlights: string[];
  motif: string;
  links: string[];
  aspect: number;
  questions: Question[];
}

export const POSTERS = data as Poster[];
export const TOTAL_STARS = POSTERS.reduce((n, p) => n + p.questions.length, 0);

const pad = (id: number) => String(id).padStart(2, "0");
export const posterImage = (id: number) => `./posters/${pad(id)}.webp`;
export const posterThumb = (id: number) => `./posters/${pad(id)}-thumb.webp`;
export const posterFrost = (id: number) => `./posters/${pad(id)}-frost.webp`;

/** Per question: the options tried so far, in order. Solved when the last one is the answer. */
export type Progress = Record<string, number[]>;

const STORAGE_KEY = "posterhunt.progress.v1";
const key = (posterId: number, question: number) => `${posterId}:${question}`;

function load(): Progress {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Progress) : {};
  } catch {
    return {};
  }
}

export type StarKind = "gold" | "paper" | "none";

export interface PosterScore {
  stars: StarKind[];
  cleared: boolean;
}

export function scorePoster(poster: Poster, progress: Progress): PosterScore {
  const stars = poster.questions.map((q, i): StarKind => {
    const tries = progress[key(poster.id, i)] ?? [];
    if (tries.at(-1) !== q.answer) return "none";
    return tries.length === 1 ? "gold" : "paper";
  });
  return { stars, cleared: stars.some((s) => s !== "none") };
}

export interface Totals {
  cleared: number;
  gold: number;
  paper: number;
}

export function totals(progress: Progress): Totals {
  const scores = POSTERS.map((p) => scorePoster(p, progress));
  const count = (kind: StarKind) => scores.reduce((n, s) => n + s.stars.filter((x) => x === kind).length, 0);
  return { cleared: scores.filter((s) => s.cleared).length, gold: count("gold"), paper: count("paper") };
}

const RANKS: [atLeast: number, name: string][] = [
  [31, "Knows every window"],
  [24, "Sticky-note scholar"],
  [16, "Flipchart regular"],
  [8, "Poster reader"],
  [1, "Window shopper"],
  [0, "Just arrived"],
];

export const rank = (cleared: number) => RANKS.find(([atLeast]) => cleared >= atLeast)![1];
export const nextRank = (cleared: number) => [...RANKS].reverse().find(([atLeast]) => atLeast > cleared) ?? null;

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch {
      // Private browsing: the game still works for this visit.
    }
  }, [progress]);

  const answer = useCallback((posterId: number, question: number, option: number) => {
    setProgress((current) => {
      const tries = current[key(posterId, question)] ?? [];
      return tries.includes(option) ? current : { ...current, [key(posterId, question)]: [...tries, option] };
    });
  }, []);

  const reset = useCallback(() => setProgress({}), []);
  const triesFor = useCallback((posterId: number, question: number) => progress[key(posterId, question)] ?? [], [progress]);

  return { progress, answer, reset, triesFor };
}
