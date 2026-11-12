import type { Ref } from "react";
import * as THREE from "three";

const INK = "#1d2433";
const SHAPE = { turns: 1.25, height: 1.5, radius: 0.3, rungs: 6 };

/** Where a strand is at t along the helix; the second strand runs half a turn behind the first. */
function strandPoint(t: number, phase: number): THREE.Vector3 {
  const angle = t * SHAPE.turns * Math.PI * 2 + phase;
  return new THREE.Vector3(Math.cos(angle) * SHAPE.radius, (t - 0.5) * SHAPE.height, Math.sin(angle) * SHAPE.radius);
}

function strandGeometry(phase: number, thickness: number): THREE.TubeGeometry {
  const curve = new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (_, i) => strandPoint(i / 32, phase)));
  return new THREE.TubeGeometry(curve, 48, thickness, 8);
}

const STRANDS = [
  { color: "#ee3f6c", fill: strandGeometry(0, 0.075), outline: strandGeometry(0, 0.11) },
  { color: "#2f8fce", fill: strandGeometry(Math.PI, 0.075), outline: strandGeometry(Math.PI, 0.11) },
];
const rungGeometry = new THREE.CylinderGeometry(0.035, 0.035, SHAPE.radius * 2, 6);
const RUNGS = Array.from({ length: SHAPE.rungs }, (_, i) => {
  const t = (i + 0.5) / SHAPE.rungs;
  return { y: (t - 0.5) * SHAPE.height, angle: t * SHAPE.turns * Math.PI * 2 };
});

/** The double helix the player moves, about 1.5 tall, standing on its axis. Turn `twist` about y to spin it. */
export function Helix({ twist }: { twist: Ref<THREE.Group> }) {
  return (
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
  );
}
