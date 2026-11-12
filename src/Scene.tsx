import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { POSTERS, posterFrost, posterThumb, type Poster, type PosterScore, type StarKind } from "./game";
import { angleFor, COUNT, nearestIndex, STEP, type Ring } from "./ring";

/**
 * The posters hang inside a round glass pavilion. The camera stands a few steps
 * from the glass and the whole pavilion turns around it, so there is no first or
 * last window.
 */
const RADIUS = 7.15;
const WALL_HEIGHT = 2.7;
const BAY_WIDTH = 2 * RADIUS * Math.sin(STEP / 2);
const PANE_WIDTH = BAY_WIDTH - 0.07;
const POSTER_Y = 0.06;
const POSTER_MAX = { width: 1.28, height: 1.45 };

/** Most sheets are portrait flipcharts; a few teams turned theirs sideways. */
function posterSize(aspect: number): { width: number; height: number } {
  const height = Math.min(POSTER_MAX.height, POSTER_MAX.width / aspect);
  return { width: height * aspect, height };
}
const FLOOR_Y = -WALL_HEIGHT / 2;

const INK = "#1d2433";
const NOTE_COLORS = ["#b9d531", "#f6d94a", "#f39130", "#ee3f6c", "#2f8fce"];
const TAPE_COLORS = ["#e7c94b", "#86c440"];

