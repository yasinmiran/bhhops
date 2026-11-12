import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PAR, PROJECTS, theme } from "./game";

const TYPEAHEAD_MS = 800;
const PARS = PROJECTS.map((p) => p.par);
const optionId = (row: number) => `start-option-${row}`;

/** Row 0 is the random start; the projects follow in order. */
function Row({ row }: { row: number }) {
  if (row === 0) {
    return (
      <>
        <span className="picker-chip picker-any">?</span>
        <span className="picker-name">A random project</span>
        <span className="picker-par">
          par {Math.min(...PARS)} to {Math.max(...PARS)}
        </span>
      </>
    );
  }
  const p = PROJECTS[row - 1];
  return (
    <>
      <span className="picker-chip" style={{ background: theme(p.primary).color }}>
        {p.id}
      </span>
      <span className="picker-name">{p.name}</span>
      <span className={p.par === PAR ? "picker-par picker-best" : "picker-par"}>par {p.par}</span>
    </>
  );
}

interface StartPickerProps {
  /** The project to start from, or null for a random one. */
  value: number | null;
  onChange: (id: number | null) => void;
  /** The id of the element that names the field. */
  labelledBy: string;
}

/** Where to start: a button showing the choice, which opens the list of all projects with the par from each. */
export function StartPicker({ value, onChange, labelledBy }: StartPickerProps) {
  const selected = value === null ? 0 : PROJECTS.findIndex((p) => p.id === value) + 1;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selected);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    document.getElementById(optionId(selected))?.scrollIntoView({ block: "center" });
  }, [open]);

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (row: number) => {
    onChange(row === 0 ? null : PROJECTS[row - 1].id);
    close();
  };
  const go = (row: number) => {
    setActive(row);
    document.getElementById(optionId(row))?.scrollIntoView({ block: "nearest" });
  };

  const onKey = (event: React.KeyboardEvent) => {
    const last = PROJECTS.length;
    const steps: Record<string, number> = { ArrowDown: Math.min(last, active + 1), ArrowUp: Math.max(0, active - 1), Home: 0, End: last };
    if (event.key in steps) {
      event.preventDefault();
      go(steps[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // Typing a number or the start of a name jumps to that project.
      const fresh = event.timeStamp - typed.current.at > TYPEAHEAD_MS;
      const text = (fresh ? "" : typed.current.text) + event.key.toLowerCase();
      typed.current = { text, at: event.timeStamp };
      const hit = PROJECTS.findIndex((p) => String(p.id).startsWith(text) || p.name.toLowerCase().startsWith(text));
      if (hit >= 0) go(hit + 1);
    }
  };

  return (
    <>
      <button ref={trigger} type="button" className="picker" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${labelledBy} start-value`} onClick={show}>
        <span id="start-value" className="picker-row">
          <Row row={selected} />
        </span>
        <span className="picker-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {/* On the body, because the note it belongs to is rotated and would otherwise trap the overlay inside itself. */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div className="picker-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
              <motion.ul
                ref={list}
                className="picker-list"
                role="listbox"
                tabIndex={-1}
                aria-labelledby={labelledBy}
                aria-activedescendant={optionId(active)}
                onKeyDown={onKey}
                onClick={(event) => event.stopPropagation()}
                initial={{ y: 30, rotate: -2 }}
                animate={{ y: 0, rotate: 0 }}
                exit={{ y: 30, opacity: 0 }}
              >
                {Array.from({ length: PROJECTS.length + 1 }, (_, row) => (
                  <li
                    key={row}
                    id={optionId(row)}
                    role="option"
                    aria-selected={row === selected}
                    className={row === active ? "picker-row picker-option picker-active" : "picker-row picker-option"}
                    onClick={() => choose(row)}
                    onPointerMove={(event) => event.pointerType === "mouse" && setActive(row)}
                  >
                    <Row row={row} />
                  </li>
                ))}
              </motion.ul>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
