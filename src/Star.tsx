import type { StarKind } from "./game";

const POINTS = "12,1.6 15,8.6 22.6,9.2 16.8,14.2 18.6,21.6 12,17.6 5.4,21.6 7.2,14.2 1.4,9.2 9,8.6";

const LABEL: Record<StarKind, string> = {
  gold: "Gold star: right on the first try",
  paper: "Paper star: right after a wrong guess",
  none: "Not answered yet",
};

export function Star({ kind, slap = false }: { kind: StarKind; slap?: boolean }) {
  return (
    <svg className={`star star-${kind}${slap ? " star-slap" : ""}`} viewBox="0 0 24 24" role="img" aria-label={LABEL[kind]}>
      <polygon points={POINTS} />
    </svg>
  );
}