/** Deterministic noise, so the garden and the confetti look the same on every phone. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

/** A milky pane with the blurred poster and its number: what a window looks like before it is cleared. */
async function frostTexture(poster: Poster): Promise<THREE.CanvasTexture> {
  const width = 256;
  const height = Math.round((width * WALL_HEIGHT) / PANE_WIDTH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const unit = width / PANE_WIDTH;
  const size = posterSize(poster.aspect);
  const sheet = {
    w: size.width * unit,
    h: size.height * unit,
    cx: width / 2,
    cy: height / 2 - POSTER_Y * unit,
  };

  ctx.fillStyle = "rgba(226, 236, 231, 0.9)";
  ctx.fillRect(0, 0, width, height);
  const [blurred] = await Promise.all([
    loadImage(posterFrost(poster.id)).catch(() => null),
    document.fonts.load('800 96px "Shantell Sans Variable"').catch(() => null),
  ]);
  if (blurred) {
    ctx.globalAlpha = 0.8;
    ctx.drawImage(blurred, sheet.cx - sheet.w / 2, sheet.cy - sheet.h / 2, sheet.w, sheet.h);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.fillRect(sheet.cx - sheet.w / 2, sheet.cy - sheet.h / 2, sheet.w, sheet.h);
  ctx.fillStyle = INK;
  ctx.font = '800 96px "Shantell Sans Variable", cursive';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(poster.id), sheet.cx, sheet.cy);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Loads a texture once `wanted` is true and keeps it from then on. */
function useTexture(load: () => Promise<THREE.Texture>, wanted = true): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let alive = true;
    let loaded: THREE.Texture | null = null;
    load().then(
      (t) => {
        loaded = t;
        if (alive) setTexture(t);
        else t.dispose();
      },
      (error) => console.error("texture failed to load:", error),
    );
    return () => {
      alive = false;
      loaded?.dispose();
    };
    // Each caller's loader depends only on a poster id that never changes for a mounted window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);
  return texture;
}

const textureLoader = new THREE.TextureLoader();

async function photoTexture(src: string): Promise<THREE.Texture> {
  const texture = await textureLoader.loadAsync(src);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
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

function StarSticker({ kind, x, y }: { kind: StarKind; x: number; y: number }) {
  const group = useRef<THREE.Group>(null);
  const age = useRef(0);
  // A sticker slapped on: it arrives oversized and spinning, then settles.
  useFrame((_, dt) => {
    if (!group.current || age.current >= 1) return;
    age.current = Math.min(1, age.current + dt * 2.6);
    const settle = 1 - Math.pow(1 - age.current, 3);
    group.current.scale.setScalar(0.085 * (2.8 - 1.8 * settle));
    group.current.rotation.z = (1 - settle) * -0.9 + 0.15;
  });
  return (
    <group ref={group} position={[x, y, 0.012]} scale={0.3}>
      <mesh geometry={starShape} scale={1.22}>
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh geometry={starShape} position-z={0.002}>
        <meshBasicMaterial color={kind === "gold" ? "#f5b921" : "#ffffff"} />
      </mesh>
    </group>
  );
}

const CONFETTI = 44;
const confettiGeometry = new THREE.PlaneGeometry(0.09, 0.09);

/** A handful of sticky notes thrown from the poster when its window clears. */
function Confetti() {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const age = useRef(0);
  const pieces = useMemo(() => {
    const random = seeded(7);
    return Array.from({ length: CONFETTI }, () => ({
      vx: (random() - 0.5) * 2.4,
      vy: 1.2 + random() * 2.2,
      vz: 0.3 + random() * 1.1,
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
    if (!mesh.current) return;
    age.current += dt;
    const t = age.current;
    pieces.forEach((piece, i) => {
      dummy.position.set(piece.vx * t, piece.vy * t - 1.7 * t * t, 0.05 + piece.vz * t);
      dummy.rotation.set(piece.spin * t, piece.spin * t * 0.7, piece.spin * t * 0.4);
      dummy.scale.setScalar(t > 3 ? 0 : 1);
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(i, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[confettiGeometry, undefined, CONFETTI]} frustumCulled={false}>
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

interface WindowProps {
  poster: Poster;
  index: number;
  score: PosterScore;
  /** Close enough to the camera to be worth downloading its photo. */
  near: boolean;
  onPick: (index: number) => void;
}

function PosterWindow({ poster, index, score, near, onPick }: WindowProps) {
  const [everNear, setEverNear] = useState(near);
  if (near && !everNear) setEverNear(true);
  const photo = useTexture(() => photoTexture(posterThumb(poster.id)), everNear);
  const frost = useTexture(() => frostTexture(poster));
  const frostMaterial = useRef<THREE.MeshBasicMaterial>(null);
  // Windows that were already clear when the wall appeared skip the reveal.
  const wasClear = useRef(score.cleared);
  const clearing = useRef(score.cleared ? 1 : 0);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (score.cleared && !wasClear.current) {
      wasClear.current = true;
      setCelebrating(true);
    }
    if (!score.cleared) {
      wasClear.current = false;
      clearing.current = 0;
      setCelebrating(false);
    }
  }, [score.cleared]);

  useFrame((_, dt) => {
    if (score.cleared && clearing.current < 1) clearing.current = Math.min(1, clearing.current + dt / 1.3);
    if (frostMaterial.current) {
      // Ease out, so the glass clears quickly at first and the last haze lingers.
      frostMaterial.current.opacity = Math.pow(1 - clearing.current, 2);
      frostMaterial.current.visible = clearing.current < 1;
    }
  });

  // Negative, so project numbers rise from left to right as the camera looks outwards.
  const angle = -index * STEP;
  const { width, height } = posterSize(poster.aspect);
  const tape = TAPE_COLORS[index % TAPE_COLORS.length];
  const earned = score.stars.filter((kind) => kind !== "none");

  const pick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    // A drag that ends on a poster is a turn of the wall, not a tap.
    if (event.delta < 8) onPick(index);
  };

  return (
    <group position={[Math.sin(angle) * RADIUS, 0, Math.cos(angle) * RADIUS]} rotation-y={angle + Math.PI}>
      <group position={[0, POSTER_Y, 0.03]} rotation-z={((index % 5) - 2) * 0.012}>
        <mesh>
          <planeGeometry args={[width, height]} />
          {/* Keyed: a material compiled without a texture does not pick one up later. */}
          <meshBasicMaterial key={photo ? "photo" : "blank"} color={photo ? "#ffffff" : "#f4f2ec"} map={photo} toneMapped={false} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * (width / 2 - 0.02), height / 2 - 0.02, 0.004]} rotation-z={side * -0.65}>
            <planeGeometry args={[0.2, 0.075]} />
            <meshBasicMaterial color={tape} toneMapped={false} />
          </mesh>
        ))}
        {earned.map((kind, i) => (
          <StarSticker key={i} kind={kind} x={width / 2 - 0.1 - i * 0.2} y={-height / 2 + 0.08} />
        ))}
        {celebrating && <Confetti />}
      </group>

      {frost && (
        <mesh position={[0, 0, 0.06]} renderOrder={2}>
          <planeGeometry args={[PANE_WIDTH, WALL_HEIGHT]} />
          <meshBasicMaterial ref={frostMaterial} map={frost} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      {/* An unseen pane that takes the taps, whether or not the frost is still there. */}
      <mesh position={[0, 0, 0.07]} onClick={pick}>
        <planeGeometry args={[PANE_WIDTH, WALL_HEIGHT]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function Pavilion() {
  const posts = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const dummy = new THREE.Object3D();
    for (let i = 0; i < COUNT; i++) {
      const angle = (i + 0.5) * STEP;
      dummy.position.set(Math.sin(angle) * (RADIUS + 0.02), 0, Math.cos(angle) * (RADIUS + 0.02));
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      posts.current?.setMatrixAt(i, dummy.matrix);
    }
    if (posts.current) posts.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <>
      <instancedMesh ref={posts} args={[undefined, undefined, COUNT]}>
        <boxGeometry args={[0.07, WALL_HEIGHT, 0.12]} />
        <meshBasicMaterial color="#3a4147" />
      </instancedMesh>
      {/* Roof edge above the glass and the plinth below it. */}
      <mesh position-y={WALL_HEIGHT / 2 + 0.9}>
        <cylinderGeometry args={[RADIUS + 0.1, RADIUS + 0.1, 1.8, 62, 1, true]} />
        <meshBasicMaterial color="#d9ddd8" side={THREE.BackSide} />
      </mesh>
      <mesh position-y={FLOOR_Y - 0.6}>
        <cylinderGeometry args={[RADIUS + 0.1, RADIUS + 0.1, 1.2, 62, 1, true]} />
        <meshBasicMaterial color="#a9afaa" side={THREE.BackSide} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={FLOOR_Y}>
        <circleGeometry args={[RADIUS + 0.1, 62]} />
        <meshBasicMaterial color="#c3c7c1" />
      </mesh>
    </>
  );
}

const TREES = 140;
const FOLIAGE = ["#6f9a5b", "#86a862", "#5d8a66", "#c98a3c", "#d9a441", "#a8b85a"];

function Garden() {
  const crowns = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const random = seeded(2026);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < TREES; i++) {
      const angle = random() * Math.PI * 2;
      const distance = RADIUS + 7 + random() * 30;
      const size = 0.8 + random() * 1.1;
      const x = Math.sin(angle) * distance;
      const z = Math.cos(angle) * distance;
      dummy.rotation.set(0, random() * Math.PI, 0);
      dummy.position.set(x, FLOOR_Y + size * 1.5, z);
      dummy.scale.set(size, size * (1 + random() * 0.5), size);
      dummy.updateMatrix();
      crowns.current?.setMatrixAt(i, dummy.matrix);
      crowns.current?.setColorAt(i, color.set(FOLIAGE[Math.floor(random() * FOLIAGE.length)]));
      dummy.position.set(x, FLOOR_Y + size * 0.5, z);
      dummy.scale.set(size * 0.12, size, size * 0.12);
      dummy.updateMatrix();
      trunks.current?.setMatrixAt(i, dummy.matrix);
    }
    for (const mesh of [crowns.current, trunks.current]) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, []);

  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position-y={FLOOR_Y - 0.02}>
        <circleGeometry args={[70, 48]} />
        <meshLambertMaterial color="#93b17d" />
      </mesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, TREES]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshLambertMaterial flatShading />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, TREES]}>
        <cylinderGeometry args={[1, 1.3, 1, 6]} />
        <meshLambertMaterial color="#6b5a4a" />
      </instancedMesh>
    </>
  );
}

