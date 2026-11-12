import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EDGES, PROJECTS, THEMES, edgeKey, posterThumb, project, theme, type Direction, type Project, type Run } from "./game";

const PAPER = "#f4f3ee";
const INK = "#1d2433";
const PINK = "#ee3f6c";
const UNWALKED = "#c3c6cb";
const NOTE_SIZE = 1.55;
const NOTE_COLORS = ["#b9d531", "#f6d94a", "#f39130", "#ee3f6c", "#2f8fce"];
const HOP_SECONDS = 0.55;
const HAND = '"Shantell Sans Variable", cursive';

const position = (p: Project) => new THREE.Vector3(p.x, p.y, p.z);

/** Deterministic noise, so tilts and confetti look the same on every device. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const fontsReady = () => document.fonts.load(`800 64px ${HAND}`).catch(() => undefined);

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Breaks a name into at most three lines that fit the note. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    const candidate = lines.length ? `${lines.at(-1)} ${word}` : word;
    if (lines.length && ctx.measureText(candidate).width <= maxWidth) lines[lines.length - 1] = candidate;
    else lines.push(word);
  }
  return lines.slice(0, 3);
}

function noteTexture(p: Project): THREE.CanvasTexture {
  return canvasTexture(320, 320, (ctx) => {
    ctx.fillStyle = theme(p.primary).color;
    ctx.fillRect(0, 0, 320, 320);
    // The darker strip where a sticky note's glue is.
    ctx.fillStyle = "rgba(29, 36, 51, 0.07)";
    ctx.fillRect(0, 0, 320, 44);
    ctx.fillStyle = INK;
    ctx.textBaseline = "alphabetic";
    ctx.font = `800 104px ${HAND}`;
    ctx.fillText(String(p.id), 22, 132);
    // A long single word ("MiCoKnowGraph") shrinks to fit instead of running off the edge.
    let size = 40;
    const widest = () => Math.max(...p.name.split(/\s+/).map((word) => ctx.measureText(word).width));
    for (ctx.font = `700 ${size}px ${HAND}`; size > 26 && widest() > 280; ctx.font = `700 ${size}px ${HAND}`) size -= 2;
    wrap(ctx, p.name, 280).forEach((line, i) => ctx.fillText(line, 22, 196 + i * (size + 6)));
  });
}

function labelTexture(text: string): { texture: THREE.CanvasTexture; aspect: number } {
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = `800 120px ${HAND}`;
  const width = Math.ceil(probe.measureText(text).width) + 40;
  return {
    aspect: width / 160,
    texture: canvasTexture(width, 160, (ctx) => {
      ctx.font = `800 120px ${HAND}`;
      ctx.fillStyle = INK;
      ctx.textBaseline = "middle";
      ctx.fillText(text, 20, 84);
    }),
  };
}

const ARROW_GLYPH: Record<Direction, string> = { up: "↑", right: "→", down: "↓", left: "←" };

function arrowTexture(direction: Direction): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "800 76px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(ARROW_GLYPH[direction], 64, 68);
  });
}

/** Faint squares, like the flipchart paper the posters were drawn on. */
function gridTexture(): THREE.CanvasTexture {
  const texture = canvasTexture(128, 128, (ctx) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(47, 143, 206, 0.16)";
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 128, 128);
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(90, 90);
  return texture;
}

const starShape = (() => {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? 1 : 0.45;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    else shape.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
})();

const HELIX = { turns: 1.25, height: 1.5, radius: 0.3, rungs: 6 };
const BLUE = "#2f8fce";

/** Where a strand is at t along the helix; the second strand runs half a turn behind the first. */
function helixPoint(t: number, phase: number): THREE.Vector3 {
  const angle = t * HELIX.turns * Math.PI * 2 + phase;
  return new THREE.Vector3(Math.cos(angle) * HELIX.radius, (t - 0.5) * HELIX.height, Math.sin(angle) * HELIX.radius);
}

function strandGeometry(phase: number, thickness: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => helixPoint(i / 32, phase)));
  return new THREE.TubeGeometry(curve, 48, thickness, 8);
}

