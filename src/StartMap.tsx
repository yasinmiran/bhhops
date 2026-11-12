import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EDGES, PROJECTS, edgeKey, project, theme } from "./game";
import { HAND, canvasTexture, fontsReady } from "./Graph3D";
import { Helix } from "./Helix";
import { HIDDEN_THREADS, LOOSE_ENDS, PHANTOMS, type Spot } from "./tricks";

const INK = "#1d2433";
const THREAD = "#a2a8b0";
const PHANTOM_PAPER = "#e4e1d6";
const DOT_SIZE = 2.3;
/** A click this close to a dot, in graph units, counts as a click on it: the dots are small on a phone. */
const PICK_RADIUS = 2.4;
/** Graph units left clear along the bottom for the caption. */
const CAPTION_ROOM = 5.4;
/** The side of the square of graph the map shows. */
const VIEW = Math.max(...PROJECTS.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])) * 2 + DOT_SIZE * 2 + CAPTION_ROOM;
/** The graph sits this far above the middle of the map, which is what keeps the caption clear of it. */
const LIFT = CAPTION_ROOM / 2;
const STILL = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** What the game draws before the first hop: the links that are not hidden, and the loose ends among them. */
const DRAWN: { a: Spot; b: Spot; ends: number[] }[] = [
  ...EDGES.filter((edge) => !HIDDEN_THREADS.has(edgeKey(edge.a, edge.b))).map((edge) => ({ a: project(edge.a), b: project(edge.b), ends: [edge.a, edge.b] })),
  ...LOOSE_ENDS.map((loose) => ({ a: loose.from, b: loose.to, ends: loose.ends })),
];

/** Flat strips for a set of threads, in one mesh. */
function ribbons(threads: { a: Spot; b: Spot }[], width: number): THREE.BufferGeometry {
  const corners: number[] = [];
  for (const { a, b } of threads) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / length) * (width / 2);
    const ny = ((b.x - a.x) / length) * (width / 2);
    corners.push(a.x - nx, a.y - ny, 0, a.x + nx, a.y + ny, 0, b.x + nx, b.y + ny, 0);
    corners.push(a.x - nx, a.y - ny, 0, b.x + nx, b.y + ny, 0, b.x - nx, b.y - ny, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
  return geometry;
}

