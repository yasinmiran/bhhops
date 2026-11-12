import { PROJECTS, posterThumb, theme } from "./game";

/** Every project as a plain page, for devices that cannot draw the 3D graph. */
export function Wall({ note, hidden }: { note: string; hidden: boolean }) {
  return (
    <div className="wall-page" inert={hidden}>
      <header className="wall-head">
        <h1>31 Hops</h1>
        <p className="lede">
          The 31 projects of BioHackathon Europe 2026. {note} Tap one to see its poster and the projects it is linked to.
        </p>
      </header>
      <ol className="wall">
        {PROJECTS.map((p, index) => (
          <li key={p.id} className={`sheet tilt-${index % 5}`}>
            <a href={`#/p/${p.id}`}>
              <img src={posterThumb(p.id)} alt="" loading={index < 6 ? "eager" : "lazy"} style={{ aspectRatio: String(p.aspect) }} />
              <span className="sheet-label" style={{ background: theme(p.primary).color }}>
                <strong>{p.id}</strong> {p.name}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