interface RigProps {
  ring: RefObject<Ring>;
  focused: boolean;
  onCenter: (index: number) => void;
}

/** Turns the pavilion, eases the camera, and tells the HUD which window is in front. */
function Rig({ ring, focused, onCenter, children }: RigProps & { children: React.ReactNode }) {
  const world = useRef<THREE.Group>(null);
  const centered = useRef(-1);
  const distance = useRef(3.2);
  const { camera, size } = useThree();

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const state = ring.current;
    const portrait = size.width / size.height < 0.9;
    const fov = portrait ? 62 : 46;
    const browsing = portrait ? 2.8 : 3.6;

    if (!state.dragging) {
      if (state.target === null) {
        state.angle += state.velocity * dt;
        state.velocity *= Math.exp(-3.2 * dt);
        if (Math.abs(state.velocity) < 0.25) state.target = nearestIndex(state.angle);
      } else {
        const goal = angleFor(state.target, state.angle);
        state.angle += (goal - state.angle) * (1 - Math.exp(-7 * dt));
        state.velocity = 0;
      }
    }

    distance.current += ((focused ? 1.9 : browsing) - distance.current) * (1 - Math.exp(-4 * dt));
    const perspective = camera as THREE.PerspectiveCamera;
    if (perspective.fov !== fov) {
      perspective.fov = fov;
      perspective.updateProjectionMatrix();
    }
    perspective.position.set(0, 0.05, RADIUS - distance.current);
    perspective.lookAt(0, 0.02, RADIUS);

    const visibleHeight = 2 * browsing * Math.tan(THREE.MathUtils.degToRad(fov / 2));
    state.anglePerPixel = visibleHeight / size.height / RADIUS;

    if (world.current) world.current.rotation.y = state.angle;
    const now = nearestIndex(state.angle);
    if (now !== centered.current) {
      centered.current = now;
      onCenter(now);
    }
  });

  return <group ref={world}>{children}</group>;
}

