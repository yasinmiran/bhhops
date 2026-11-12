import type { ReactNode } from "react";

/** Marker-drawn pictures for the buttons that have no room for words. */
const PICTURES = {
  board: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0Z" />
      <path d="M8 6H5a3 3 0 0 0 3.2 3.6M16 6h3a3 3 0 0 1-3.2 3.6M12 13v4M8.5 20h7M10 17h4" />
    </>
  ),
  wholeGraph: <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />,
  backToHelix: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  startOver: <path d="M4.5 4.5v5h5M5.2 9.2A8 8 0 1 1 4 12.6" />,
  soundOn: (
    <>
      <path d="M4 10v4h3l5 4V6l-5 4Z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18 6.8a7.5 7.5 0 0 1 0 10.4" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 10v4h3l5 4V6l-5 4Z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

interface IconButtonProps {
  picture: keyof typeof PICTURES;
  /** What the button does, for screen readers and as the tooltip. */
  label: string;
  onClick: () => void;
  pressed?: boolean;
  autoFocus?: boolean;
  /** The tooltip, where it should differ from the label. */
  hint?: string;
}

export function IconButton({ picture, label, onClick, pressed, autoFocus, hint = label }: IconButtonProps) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={hint} aria-pressed={pressed} autoFocus={autoFocus} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {PICTURES[picture]}
      </svg>
    </button>
  );
}
