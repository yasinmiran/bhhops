import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { sound } from "./sound";

const INK = "#1d2433";
const FIRST_VISIT_MS = 9_000;
/** The quiet between one visitor leaving and the next arriving, at least and at most. */
const GAP_MS = [9_000, 20_000];
/** No space bar on a phone, so there the way to scare one off is to tap it. */
const TOUCH = window.matchMedia("(hover: none)").matches;

function Turtle() {
  const skin = "#9ccb4f";
  return (
    <svg viewBox="0 0 210 124" aria-hidden="true">
      <g stroke={INK} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        <g className="critter-shy">
          <path d="M40 84 L16 94 L42 96 Z" fill={skin} />
          <rect className="critter-leg" x="52" y="78" width="20" height="34" rx="9" fill={skin} />
          <rect className="critter-leg critter-leg-off" x="80" y="78" width="20" height="34" rx="9" fill={skin} />
          <rect className="critter-leg critter-leg-off" x="116" y="78" width="20" height="34" rx="9" fill={skin} />
          <rect className="critter-leg" x="142" y="78" width="20" height="34" rx="9" fill={skin} />
          <path d="M156 84 C166 84 168 58 184 56 C200 54 206 70 198 80 C192 88 172 92 156 90 Z" fill={skin} />
          <circle cx="188" cy="67" r="3.4" fill={INK} stroke="none" />
          <path d="M186 79 Q192 81 196 76" fill="none" strokeWidth="3.5" />
        </g>
        <path d="M32 88 C32 22 168 22 168 88 Z" fill="#6fb565" />
        <path d="M66 46 L78 86 M100 37 V86 M134 46 L122 86 M47 68 H153" fill="none" stroke="#3f8f52" strokeWidth="4.5" />
        <path d="M26 88 H174" />
      </g>
    </svg>
  );
}

function Croissant() {
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true">
      <g stroke={INK} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        <rect className="critter-leg" x="74" y="84" width="13" height="40" rx="6" fill={INK} />
        <rect className="critter-leg critter-leg-off" x="113" y="84" width="13" height="40" rx="6" fill={INK} />
        <path d="M12 98 C8 60 40 18 100 18 C160 18 192 60 188 98 C176 80 150 72 100 72 C50 72 24 80 12 98 Z" fill="#eaa94c" />
        <path d="M52 34 Q42 58 50 76 M78 24 Q72 50 78 72 M122 24 Q128 50 122 72 M148 34 Q158 58 150 76" fill="none" stroke="#b5742c" strokeWidth="4.5" />
        <circle cx="90" cy="46" r="3.6" fill={INK} stroke="none" />
        <circle cx="110" cy="46" r="3.6" fill={INK} stroke="none" />
        <path d="M92 56 Q100 63 108 56" fill="none" strokeWidth="3.5" />
      </g>
    </svg>
  );
}

/** A ring-tailed lemur hanging head down by its tail. */
function Lemur() {
  const fur = "#aab0b8";
  const white = "#fbfaf6";
  return (
    <svg viewBox="0 0 160 330" aria-hidden="true">
      <g strokeLinecap="round" strokeLinejoin="round">
        <path d="M80 -6 C100 48 62 100 82 152" fill="none" stroke={INK} strokeWidth="24" />
        <path d="M80 -6 C100 48 62 100 82 152" fill="none" stroke={white} strokeWidth="14" strokeDasharray="15 15" strokeLinecap="butt" />
        <g stroke={INK} strokeWidth="5">
          <path d="M60 214 L46 292 M104 214 L118 292" fill="none" strokeWidth="19" />
          <path d="M60 214 L46 292 M104 214 L118 292" fill="none" stroke={fur} strokeWidth="10" />
          <ellipse cx="82" cy="190" rx="31" ry="44" fill={fur} />
          <ellipse cx="82" cy="198" rx="17" ry="27" fill={white} stroke="none" />
          <ellipse cx="66" cy="150" rx="11" ry="8" fill={fur} />
          <ellipse cx="98" cy="150" rx="11" ry="8" fill={fur} />
          <circle cx="59" cy="281" r="11" fill={fur} />
          <circle cx="105" cy="281" r="11" fill={fur} />
          <circle cx="82" cy="258" r="28" fill={white} />
          <ellipse cx="70" cy="262" rx="9.5" ry="10.5" fill={INK} stroke="none" />
          <ellipse cx="94" cy="262" rx="9.5" ry="10.5" fill={INK} stroke="none" />
          <circle cx="70" cy="263" r="5" fill="#f39130" stroke="none" />
          <circle cx="94" cy="263" r="5" fill="#f39130" stroke="none" />
          <circle cx="70" cy="263" r="2.2" fill={INK} stroke="none" />
          <circle cx="94" cy="263" r="2.2" fill={INK} stroke="none" />
          <ellipse cx="82" cy="243" rx="6.5" ry="5" fill={INK} stroke="none" />
        </g>
      </g>
    </svg>
  );
}