const STRANDS = [
  { color: PINK, fill: strandGeometry(0, 0.075), outline: strandGeometry(0, 0.11) },
  { color: BLUE, fill: strandGeometry(Math.PI, 0.075), outline: strandGeometry(Math.PI, 0.11) },
];
const rungGeometry = new THREE.CylinderGeometry(0.035, 0.035, HELIX.radius * 2, 6);
const RUNGS = Array.from({ length: HELIX.rungs }, (_, i) => {
  const t = (i + 0.5) / HELIX.rungs;
  return { y: (t - 0.5) * HELIX.height, angle: t * HELIX.turns * Math.PI * 2 };
});

const textureLoader = new THREE.TextureLoader();

/** The poster photo, fetched the first time a project is visited. */
function usePhoto(id: number, wanted: boolean): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    textureLoader.loadAsync(posterThumb(id)).then(
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        loaded = t;
        if (alive) setTexture(t);
        else t.dispose();
      },
      (error) => console.error(`poster ${id} failed to load:`, error),
    );
    return () => {
      alive = false;
      loaded?.dispose();
    };
  }, [id, wanted]);
  return texture;
}

const CONFETTI = 40;
const confettiGeometry = new THREE.PlaneGeometry(0.11, 0.11);

/** A handful of sticky notes thrown up the first time a project is reached. */
function Confetti() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const age = useRef(0);
  const pieces = useMemo(() => {
    const random = seeded(7);
    return Array.from({ length: CONFETTI }, () => ({
      vx: (random() - 0.5) * 3.4,
      vy: 1.4 + random() * 2.6,
      vz: 0.4 + random() * 1.6,
      spin: (random() - 0.5) * 12,
      color: new THREE.Color(NOTE_COLORS[Math.floor(random() * NOTE_COLORS.length)]),
    }));
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useEffect(() => {
    pieces.forEach((piece, i) => mesh.current?.setColorAt(i, piece.color));
    if (mesh.current?.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [pieces]);

  useFrame((_, dt) => {
    if (!mesh.current || age.current > 3) return;
    age.current += dt;
    const t = age.current;
    pieces.forEach((piece, i) => {
      dummy.position.set(piece.vx * t, piece.vy * t - 2 * t * t, 0.3 + piece.vz * t);
      dummy.rotation.set(piece.spin * t, piece.spin * t * 0.7, piece.spin * t * 0.4);
      dummy.scale.setScalar(t > 3 ? 0 : 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[confettiGeometry, undefined, CONFETTI]} frustumCulled={false}>
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

interface NoteProps {
  p: Project;
  state: "current" | "visited" | "reachable" | "far";
  celebrate: boolean;
  textures: Map<number, THREE.CanvasTexture>;
  onTap: (id: number) => void;
}

function ProjectNote({ p, state, celebrate, textures, onTap }: NoteProps) {
  const group = useRef<THREE.Group>(null);
  const seen = state === "current" || state === "visited";
  const photo = usePhoto(p.id, seen);
  const tilt = useMemo(() => (seeded(p.id * 97)() - 0.5) * 0.16, [p.id]);
  const map = textures.get(p.id) ?? null;
  const photoHeight = 1.9;
  const photoWidth = Math.min(2.5, photoHeight * p.aspect);

  useFrame((_, dt) => {
    if (!group.current) return;
    const goal = state === "current" ? 1.18 : 1;
    group.current.scale.setScalar(group.current.scale.x + (goal - group.current.scale.x) * (1 - Math.exp(-8 * dt)));
  });

  const tap = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // A swipe that ends on a note is a move, not a tap.
    if (event.delta < 8) onTap(p.id);
  };

  return (
    <group ref={group} position={[p.x, p.y, p.z]}>
      {photo && (
        <mesh position={[NOTE_SIZE * 0.55, NOTE_SIZE * 0.45, -0.08]} rotation-z={-tilt * 1.6}>
          <planeGeometry args={[photoWidth, photoWidth / p.aspect]} />
          <meshBasicMaterial map={photo} toneMapped={false} />
        </mesh>
      )}
      <group rotation-z={tilt}>
        {/* The shadow under a note whose bottom edge has lifted. */}
        <mesh position={[0.05, -0.09, -0.02]}>
          <planeGeometry args={[NOTE_SIZE, NOTE_SIZE]} />
          <meshBasicMaterial color={INK} transparent opacity={0.16} depthWrite={false} />
        </mesh>
        <mesh onClick={tap}>
          <planeGeometry args={[NOTE_SIZE, NOTE_SIZE]} />
          {/* Keyed: a material compiled without a texture does not pick one up later. */}
          <meshBasicMaterial key={map ? "drawn" : "blank"} map={map} color={seen || state === "reachable" ? "#ffffff" : "#d9d9d9"} toneMapped={false} />
        </mesh>
        {state === "current" && (
          <mesh position-z={0.01}>
            <ringGeometry args={[NOTE_SIZE * 0.82, NOTE_SIZE * 0.88, 48]} />
            <meshBasicMaterial color="#d8412f" toneMapped={false} />
          </mesh>
        )}
        {seen && (
          <group position={[NOTE_SIZE / 2 - 0.16, -NOTE_SIZE / 2 + 0.16, 0.02]} rotation-z={0.2} scale={0.2}>
            <mesh geometry={starShape} scale={1.25}>
              <meshBasicMaterial color={INK} />
            </mesh>
            <mesh geometry={starShape} position-z={0.01}>
              <meshBasicMaterial color="#f5b921" toneMapped={false} />
            </mesh>
          </group>
        )}
      </group>
      {celebrate && <Confetti />}
    </group>
  );
}

/** One thread between two notes, sagging slightly away from the viewer. */
function Thread({ a, b, color, radius }: { a: Project; b: Project; color: string; radius: number }) {
  const geometry = useMemo(() => {
    const from = position(a);
    const to = position(b);
    const middle = from.clone().lerp(to, 0.5);
    middle.z -= 0.5;
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, middle, to), 16, radius, 5);
  }, [a, b, radius]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position-z={-0.12}>
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

interface Travel {
  from: THREE.Vector3;
  to: THREE.Vector3;
  progress: number;
}

interface RigProps {
  run: Run;
  overview: boolean;
  extent: number;
}

/** Flies the helix along the thread on every hop and keeps the camera on it. */
function HelixAndCamera({ run, overview, extent }: RigProps) {
  const helix = useRef<THREE.Group>(null);
  const twist = useRef<THREE.Group>(null);
  const travel = useRef<Travel>({ from: position(project(run.current)), to: position(project(run.current)), progress: 1 });
  const focus = useRef(position(project(run.current)));
  const distance = useRef(12);
  const at = useRef(position(project(run.current)));
  const { camera, size, scene } = useThree();

  useEffect(() => {
    travel.current = { from: at.current.clone(), to: position(project(run.current)), progress: 0 };
  }, [run.current]);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = travel.current;
    t.progress = Math.min(1, t.progress + dt / HOP_SECONDS);
    const eased = t.progress * t.progress * (3 - 2 * t.progress);
    at.current.lerpVectors(t.from, t.to, eased);
    const arc = Math.sin(eased * Math.PI) * 1.1;

    if (helix.current && twist.current) {
      // The helix stands on the note's corner, so it flies corner to corner and never snaps to the middle.
      const resting = t.progress >= 1;
      helix.current.position.set(
        at.current.x - NOTE_SIZE * 0.52,
        at.current.y + NOTE_SIZE * 0.68 + (resting ? Math.sin(clock.elapsedTime * 3) * 0.05 : 0),
        at.current.z + 0.5 + arc,
      );
      // It always turns about its own axis, and winds up two extra turns over a hop.
      twist.current.rotation.y = clock.elapsedTime * 1.4 + eased * Math.PI * 4;
    }

    const portrait = size.width / size.height < 0.9;
    const perspective = camera as THREE.PerspectiveCamera;
    const closeUp = portrait ? 15 : 11;
    // Far enough back that the whole graph fits whichever way the screen is turned.
    const whole = (extent / 2 / Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2))) * (portrait ? 1 / perspective.aspect : 1) * (portrait ? 1.25 : 1.4);
    const goalDistance = overview ? whole : closeUp;
    // In the whole-graph view the centre moves up a little, clear of the card and arrow pad.
    const goalFocus = overview ? new THREE.Vector3(0, -extent * (portrait ? 0.06 : 0.13), 0) : at.current;
    const ease = 1 - Math.exp(-4.5 * dt);
    focus.current.lerp(goalFocus, ease);
    distance.current += (goalDistance - distance.current) * ease;

    // The camera trails the helix a little, which is what makes the layers slide past each other.
    const lean = overview ? 0 : distance.current * 0.12;
    perspective.position.lerp(new THREE.Vector3(focus.current.x, focus.current.y - lean, focus.current.z + distance.current), ease);
    perspective.lookAt(focus.current.x, focus.current.y, focus.current.z);

    // Measured from where the camera is, not where it is heading: it lags, and fog set
    // for the destination would hide the whole graph for the length of the flight.
    if (scene.fog instanceof THREE.Fog) {
      const seen = perspective.position.distanceTo(focus.current);
      scene.fog.near = seen + 4;
      scene.fog.far = seen + 26;
    }
  });

  return (
    <group ref={helix} rotation-z={-0.3} scale={0.8}>
      <group ref={twist}>
        {STRANDS.map((strand) => (
          <group key={strand.color}>
            <mesh geometry={strand.fill}>
              <meshBasicMaterial color={strand.color} toneMapped={false} />
            </mesh>
            {/* A fatter copy seen only from inside draws the marker outline around the strand. */}
            <mesh geometry={strand.outline}>
              <meshBasicMaterial color={INK} side={THREE.BackSide} />
            </mesh>
          </group>
        ))}
        {RUNGS.map((rung) => (
          <mesh key={rung.y} geometry={rungGeometry} position-y={rung.y} rotation={[0, -rung.angle, Math.PI / 2]}>
            <meshBasicMaterial color={INK} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function ArrowHints({ run }: { run: Run }) {
  const textures = useMemo(
    () => ({ up: arrowTexture("up"), right: arrowTexture("right"), down: arrowTexture("down"), left: arrowTexture("left") }),
    [],
  );
  useEffect(() => () => Object.values(textures).forEach((t) => t.dispose()), [textures]);
  const here = project(run.current);

  return (
    <>
      {(Object.keys(textures) as Direction[]).map((direction) => {
        const to = here.arrows[direction];
        if (to === null) return null;
        const target = project(to);
        const towards = new THREE.Vector3(target.x - here.x, target.y - here.y, 0).normalize();
        return (
          <mesh key={direction} position={[here.x + towards.x * 1.75, here.y + towards.y * 1.75, here.z + 0.3]}>
            <planeGeometry args={[0.62, 0.62]} />
            <meshBasicMaterial map={textures[direction]} transparent toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}

function ThemeLabels() {
  const [labels, setLabels] = useState<{ id: string; x: number; y: number; texture: THREE.CanvasTexture; aspect: number }[]>([]);
  useEffect(() => {
    let alive = true;
    let made: THREE.CanvasTexture[] = [];
    void fontsReady().then(() => {
      if (!alive) return;
      const next = THEMES.filter((t) => t.x !== null && t.y !== null).map((t) => ({ id: t.id, x: t.x!, y: t.y!, ...labelTexture(t.label) }));
      made = next.map((label) => label.texture);
      setLabels(next);
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, []);

  return (
    <>
      {labels.map((label) => (
        <mesh key={label.id} position={[label.x, label.y, -2.6]} rotation-z={-0.04}>
          <planeGeometry args={[1.5 * label.aspect, 1.5]} />
          <meshBasicMaterial map={label.texture} transparent opacity={0.16} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

interface GraphProps {
  run: Run;
  overview: boolean;
  onMove: (direction: Direction) => void;
  onTap: (id: number) => void;
}

const SWIPE_PIXELS = 34;
/** How far off a thread's direction a swipe may be and still count as meaning that thread. */
const SWIPE_TOLERANCE = (70 * Math.PI) / 180;

export function Graph3D({ run, overview, onMove, onTap }: GraphProps) {
  const [noteTextures, setNoteTextures] = useState<Map<number, THREE.CanvasTexture>>(new Map());
  const grid = useMemo(gridTexture, []);
  const down = useRef<{ x: number; y: number } | null>(null);
  // Projects reached during this visit; only those get confetti, not the ones restored from a saved game.
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const known = useRef(new Set(run.visited));

  useEffect(() => {
    const added = run.visited.filter((id) => !known.current.has(id));
    known.current = new Set(run.visited);
    if (run.visited.length <= 1) setFresh(new Set());
    else if (added.length) setFresh((old) => new Set([...old, ...added]));
  }, [run.visited]);

  useEffect(() => {
    let alive = true;
    let made: THREE.CanvasTexture[] = [];
    void fontsReady().then(() => {
      if (!alive) return;
      const next = new Map(PROJECTS.map((p) => [p.id, noteTexture(p)]));
      made = [...next.values()];
      setNoteTextures(next);
    });
    return () => {
      alive = false;
      made.forEach((t) => t.dispose());
    };
  }, []);
  useEffect(() => () => grid.dispose(), [grid]);

  const extent = useMemo(() => Math.max(...PROJECTS.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])) * 2 + 5, []);
  const here = project(run.current);
  const reachable = new Set(Object.values(here.arrows).filter((id): id is number => id !== null));
  const visited = new Set(run.visited);
  const walked = new Set(run.walked);

  const onPointerUp = (event: React.PointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!start || !event.isPrimary) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PIXELS) return;
    // A swipe goes to the neighbour it points at, which is not always the one its nearest arrow key leads to.
    const swipe = Math.atan2(-dy, dx);
    let best: { direction: Direction; off: number } | null = null;
    for (const direction of Object.keys(here.arrows) as Direction[]) {
      const to = here.arrows[direction];
      if (to === null) continue;
      const target = project(to);
      const angle = Math.atan2(target.y - here.y, target.x - here.x);
      const off = Math.abs(Math.atan2(Math.sin(angle - swipe), Math.cos(angle - swipe)));
      if (!best || off < best.off) best = { direction, off };
    }
    if (best && best.off < SWIPE_TOLERANCE) onMove(best.direction);
  };

  return (
    <div
      className="scene"
      onPointerDown={(event) => {
        // One finger, main button: a second touch or a right-click is not a swipe.
        down.current = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (down.current = null)}
    >
      <Canvas dpr={[1, 2]} camera={{ fov: 50, near: 0.1, far: 300, position: [here.x, here.y, 14] }} gl={{ antialias: true }}>
        <color attach="background" args={[PAPER]} />
        <fog attach="fog" args={[PAPER, 16, 40]} />
        <mesh position-z={-4}>
          <planeGeometry args={[240, 240]} />
          <meshBasicMaterial map={grid} toneMapped={false} />
        </mesh>
        <ThemeLabels />
        {EDGES.map((edge) => {
          const key = edgeKey(edge.a, edge.b);
          const touchesHere = edge.a === run.current || edge.b === run.current;
          const color = walked.has(key) ? INK : touchesHere && edge.theme ? theme(edge.theme).color : UNWALKED;
          return <Thread key={key} a={project(edge.a)} b={project(edge.b)} color={color} radius={walked.has(key) || touchesHere ? 0.055 : 0.03} />;
        })}
        {PROJECTS.map((p) => (
          <ProjectNote
            key={p.id}
            p={p}
            state={p.id === run.current ? "current" : visited.has(p.id) ? "visited" : reachable.has(p.id) ? "reachable" : "far"}
            celebrate={fresh.has(p.id)}
            textures={noteTextures}
            onTap={onTap}
          />
        ))}
        {!overview && <ArrowHints run={run} />}
        <HelixAndCamera run={run} overview={overview} extent={extent} />
      </Canvas>
    </div>
  );
}