interface SceneProps {
  ring: RefObject<Ring>;
  scores: PosterScore[];
  focused: boolean;
  onCenter: (index: number) => void;
  onPick: (index: number) => void;
  onDragStart: () => void;
  centered: number;
}

/** Windows this many places either side of the one in front get their photo loaded. */
const NEARBY = 4;

export function Scene({ ring, scores, focused, centered, onCenter, onPick, onDragStart }: SceneProps) {
  const drag = useRef<{ x: number; time: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent) => {
    drag.current = { x: event.clientX, time: event.timeStamp };
    ring.current.dragging = true;
    ring.current.velocity = 0;
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dt = Math.max(1, event.timeStamp - drag.current.time) / 1000;
    const turn = -dx * ring.current.anglePerPixel;
    if (Math.abs(dx) > 2) onDragStart();
    ring.current.angle += turn;
    // A running average, so one jittery last sample does not decide how far the wall coasts.
    ring.current.velocity = ring.current.velocity * 0.6 + (turn / dt) * 0.4;
    drag.current = { x: event.clientX, time: event.timeStamp };
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    ring.current.dragging = false;
    ring.current.velocity = THREE.MathUtils.clamp(ring.current.velocity, -6, 6);
    ring.current.target = null;
  };

  return (
    <div
      className="scene"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <Canvas dpr={[1, 2]} camera={{ fov: 62, near: 0.1, far: 120 }} gl={{ antialias: true }}>
        <color attach="background" args={["#dfe9e6"]} />
        <fog attach="fog" args={["#dfe9e6", 12, 44]} />
        <hemisphereLight args={["#ffffff", "#8fa890", 1.5]} />
        <directionalLight position={[6, 12, 4]} intensity={1.6} />
        <Rig ring={ring} focused={focused} onCenter={onCenter}>
          <Garden />
          <Pavilion />
          {POSTERS.map((poster, index) => (
            <PosterWindow
              key={poster.id}
              poster={poster}
              index={index}
              score={scores[index]}
              near={Math.min(Math.abs(index - centered), COUNT - Math.abs(index - centered)) <= NEARBY}
              onPick={onPick}
            />
          ))}
        </Rig>
      </Canvas>
    </div>
  );
}