function Spider() {
  return (
    <svg viewBox="0 0 120 96" aria-hidden="true">
      <g stroke={INK} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M44 40 Q20 22 8 34 M42 50 Q16 46 6 60 M44 60 Q24 68 16 86 M50 66 Q40 80 40 92" />
        <path d="M76 40 Q100 22 112 34 M78 50 Q104 46 114 60 M76 60 Q96 68 104 86 M70 66 Q80 80 80 92" />
        <circle cx="60" cy="48" r="25" fill="#9a78c9" />
        <circle cx="51" cy="46" r="7" fill="#fbfaf6" strokeWidth="3" />
        <circle cx="69" cy="46" r="7" fill="#fbfaf6" strokeWidth="3" />
        <circle cx="52" cy="48" r="2.8" fill={INK} stroke="none" />
        <circle cx="68" cy="48" r="2.8" fill={INK} stroke="none" />
        <path d="M54 60 Q60 65 66 60" strokeWidth="3.5" />
      </g>
    </svg>
  );
}

/** Three spiders on threads of different lengths, as a share of the height the group takes. */
const SPIDER_DROPS = [
  { left: "0%", thread: "58%" },
  { left: "36%", thread: "92%" },
  { left: "72%", thread: "36%" },
];

function Spiders({ hint }: { hint: ReactNode }) {
  return (
    <>
      {SPIDER_DROPS.map((drop, i) => (
        <span key={drop.left} className="spider" style={{ left: drop.left, height: drop.thread, animationDelay: `${-0.5 * i}s` }}>
          <Spider />
          {i === 1 && hint}
        </span>
      ))}
    </>
  );
}

/** The ones that cross the screen on foot, and how long the crossing takes. */
const WALKERS = {
  turtle: { art: <Turtle />, seconds: 24, label: "A turtle in the way" },
  croissant: { art: <Croissant />, seconds: 15, label: "A croissant in the way" },
};
/** The ones that come down from the top and hang there, and for how long. */
const HANGERS = {
  lemur: { seconds: 13, label: "A lemur hanging in the way" },
  spiders: { seconds: 12, label: "Spiders hanging in the way" },
};
const ORDER = ["turtle", "lemur", "croissant", "spiders"] as const;

interface Visit {
  kind: (typeof ORDER)[number];
  /** Tells one visit from the next, so a new visitor is a new element and starts from its own edge. */
  nth: number;
  fromLeft: boolean;
  /** Where on the screen it turns up, as a percentage: down the screen for a walker, across it for a hanger. */
  at: number;
}

interface CrittersProps {
  /** A tour is under way and nothing covers the graph. */
  active: boolean;
}

/** Visitors that wander into the way of the graph, one at a time and in turn. The space bar, or a tap, scares off whichever is there. */
export function Critters({ active }: CrittersProps) {
  const still = useReducedMotion();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [scared, setScared] = useState(false);
  const [visits, setVisits] = useState(0);
  const on = active && !still;

  useEffect(() => {
    if (!on) return setVisit(null);
    if (visit) return;
    const wait = visits === 0 ? FIRST_VISIT_MS : GAP_MS[0] + Math.random() * (GAP_MS[1] - GAP_MS[0]);
    const timer = setTimeout(() => {
      const kind = ORDER[visits % ORDER.length];
      sound.visitor();
      setScared(false);
      setVisits(visits + 1);
      setVisit({ kind, nth: visits, fromLeft: Math.random() < 0.5, at: kind in WALKERS ? 28 + Math.random() * 34 : 18 + Math.random() * 46 });
    }, wait);
    return () => clearTimeout(timer);
  }, [on, visit, visits]);

  useEffect(() => {
    if (!visit) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      event.preventDefault();
      if (!scared) sound.shoo();
      setScared(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visit, scared]);

  if (!on || !visit) return null;
  const leave = () => setVisit(null);
  const scare = () => {
    if (!scared) sound.shoo();
    setScared(true);
  };
  const hint = scared ? null : <span className="critter-hint">{TOUCH ? "Tap me" : "Press Space"}</span>;

  if (visit.kind === "turtle" || visit.kind === "croissant") {
    const walker = WALKERS[visit.kind];
    const [from, to, fled] = visit.fromLeft ? ["-30vw", "105vw", "130vw"] : ["105vw", "-30vw", "-55vw"];
    return (
      <motion.button
        key={visit.nth}
        className={`critter walker ${visit.kind}${scared ? " scared" : ""}`}
        style={{ top: `${visit.at}%` }}
        aria-label={`${walker.label}. Scare it off`}
        initial={{ x: from }}
        // Scared, it keeps going the way it was headed, a good deal faster than it walked.
        animate={{ x: scared ? fled : to }}
        transition={scared ? { duration: 0.9, ease: "easeIn" } : { duration: walker.seconds, ease: "linear" }}
        onAnimationComplete={leave}
        onClick={scare}
      >
        <span className="walker-body" style={{ scale: visit.fromLeft ? "1 1" : "-1 1" }}>
          {walker.art}
        </span>
        {hint}
      </motion.button>
    );
  }

  const hanger = HANGERS[visit.kind];
  return (
    <motion.button
      key={visit.nth}
      className={`critter hanger ${visit.kind}`}
      style={{ left: `${visit.at}%` }}
      aria-label={`${hanger.label}. Scare them off`}
      initial={{ y: "-105%" }}
      animate={scared ? { y: "-105%" } : { y: ["-105%", "0%", "0%", "-105%"] }}
      transition={scared ? { duration: 0.3, ease: "easeIn" } : { duration: hanger.seconds, times: [0, 0.07, 0.93, 1], ease: "easeInOut" }}
      onAnimationComplete={leave}
      onClick={scare}
    >
      {visit.kind === "lemur" ? (
        <span className="lemur-swing">
          <Lemur />
          {hint}
        </span>
      ) : (
        <Spiders hint={hint} />
      )}
    </motion.button>
  );
}