function dotTexture(label: string, paper: string): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = `800 62px ${HAND}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 64, 68);
  });
}

const dotGeometry = new THREE.PlaneGeometry(DOT_SIZE, DOT_SIZE);
const ringGeometry = new THREE.RingGeometry(DOT_SIZE * 0.62, DOT_SIZE * 0.74, 40);

/** Keeps the whole graph in view whatever shape the canvas takes. */
function Fit() {
  const { camera, size } = useThree();
  useEffect(() => {
    camera.zoom = Math.min(size.width, size.height) / VIEW;
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

interface SceneProps {
  value: number | null;
  hover: number | null;
  textures: Map<number, THREE.CanvasTexture>;
}

function Scene({ value, hover, textures }: SceneProps) {
  const dots = useRef(new Map<number, THREE.Mesh>());
  const ring = useRef<THREE.Mesh>(null);
  const marker = useRef<THREE.Group>(null);
  const twist = useRef<THREE.Group>(null);
  const all = useMemo(() => ribbons(DRAWN, 0.2), []);
  const chosen = useMemo(() => ribbons(DRAWN.filter((thread) => value !== null && thread.ends.includes(value)), 0.42), [value]);
  useEffect(() => () => all.dispose(), [all]);
  useEffect(() => () => chosen.dispose(), [chosen]);

  useFrame(({ clock }) => {
    const t = STILL ? 0 : clock.elapsedTime;
    for (const p of PROJECTS) {
      const dot = dots.current.get(p.id);
      if (!dot) continue;
      // The beat travels outwards from the middle of the graph, so the map ripples and does not blink.
      const beat = Math.sin(t * 2.6 - Math.hypot(p.x, p.y) * 0.32);
      const goal = p.id === value ? 1.5 + beat * 0.08 : p.id === hover ? 1.35 : 1 + beat * 0.1;
      dot.scale.setScalar(dot.scale.x + (goal - dot.scale.x) * 0.2);
    }
    if (ring.current) ring.current.rotation.z = -t * 0.9;
    if (marker.current && value !== null) marker.current.position.y = project(value).y + DOT_SIZE * 1.25 + Math.sin(t * 3) * 0.18;
    if (twist.current) twist.current.rotation.y = t * 2.2;
  });

  const start = value === null ? null : project(value);
  return (
    <>
      <Fit />
      <mesh geometry={all}>
        <meshBasicMaterial color={THREAD} side={THREE.DoubleSide} toneMapped={false} />
      </mesh>
      <mesh geometry={chosen} position-z={0.2}>
        <meshBasicMaterial color={INK} side={THREE.DoubleSide} />
      </mesh>
      {PHANTOMS.map((p) => (
        <mesh key={p.id} geometry={dotGeometry} position={[p.x, p.y, 1]}>
          <meshBasicMaterial map={textures.get(p.id)} transparent toneMapped={false} />
        </mesh>
      ))}
      {PROJECTS.map((p) => (
        <mesh
          key={p.id}
          ref={(mesh) => {
            if (mesh) dots.current.set(p.id, mesh);
            else dots.current.delete(p.id);
          }}
          geometry={dotGeometry}
          position={[p.x, p.y, p.id === value || p.id === hover ? 2 : 1]}
        >
          <meshBasicMaterial map={textures.get(p.id)} transparent toneMapped={false} />
        </mesh>
      ))}
      {start && (
        <>
          {/* A broken ring, so that its turning shows. */}
          <mesh ref={ring} geometry={ringGeometry} position={[start.x, start.y, 2.5]} scale={1.5}>
            <meshBasicMaterial color="#d8412f" toneMapped={false} />
          </mesh>
          <group ref={marker} position={[start.x, start.y + DOT_SIZE * 1.25, 4]} rotation-z={-0.3} scale={2.3}>
            <Helix twist={twist} />
          </group>
        </>
      )}
    </>
  );
}

interface StartMapProps {
  /** The project to start from, or null for a random one. */
  value: number | null;
  onChange: (id: number | null) => void;
}

/** The graph as the game first shows it, small enough to take in at once, for choosing where to start. */
export function StartMap({ value, onChange }: StartMapProps) {
  const [textures, setTextures] = useState<Map<number, THREE.CanvasTexture> | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let made: THREE.CanvasTexture[] = [];
    void fontsReady().then(() => {
      if (!alive) return;
      const next = new Map([
        ...PROJECTS.map((p) => [p.id, dotTexture(String(p.id), theme(p.primary).color)] as const),
        ...PHANTOMS.map((p) => [p.id, dotTexture(String(p.id), PHANTOM_PAPER)] as const),
      ]);
      made = [...next.values()];
      setTextures(next);
    });
    return () => {
      alive = false;
      made.forEach((texture) => texture.dispose());
    };
  }, []);

  const under = (event: React.MouseEvent<HTMLDivElement>): number | null => {
    // Measured from the middle of the map, which stays put under the slight tilt of the note around it;
    // the tilt itself moves a dot by far less than the reach of a click.
    const box = event.currentTarget.getBoundingClientRect();
    const scale = Math.min(event.currentTarget.clientWidth, event.currentTarget.clientHeight) / VIEW;
    const x = (event.clientX - (box.left + box.width / 2)) / scale;
    const y = -(event.clientY - (box.top + box.height / 2)) / scale - LIFT;
    let best: { id: number; off: number } | null = null;
    for (const p of PROJECTS) {
      const off = Math.hypot(p.x - x, p.y - y);
      if (off <= PICK_RADIUS && (!best || off < best.off)) best = { id: p.id, off };
    }
    return best?.id ?? null;
  };

  const shown = hover ?? value;
  return (
    <div
      className={hover === null ? "start-map" : "start-map start-map-hot"}
      role="img"
      aria-label="The projects and the threads between them. The list below chooses a start without the map."
      onClick={(event) => {
        const id = under(event);
        // A second click on the chosen project lets it go again.
        if (id !== null) onChange(id === value ? null : id);
      }}
      onPointerMove={(event) => event.pointerType === "mouse" && setHover(under(event))}
      onPointerLeave={() => setHover(null)}
    >
      <Canvas orthographic dpr={[1, 2]} camera={{ position: [0, -LIFT, 50], near: 0.1, far: 200 }} gl={{ antialias: true }}>
        {textures && <Scene value={value} hover={hover} textures={textures} />}
      </Canvas>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={shown ?? "none"}
          className="start-map-caption"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.12 }}
        >
          {shown === null ? "Tap a project to start there" : `${shown}. ${project(shown).name}`}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
