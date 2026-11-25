import * as THREE from 'three';
import { PULLEY_RATIO, StageMode } from '../types';
import {
  DIM,
  externalShaftPointAtS,
  getKopelPos,
  getLowerEntryKopelPos,
  getPropellerPos,
  leveeTerrainHeightAt,
  pipeCenterYAt,
  pipePointAtS,
} from './dimensions';
import { MaterialLibrary } from './materials';

export interface PumpAssembly {
  root: THREE.Group;
  updateKinematics: (
    engineAngle: number,
    rpm: number,
    xrayMix: number,
    explodeMix: number,
    waterFlowEnabled: boolean,
    dischargeHoseAttached: boolean,
    beltGuardVisible: boolean,
    cavitationEfficiency: number,
    stageMode: StageMode,
    time: number,
  ) => void;
  getHotspotAnchors: () => {
    vbelt: THREE.Object3D;
    kopel: THREE.Object3D;
    discharge: THREE.Object3D;
    propeller: THREE.Object3D;
  };
  dispose: () => void;
}

/**
 * Generates a realistic cast-metal 3-blade wide-chord helical axial flow propeller
 * with broad rounded blade tips and a keyed central hub (12-inch / 286mm diameter).
 */
function buildAxialPropeller(mats: MaterialLibrary): THREE.Group {
  const propGroup = new THREE.Group();
  propGroup.name = 'AxialPropeller_3Blade';

  const hubRadius = 0.044;
  const tipRadius = 0.141; // 282mm outer dia inside 300mm (150mm R) pipe

  // Keyed central hub + streamlined intake nose cone
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(hubRadius, hubRadius * 0.96, 0.115, 24),
    mats.propellerCastBronze,
  );
  hub.rotation.z = Math.PI / 2;
  hub.castShadow = true;
  propGroup.add(hub);

  // Streamlined hemispherical nose cone facing intake (+X)
  const nosePts: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const r = hubRadius * Math.cos(t * Math.PI * 0.5);
    const y = Math.sin(t * Math.PI * 0.5) * 0.072;
    nosePts.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const noseGeo = new THREE.LatheGeometry(nosePts, 24);
  noseGeo.rotateZ(-Math.PI / 2);
  const noseCone = new THREE.Mesh(noseGeo, mats.propellerCastBronze);
  noseCone.position.x = 0.056;
  propGroup.add(noseCone);

  // Keyway collar & lock nut at rear of hub
  const keyRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.025, 6),
    mats.machinedSteel,
  );
  keyRing.rotation.z = Math.PI / 2;
  keyRing.position.x = -0.068;
  propGroup.add(keyRing);

  // Custom procedural helical wide-chord rounded-tip hydrofoil blade BufferGeometry
  const radialSegs = 14;
  const chordSegs = 10;
  const buildBladeGeo = (): THREE.BufferGeometry => {
    const positions: number[] = [];
    const indices: number[] = [];
    const ringVerts = (chordSegs + 1) * 2; // top + bottom airfoil surface

    for (let ir = 0; ir <= radialSegs; ir++) {
      const u = ir / radialSegs; // 0 = hub root, 1 = tip
      const r = hubRadius * 0.88 + u * (tipRadius - hubRadius * 0.88);

      // Broad, rounded-tip wide-chord Kaplan/axial-flow blade envelope
      const chord =
        (0.048 + 0.095 * Math.sin(Math.pow(u, 0.65) * Math.PI * 0.86)) *
        (1.0 - 0.14 * Math.pow(u, 4));
      const thickness = 0.014 * (1 - 0.62 * u);

      // Helical pitch twist: steep near hub (~48 deg), flatter at broad tip (~21 deg)
      const pitch = 0.84 - 0.46 * u;
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);
      const sweepOffset = -0.024 * Math.pow(u, 1.5);

      for (let side = 0; side < 2; side++) {
        const sSign = side === 0 ? 1 : -1;
        for (let ic = 0; ic <= chordSegs; ic++) {
          const v = ic / chordSegs; // 0 = leading edge, 1 = trailing edge
          const cLocal = (v - 0.5) * chord + sweepOffset;
          const foilProfile = Math.sin(v * Math.PI);
          const camber = 0.011 * foilProfile * (1 - 0.3 * u);
          const tLocal = camber + sSign * thickness * 0.5 * Math.pow(foilProfile, 0.72);

          const axialX = cLocal * sinP + tLocal * cosP;
          const tangZ = cLocal * cosP - tLocal * sinP;

          const theta = tangZ / Math.max(0.035, r);
          const y = r * Math.cos(theta);
          const z = r * Math.sin(theta);

          positions.push(axialX, y, z);
        }
      }
    }

    for (let ir = 0; ir < radialSegs; ir++) {
      const rowA = ir * ringVerts;
      const rowB = (ir + 1) * ringVerts;

      for (let ic = 0; ic < chordSegs; ic++) {
        const a = rowA + ic;
        const b = rowB + ic;
        const c = rowB + ic + 1;
        const d = rowA + ic + 1;
        indices.push(a, b, d, b, c, d);
      }
      const off = chordSegs + 1;
      for (let ic = 0; ic < chordSegs; ic++) {
        const a = rowA + off + ic;
        const b = rowB + off + ic;
        const c = rowB + off + ic + 1;
        const d = rowA + off + ic + 1;
        indices.push(a, d, b, b, d, c);
      }
      const laTopA = rowA;
      const laTopB = rowB;
      const laBotA = rowA + off;
      const laBotB = rowB + off;
      indices.push(laTopA, laBotA, laTopB, laBotA, laBotB, laTopB);

      const teTopA = rowA + chordSegs;
      const teTopB = rowB + chordSegs;
      const teBotA = rowA + off + chordSegs;
      const teBotB = rowB + off + chordSegs;
      indices.push(teTopA, teTopB, teBotA, teBotA, teTopB, teBotB);
    }

    const tipRow = radialSegs * ringVerts;
    const off = chordSegs + 1;
    for (let ic = 0; ic < chordSegs; ic++) {
      indices.push(
        tipRow + ic,
        tipRow + ic + 1,
        tipRow + off + ic,
        tipRow + off + ic,
        tipRow + ic + 1,
        tipRow + off + ic + 1,
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  };

  const bladeGeo = buildBladeGeo();
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(bladeGeo, mats.propellerCastBronze);
    blade.rotation.x = (i / 3) * Math.PI * 2;
    blade.castShadow = true;
    blade.receiveShadow = true;
    propGroup.add(blade);
  }

  return propGroup;
}

/**
 * Generates closed-loop V-belt geometry wrapping tightly around
 * the engine drive pulley and pump driven pulley in the Y-Z plane.
 */
function buildVBeltLoopGeometry(
  y1: number,
  z1: number,
  r1: number,
  y2: number,
  z2: number,
  r2: number,
): THREE.BufferGeometry {
  const dy = y2 - y1;
  const dz = z2 - z1;
  const dist = Math.hypot(dy, dz);
  const baseAngle = Math.atan2(dy, dz);
  const alpha = Math.acos(Math.max(-0.99, Math.min(0.99, (r1 - r2) / dist)));

  const pts: THREE.Vector3[] = [];
  const segs1 = 20;
  const segs2 = 24;

  const a1Start = baseAngle + alpha;
  const a1End = baseAngle + Math.PI * 2 - alpha;
  for (let i = 0; i <= segs1; i++) {
    const a = a1Start + (i / segs1) * (a1End - a1Start);
    pts.push(new THREE.Vector3(0, y1 + Math.sin(a) * r1, z1 + Math.cos(a) * r1));
  }

  const a2Start = baseAngle - alpha;
  const a2End = baseAngle + alpha;
  for (let i = 0; i <= segs2; i++) {
    const a = a2Start + (i / segs2) * (a2End - a2Start);
    pts.push(new THREE.Vector3(0, y2 + Math.sin(a) * r2, z2 + Math.cos(a) * r2));
  }

  const curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.15);
  return new THREE.TubeGeometry(curve, 96, 0.011, 8, true);
}

/**
 * Builds an articulated dual-yoke black Universal Joint (Kopel).
 */
function buildKopelYoke(mats: MaterialLibrary, scale = 1): THREE.Group {
  const yoke = new THREE.Group();

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036 * scale, 0.038 * scale, 0.055 * scale, 18),
    mats.kopelBlackSteel,
  );
  hub.rotation.z = Math.PI / 2;
  hub.position.x = -0.052 * scale;
  hub.castShadow = true;
  yoke.add(hub);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(
      new THREE.BoxGeometry(0.072 * scale, 0.022 * scale, 0.042 * scale),
      mats.kopelBlackSteel,
    );
    ear.position.set(-0.012 * scale, side * 0.042 * scale, 0);
    ear.castShadow = true;
    yoke.add(ear);

    const bearingCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016 * scale, 0.016 * scale, 0.026 * scale, 14),
      mats.machinedSteel,
    );
    bearingCap.position.set(0.012 * scale, side * 0.044 * scale, 0);
    yoke.add(bearingCap);
  }

  return yoke;
}

export function buildAxialPump(mats: MaterialLibrary): PumpAssembly {
  const root = new THREE.Group();
  root.name = 'AxialFlowPump12Inch_Root';

  const disposableGeos: THREE.BufferGeometry[] = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposableGeos.push(g);
    return g;
  };

  // Sub-groups for clean Exploded View separation
  const pipeGroup = new THREE.Group();
  const clampsGroup = new THREE.Group();
  const upperFrameGroup = new THREE.Group();
  const vbeltGroup = new THREE.Group();
  const kopelGroup = new THREE.Group();
  const lowerKopelGroup = new THREE.Group();
  const driveShaftGroup = new THREE.Group();
  const propellerContainer = new THREE.Group();
  const strainerContainer = new THREE.Group();
  const dischargeHoseGroup = new THREE.Group();
  const canalSupportGroup = new THREE.Group();
  const internalFlowGroup = new THREE.Group();

  root.add(
    pipeGroup,
    clampsGroup,
    upperFrameGroup,
    vbeltGroup,
    kopelGroup,
    lowerKopelGroup,
    driveShaftGroup,
    propellerContainer,
    strainerContainer,
    dischargeHoseGroup,
    canalSupportGroup,
    internalFlowGroup,
  );

  // =========================================================================
  // 1. STATIC POWER TRANSMISSION: PULLEY B3 x 5", 5x UCP-205, 3x V-BELT B-69
  // =========================================================================
  const pz = DIM.PUMP_Z;
  const py = DIM.DRIVEN_PULLEY_Y;

  // Detailed Cast-Iron Bearing Pillow Block UCP-205 (Qty: 5 in BOM)
  const createUcp205PillowBlock = (): THREE.Group => {
    const pb = new THREE.Group();
    const housingRing = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.044, 0.048, 0.042, 20)),
      mats.pillowBlockBlueGrey,
    );
    housingRing.rotation.z = Math.PI / 2;
    housingRing.castShadow = true;
    pb.add(housingRing);

    const innerBearing = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.029, 0.029, 0.048, 16)),
      mats.machinedSteel,
    );
    innerBearing.rotation.z = Math.PI / 2;
    pb.add(innerBearing);

    const baseFoot = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.048, 0.022, 0.155)),
      mats.pillowBlockBlueGrey,
    );
    baseFoot.position.y = -0.045;
    baseFoot.castShadow = true;
    pb.add(baseFoot);

    for (const fz of [-0.06, 0.06]) {
      const bolt = new THREE.Mesh(
        trackGeo(new THREE.CylinderGeometry(0.0085, 0.0085, 0.028, 6)),
        mats.boltZinc,
      );
      bolt.position.set(0, -0.030, fz);
      pb.add(bolt);
    }

    const zerk = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.0045, 0.0055, 0.016, 8)),
      mats.brassFitting,
    );
    zerk.position.y = 0.052;
    pb.add(zerk);
    return pb;
  };

  // Driven Pulley Rotating Group (centered at X = DIM.BELT_X, Y = 0.91, Z = 0.38)
  const drivenPulleySpinGroup = new THREE.Group();
  drivenPulleySpinGroup.position.set(DIM.BELT_X, py, pz);
  upperFrameGroup.add(drivenPulleySpinGroup);

  // Lathe-turned 3-Groove Pulley B3 X 5" (identical diameter to engine pulley = 1:1 ratio)
  const pr = DIM.DRIVEN_PULLEY_RADIUS;
  const dpProfile = [
    new THREE.Vector2(0.028, -0.040),
    new THREE.Vector2(pr + 0.010, -0.040),
    new THREE.Vector2(pr + 0.010, -0.033),
    new THREE.Vector2(pr - 0.012, -0.024), // Groove 1
    new THREE.Vector2(pr + 0.010, -0.015),
    new THREE.Vector2(pr + 0.010, -0.009),
    new THREE.Vector2(pr - 0.012, 0.000), // Groove 2
    new THREE.Vector2(pr + 0.010, 0.009),
    new THREE.Vector2(pr + 0.010, 0.015),
    new THREE.Vector2(pr - 0.012, 0.024), // Groove 3
    new THREE.Vector2(pr + 0.010, 0.033),
    new THREE.Vector2(pr + 0.010, 0.040),
    new THREE.Vector2(0.028, 0.040),
  ];
  const dpGeo = trackGeo(new THREE.LatheGeometry(dpProfile, 40));
  dpGeo.rotateZ(Math.PI / 2);
  const drivenPulleyMesh = new THREE.Mesh(dpGeo, mats.castIronFlywheel);
  drivenPulleyMesh.castShadow = true;
  drivenPulleySpinGroup.add(drivenPulleyMesh);

  // Machined hub & 4 visual spin indicator ribs on B3 x 5" pulley face
  const dpBoss = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.038, 0.038, 0.088, 18)),
    mats.machinedSteel,
  );
  dpBoss.rotation.z = Math.PI / 2;
  drivenPulleySpinGroup.add(dpBoss);

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const rib = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.084, 0.056, 0.014)),
      mats.machinedSteel,
    );
    rib.position.set(0, Math.cos(a) * 0.058, Math.sin(a) * 0.058);
    rib.rotation.x = a;
    drivenPulleySpinGroup.add(rib);
  }

  // As Stainless 1/2 inch (40 cm) Pendek — short countershaft through front 2 UCP-205 bearings to Kopel
  const counterShaft = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.019, 0.019, 0.54, 18)),
    mats.machinedSteel,
  );
  counterShaft.rotation.z = Math.PI / 2;
  counterShaft.position.set(0.23, 0, 0);
  drivenPulleySpinGroup.add(counterShaft);

  // UCP-205 Pillow Blocks #1 & #2 supporting the 40 cm short countershaft
  for (const bx of [-0.76, -0.56]) {
    const pb = createUcp205PillowBlock();
    pb.position.set(bx, py, pz);
    upperFrameGroup.add(pb);
  }

  // Triple Animated Rubber V-Belts B-69 (Qty: 3) in exact 0° level Y-Z belt plane
  const beltGeo = trackGeo(
    buildVBeltLoopGeometry(
      DIM.ENGINE_CRANK_Y,
      DIM.ENGINE_CRANK_Z,
      DIM.DRIVE_PULLEY_RADIUS - 0.002,
      DIM.DRIVEN_PULLEY_Y,
      DIM.PUMP_Z,
      DIM.DRIVEN_PULLEY_RADIUS - 0.002,
    ),
  );
  for (const bxOff of [-0.024, 0.0, 0.024]) {
    const beltMesh = new THREE.Mesh(beltGeo, mats.vbeltRubber);
    beltMesh.position.x = DIM.BELT_X + bxOff;
    beltMesh.castShadow = true;
    vbeltGroup.add(beltMesh);
  }

  // =========================================================================
  // 1A2. TOGGLEABLE K3 INDUSTRIAL SAFETY V-BELT MESH GUARD (PELINDUNG BELT)
  //      Stadium-shaped welded steel shroud + safety amber edge trim +
  //      open protective mesh ribs so spinning belts stay legible inside!
  // =========================================================================
  const beltGuardGroup = new THREE.Group();
  beltGuardGroup.name = 'SafetyVBeltMeshGuard';
  beltGuardGroup.visible = false;
  root.add(beltGuardGroup);

  const gZ1 = DIM.ENGINE_CRANK_Z; // -0.26
  const gZ2 = DIM.PUMP_Z; // +0.38
  const gMidZ = (gZ1 + gZ2) * 0.5; // +0.06
  const gHalfSpan = (gZ2 - gZ1) * 0.5; // 0.32
  const gOuterR = DIM.DRIVEN_PULLEY_RADIUS + 0.056; // 0.144 m
  const gInnerR = gOuterR - 0.012;
  const gDepth = 0.128; // Covers all 3 V-belt grooves cleanly around DIM.BELT_X

  const makeStadiumPath = (radius: number): THREE.Shape => {
    const s = new THREE.Shape();
    s.absarc(-gHalfSpan, 0, radius, Math.PI * 0.5, Math.PI * 1.5, false);
    s.absarc(gHalfSpan, 0, radius, -Math.PI * 0.5, Math.PI * 0.5, false);
    s.closePath();
    return s;
  };

  // Hollow perimeter shroud wall around both B3 x 5" pulleys
  const shroudShape = makeStadiumPath(gOuterR);
  const shroudHole = new THREE.Path();
  shroudHole.absarc(-gHalfSpan, 0, gInnerR, Math.PI * 0.5, Math.PI * 1.5, false);
  shroudHole.absarc(gHalfSpan, 0, gInnerR, -Math.PI * 0.5, Math.PI * 0.5, false);
  shroudHole.closePath();
  shroudShape.holes.push(shroudHole);

  const shroudGeo = trackGeo(
    new THREE.ExtrudeGeometry(shroudShape, {
      depth: gDepth,
      bevelEnabled: true,
      bevelThickness: 0.003,
      bevelSize: 0.002,
      bevelSegments: 2,
    }),
  );
  // Rotate so shape's X axis maps along Z (between engine & pump pulleys) and extrusion depth maps along X
  shroudGeo.rotateY(Math.PI / 2);
  const shroudMesh = new THREE.Mesh(shroudGeo, mats.chassisBlackSteel);
  shroudMesh.position.set(DIM.BELT_X - gDepth * 0.5, py, gMidZ);
  shroudMesh.castShadow = true;
  shroudMesh.receiveShadow = true;
  beltGuardGroup.add(shroudMesh);

  // High-visibility K3 Safety Amber-Yellow warning rim strip on the outer -X face
  const trimGeo = trackGeo(
    new THREE.ExtrudeGeometry(shroudShape, {
      depth: 0.010,
      bevelEnabled: false,
    }),
  );
  trimGeo.rotateY(Math.PI / 2);
  const trimMesh = new THREE.Mesh(trimGeo, mats.batteryCapYellow);
  trimMesh.position.set(DIM.BELT_X - gDepth * 0.5 - 0.010, py, gMidZ);
  beltGuardGroup.add(trimMesh);

  // Protective outer steel safety mesh bars (horizontal + vertical grille on -X face)
  const guardFaceX = DIM.BELT_X - gDepth * 0.5 - 0.004;
  const hBarGeo = trackGeo(new THREE.BoxGeometry(0.005, 0.006, gHalfSpan * 2 + gInnerR * 1.7));
  for (const yOff of [-0.085, -0.042, 0.0, 0.042, 0.085]) {
    const bar = new THREE.Mesh(hBarGeo, mats.clampSteel);
    const widthScale = Math.sqrt(Math.max(0.25, 1 - (yOff / gInnerR) * (yOff / gInnerR)));
    bar.scale.z = 0.68 + widthScale * 0.32;
    bar.position.set(guardFaceX, py + yOff, gMidZ);
    beltGuardGroup.add(bar);
  }
  const vBarGeo = trackGeo(new THREE.BoxGeometry(0.005, gInnerR * 1.92, 0.006));
  for (let i = -5; i <= 5; i++) {
    const zOff = i * 0.072;
    const bar = new THREE.Mesh(vBarGeo, mats.clampSteel);
    const excess = Math.max(0, Math.abs(zOff) - gHalfSpan);
    const hScale = Math.sqrt(Math.max(0.15, 1 - (excess / gInnerR) * (excess / gInnerR)));
    bar.scale.y = hScale;
    bar.position.set(guardFaceX, py, gMidZ + zOff);
    beltGuardGroup.add(bar);
  }

  // Twin bolted mounting L-brackets anchoring the safety guard down to the skid frame
  const guardBracketGeo = trackGeo(new THREE.BoxGeometry(0.022, 0.24, 0.036));
  for (const bz of [gZ1 + 0.06, gZ2 - 0.06]) {
    const brk = new THREE.Mesh(guardBracketGeo, mats.chassisBlackSteel);
    brk.position.set(DIM.BELT_X, py - gOuterR - 0.10, bz);
    brk.castShadow = true;
    beltGuardGroup.add(brk);

    const brkBolt = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.032, 6)),
      mats.boltZinc,
    );
    brkBolt.rotation.z = Math.PI / 2;
    brkBolt.position.set(DIM.BELT_X, py - gOuterR - 0.02, bz);
    beltGuardGroup.add(brkBolt);
  }

  // =========================================================================
  // 1B. ADAPTIVE BLUE CORRUGATED SPIRAL DISCHARGE HOSE (SELANG BUANG, BOM C.11)
  //     - Tanggul mode: sampled strictly ON TOP of leveeTerrainHeightAt(x, pz)
  //       so zero hose ribs ever sink into the embankment slope!
  //     - Studio / Field mode: drapes smoothly off front edge of 1.32 m podium
  // =========================================================================
  const buildCorrugatedHose = (
    points: THREE.Vector3[],
    tubularSegs: number,
    ribCount: number,
  ): THREE.Group => {
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.25);
    const tubeGeo = trackGeo(
      new THREE.TubeGeometry(curve, tubularSegs, DIM.PIPE_OUTER_R + 0.005, 28, false),
    );
    const tubeMesh = new THREE.Mesh(tubeGeo, mats.dischargeHoseBlue);
    tubeMesh.castShadow = true;
    tubeMesh.receiveShadow = true;
    g.add(tubeMesh);

    const ribGeo = trackGeo(
      new THREE.TorusGeometry(DIM.PIPE_OUTER_R + 0.010, 0.0085, 8, 28),
    );
    const ribInst = new THREE.InstancedMesh(ribGeo, mats.dischargeHoseSpiral, ribCount);
    const dummy = new THREE.Object3D();
    const upZ = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < ribCount; i++) {
      const u = (i + 0.5) / ribCount;
      const p = curve.getPoint(u);
      const tang = curve.getTangent(u).normalize();
      dummy.position.copy(p);
      dummy.quaternion.setFromUnitVectors(upZ, tang);
      dummy.updateMatrix();
      ribInst.setMatrixAt(i, dummy.matrix);
    }
    ribInst.instanceMatrix.needsUpdate = true;
    ribInst.computeBoundingSphere();
    ribInst.castShadow = true;
    g.add(ribInst);
    return g;
  };

  // Terrain-hugging clearance above levee slope (outer rib R = 0.1765 m -> +0.058 m buffer)
  const hoseSlopeClearance = DIM.PIPE_OUTER_R + 0.058;
  const hoseTanggulPoints: THREE.Vector3[] = [
    new THREE.Vector3(DIM.DISCHARGE_MOUTH_X + 0.05, DIM.DISCHARGE_MOUTH_Y, pz),
    new THREE.Vector3(-1.78, 0.55, pz),
    new THREE.Vector3(-2.18, Math.max(0.32, leveeTerrainHeightAt(-2.18, pz) + hoseSlopeClearance), pz),
    new THREE.Vector3(-2.68, leveeTerrainHeightAt(-2.68, pz) + hoseSlopeClearance + 0.04, pz),
    new THREE.Vector3(-3.20, leveeTerrainHeightAt(-3.20, pz) + hoseSlopeClearance + 0.02, pz),
    new THREE.Vector3(-3.72, leveeTerrainHeightAt(-3.72, pz) + hoseSlopeClearance + 0.01, pz),
    new THREE.Vector3(-4.22, leveeTerrainHeightAt(-4.22, pz) + hoseSlopeClearance, pz),
    new THREE.Vector3(DIM.HOSE_TANGGUL_TIP_X, DIM.HOSE_TANGGUL_TIP_Y, pz),
  ];

  const hoseTanggulGroup = buildCorrugatedHose(hoseTanggulPoints, 68, 62);
  dischargeHoseGroup.add(hoseTanggulGroup);

  // Podium-edge draped hose for Studio / Field mode (clears podium X=-1.70 down to floor Y=-1.32)
  const hosePodiumGroup = buildCorrugatedHose(
    [
      new THREE.Vector3(DIM.DISCHARGE_MOUTH_X + 0.05, DIM.DISCHARGE_MOUTH_Y, pz),
      new THREE.Vector3(-1.82, 0.46, pz),
      new THREE.Vector3(-2.22, -0.06, pz),
      new THREE.Vector3(-2.58, -0.54, pz),
      new THREE.Vector3(DIM.HOSE_PODIUM_TIP_X, DIM.HOSE_PODIUM_TIP_Y, pz),
    ],
    44,
    38,
  );
  hosePodiumGroup.visible = false;
  dischargeHoseGroup.add(hosePodiumGroup);

  // Heavy galvanized hose collar clamp securing Selang Buang onto 12" white PVC outlet lip
  const hoseClampGeo = trackGeo(
    new THREE.CylinderGeometry(DIM.PIPE_OUTER_R + 0.016, DIM.PIPE_OUTER_R + 0.016, 0.058, 28, 1, true),
  );
  hoseClampGeo.rotateZ(Math.PI / 2);
  const hoseClamp = new THREE.Mesh(hoseClampGeo, mats.boltZinc);
  hoseClamp.position.set(DIM.DISCHARGE_MOUTH_X + 0.01, DIM.DISCHARGE_MOUTH_Y, pz);
  dischargeHoseGroup.add(hoseClamp);
  dischargeHoseGroup.visible = true;

  // =========================================================================
  // 2. UPPER KOPEL + PARALLEL 18° EXTERNAL SHAFT + LOWER ENTRY KOPEL + GLAND
  //    - External shaft runs strictly PARALLEL (-18°) above the white PVC pipe
  //      from Upper Kopel K1 (-0.42, 0.91) to Lower Entry Kopel K2 (s = 3.18 m),
  //      supported by 3x UCP-205 pillow blocks on clamped steel riser pedestals.
  //    - At K2, the shaft articulates by ~10° and dives through a Sealed Brass-Nut
  //      Gland Stuffing Box piercing the top wall of the white PVC pipe ~1.0 m
  //      upstream of the impeller (s_prop = 4.78 m), driving the hub concentrically!
  // =========================================================================
  const kopelPos = getKopelPos(); // (-0.42, 0.91, 0.38)
  const lowerKopelPos = getLowerEntryKopelPos(); // s = 3.18 m (~2.66, -0.09, 0.38)
  const propPos = getPropellerPos(); // s = 4.78 m (+4.096, -0.857, 0.38)

  const parallelVec = new THREE.Vector3().subVectors(lowerKopelPos, kopelPos);
  const parallelLen = parallelVec.length();
  const parallelAngle = Math.atan2(parallelVec.y, parallelVec.x); // Exact -18.0 deg

  const entryVec = new THREE.Vector3().subVectors(propPos, lowerKopelPos);
  const entryLen = entryVec.length();
  const entryAngle = Math.atan2(entryVec.y, entryVec.x); // ~ -28.1 deg (~10 deg bend at K2)

  // --- 2A. UPPER KOPEL (UNIVERSAL JOINT #1 AT ELBOW) ---
  kopelGroup.position.copy(kopelPos);

  const kopelInputYoke = buildKopelYoke(mats, 1.0);
  kopelGroup.add(kopelInputYoke);

  const kopelSpiderPivot = new THREE.Group();
  kopelSpiderPivot.rotation.z = parallelAngle * 0.5;
  kopelGroup.add(kopelSpiderPivot);

  const kopelSpiderSpin = new THREE.Group();
  const crossPin1 = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.092, 14)),
    mats.machinedSteel,
  );
  const crossPin2 = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.014, 0.014, 0.092, 14)),
    mats.machinedSteel,
  );
  crossPin2.rotation.x = Math.PI / 2;
  const crossCore = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.036, 0.036, 0.036)),
    mats.kopelBlackSteel,
  );
  kopelSpiderSpin.add(crossPin1, crossPin2, crossCore);
  kopelSpiderPivot.add(kopelSpiderSpin);

  const kopelOutputPivot = new THREE.Group();
  kopelOutputPivot.rotation.z = parallelAngle;
  kopelGroup.add(kopelOutputPivot);

  const kopelOutputSpin = new THREE.Group();
  kopelOutputPivot.add(kopelOutputSpin);

  const kopelOutputYoke = buildKopelYoke(mats, 1.0);
  kopelOutputYoke.rotation.y = Math.PI;
  kopelOutputYoke.rotation.x = Math.PI / 2;
  kopelOutputSpin.add(kopelOutputYoke);

  // --- 2B. EXTERNAL PARALLEL 18° STAINLESS DRIVE SHAFT (K1 -> K2) ---
  // Stationary tilt pivot + inner local-X spin child = mathematically zero wobble!
  const parallelShaftTiltPivot = new THREE.Group();
  parallelShaftTiltPivot.position.copy(kopelPos);
  parallelShaftTiltPivot.rotation.z = parallelAngle;
  driveShaftGroup.add(parallelShaftTiltPivot);

  const parallelShaftSpinGroup = new THREE.Group();
  parallelShaftTiltPivot.add(parallelShaftSpinGroup);

  const parallelShaftMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.020, 0.020, parallelLen, 20)),
    mats.machinedSteel,
  );
  parallelShaftMesh.rotation.z = Math.PI / 2;
  parallelShaftMesh.position.x = parallelLen * 0.5;
  parallelShaftMesh.castShadow = true;
  parallelShaftSpinGroup.add(parallelShaftMesh);

  // Machined keyway stripe along parallel shaft so rotation is immediately readable
  const shaftKeyStrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(parallelLen * 0.90, 0.007, 0.042)),
    mats.castIronDark,
  );
  shaftKeyStrip.position.x = parallelLen * 0.5;
  parallelShaftSpinGroup.add(shaftKeyStrip);

  // --- 2C. LOWER ENTRY KOPEL / JOINT (#2 AT s = 3.18 m, ~1.6 m BEFORE IMPELLER) ---
  lowerKopelGroup.position.copy(lowerKopelPos);

  const lowerKopelInputPivot = new THREE.Group();
  lowerKopelInputPivot.rotation.z = parallelAngle;
  lowerKopelGroup.add(lowerKopelInputPivot);

  const lowerKopelInputSpin = new THREE.Group();
  lowerKopelInputPivot.add(lowerKopelInputSpin);
  lowerKopelInputSpin.add(buildKopelYoke(mats, 0.90));

  const lowerKopelSpiderPivot = new THREE.Group();
  lowerKopelSpiderPivot.rotation.z = (parallelAngle + entryAngle) * 0.5;
  lowerKopelGroup.add(lowerKopelSpiderPivot);

  const lowerKopelSpiderSpin = new THREE.Group();
  const lPin1 = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.0125, 0.0125, 0.082, 14)),
    mats.machinedSteel,
  );
  const lPin2 = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.0125, 0.0125, 0.082, 14)),
    mats.machinedSteel,
  );
  lPin2.rotation.x = Math.PI / 2;
  const lCore = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.032, 0.032, 0.032)),
    mats.kopelBlackSteel,
  );
  lowerKopelSpiderSpin.add(lPin1, lPin2, lCore);
  lowerKopelSpiderPivot.add(lowerKopelSpiderSpin);

  const lowerKopelOutputPivot = new THREE.Group();
  lowerKopelOutputPivot.rotation.z = entryAngle;
  lowerKopelGroup.add(lowerKopelOutputPivot);

  const lowerKopelOutputSpin = new THREE.Group();
  lowerKopelOutputPivot.add(lowerKopelOutputSpin);

  const lowerOutputYoke = buildKopelYoke(mats, 0.90);
  lowerOutputYoke.rotation.y = Math.PI;
  lowerOutputYoke.rotation.x = Math.PI / 2;
  lowerKopelOutputSpin.add(lowerOutputYoke);

  // --- 2D. FINAL ENTRY SHAFT (K2 -> PROPELLER HUB, PIERCING PVC 1m BEFORE IMPELLER) ---
  const entryShaftTiltPivot = new THREE.Group();
  entryShaftTiltPivot.position.copy(lowerKopelPos);
  entryShaftTiltPivot.rotation.z = entryAngle;
  driveShaftGroup.add(entryShaftTiltPivot);

  const entryShaftSpinGroup = new THREE.Group();
  entryShaftTiltPivot.add(entryShaftSpinGroup);

  const entryShaftMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.019, 0.019, entryLen, 18)),
    mats.machinedSteel,
  );
  entryShaftMesh.rotation.z = Math.PI / 2;
  entryShaftMesh.position.x = entryLen * 0.5;
  entryShaftMesh.castShadow = true;
  entryShaftSpinGroup.add(entryShaftMesh);

  const entryKeyStrip = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(entryLen * 0.72, 0.006, 0.040)),
    mats.castIronDark,
  );
  entryKeyStrip.position.x = entryLen * 0.45;
  entryShaftSpinGroup.add(entryKeyStrip);

  // --- 2E. SEALED BRASS-NUT GLAND STUFFING BOX (~1.0 m UPSTREAM OF IMPELLER) ---
  // Exact top-wall intersection fraction along K2 -> propPos:
  const tGland = (DIM.SHAFT_PERP_OFFSET - DIM.PIPE_OUTER_R) / DIM.SHAFT_PERP_OFFSET;
  const glandPos = lowerKopelPos.clone().lerp(propPos, tGland);
  const glandGroup = new THREE.Group();
  glandGroup.position.copy(glandPos);
  glandGroup.rotation.z = entryAngle;

  // Welded saddle collar + cylindrical stuffing box sleeve sealing the PVC top wall
  const glandSleeve = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.050, 0.058, 0.22, 22)),
    mats.castIronDark,
  );
  glandSleeve.rotation.z = Math.PI / 2;
  glandSleeve.castShadow = true;
  glandGroup.add(glandSleeve);

  const glandFlange = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.072, 0.072, 0.022, 22)),
    mats.clampSteel,
  );
  glandFlange.rotation.z = Math.PI / 2;
  glandFlange.position.x = -0.095;
  glandGroup.add(glandFlange);

  const brassNut = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.040, 6)),
    mats.brassFitting,
  );
  brassNut.rotation.z = Math.PI / 2;
  brassNut.position.x = -0.122;
  glandGroup.add(brassNut);

  const greaseCup = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.014, 0.01, 0.034, 12)),
    mats.brassFitting,
  );
  greaseCup.position.set(-0.045, 0.062, 0);
  glandGroup.add(greaseCup);

  pipeGroup.add(glandGroup);

  // =========================================================================
  // 3. WELDED STEEL UPPER MOUNTING FRAME + 3x UCP-205 PIPE RISER PEDESTALS
  // =========================================================================
  const topPlatformY = py - 0.065;
  for (const fz of [pz - 0.085, pz + 0.085]) {
    const rail = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.86, 0.026, 0.036)),
      mats.chassisBlackSteel,
    );
    rail.position.set(-0.52, topPlatformY, fz);
    rail.castShadow = true;
    upperFrameGroup.add(rail);
  }
  for (const bx of [-0.76, -0.56]) {
    const cross = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.065, 0.018, 0.21)),
      mats.chassisBlackSteel,
    );
    cross.position.set(bx, topPlatformY + 0.008, pz);
    upperFrameGroup.add(cross);
  }

  // Vertical posts bolting upper pulley frame cleanly onto full steel pipe collars (zero floating posts!)
  const upperCollarBandGeo = trackGeo(new THREE.TorusGeometry(DIM.PIPE_OUTER_R + 0.008, 0.011, 10, 32));
  const upperCollarEarGeo = trackGeo(new THREE.BoxGeometry(0.044, 0.036, 0.048));
  for (const lx of [-0.78, -0.56]) {
    const pyPipe = DIM.DISCHARGE_MOUTH_Y;
    // Full bolted steel collar wrapped completely around the 12" horizontal PVC pipe
    const collar = new THREE.Group();
    collar.position.set(lx, pyPipe, pz);
    const band = new THREE.Mesh(upperCollarBandGeo, mats.clampSteel);
    band.rotation.y = Math.PI / 2;
    band.scale.set(1, 1, 2.0);
    band.castShadow = true;
    collar.add(band);
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(upperCollarEarGeo, mats.clampSteel);
      ear.position.set(0, 0, side * (DIM.PIPE_OUTER_R + 0.022));
      collar.add(ear);
    }
    upperFrameGroup.add(collar);

    // Twin vertical posts running cleanly from the collar ears up to the top bearing rails
    const legBot = pyPipe;
    const legTop = topPlatformY;
    const legH = Math.max(0.06, legTop - legBot);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.036, legH, 0.028)),
        mats.chassisBlackSteel,
      );
      post.position.set(lx, legBot + legH * 0.5, pz + side * (DIM.PIPE_OUTER_R + 0.016));
      post.castShadow = true;
      upperFrameGroup.add(post);

      // Upper horizontal cross-tab tying outer post inward to bearing rail
      const topTab = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.042, 0.022, 0.095)),
        mats.chassisBlackSteel,
      );
      topTab.position.set(lx, topPlatformY, pz + side * 0.13);
      upperFrameGroup.add(topTab);
    }
  }

  // Rear vertical posts of upper frame anchored directly onto the first inclined pipe clamp (s = 0.24)
  const firstClampPt = pipePointAtS(0.24);
  for (const side of [-1, 1]) {
    const postBot = firstClampPt.y;
    const postTop = topPlatformY;
    const postH = Math.max(0.06, postTop - postBot);
    const post = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.036, postH, 0.028)),
      mats.chassisBlackSteel,
    );
    post.position.set(firstClampPt.x, postBot + postH * 0.5, pz + side * (DIM.PIPE_OUTER_R + 0.018));
    post.castShadow = true;
    upperFrameGroup.add(post);

    const topTab = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.042, 0.022, 0.10)),
      mats.chassisBlackSteel,
    );
    topTab.position.set(firstClampPt.x, topPlatformY, pz + side * 0.13);
    upperFrameGroup.add(topTab);
  }

  // UCP-205 Pillow Blocks #3, #4 & #5 along the parallel 18° external shaft + clamped riser pedestals
  const ucpStationsS = [0.60, 1.75, 2.85];
  const riserClearH = DIM.SHAFT_PERP_OFFSET - 0.056 - (DIM.PIPE_OUTER_R + 0.008);
  const riserPadGeo = trackGeo(new THREE.BoxGeometry(0.068, 0.014, 0.176));
  const riserLegGeo = trackGeo(new THREE.BoxGeometry(0.052, riserClearH, 0.016));
  const riserBaseGeo = trackGeo(new THREE.BoxGeometry(0.072, 0.016, 0.168));

  for (const sVal of ucpStationsS) {
    // Pillow block positioned exactly on externalShaftPointAtS(s)
    const pbPos = externalShaftPointAtS(sVal);
    const pb = createUcp205PillowBlock();
    pb.position.copy(pbPos);
    pb.rotation.z = parallelAngle;
    clampsGroup.add(pb);

    // Welded steel riser saddle sitting directly atop the bolted pipe clamp
    const pipePt = pipePointAtS(sVal);
    const riser = new THREE.Group();
    riser.position.copy(pipePt);
    riser.rotation.z = parallelAngle;

    const basePl = new THREE.Mesh(riserBaseGeo, mats.chassisBlackSteel);
    basePl.position.y = DIM.PIPE_OUTER_R + 0.008;
    basePl.castShadow = true;
    riser.add(basePl);

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(riserLegGeo, mats.chassisBlackSteel);
      leg.position.set(0, DIM.PIPE_OUTER_R + 0.012 + riserClearH * 0.5, side * 0.060);
      leg.castShadow = true;
      riser.add(leg);
    }

    const topPad = new THREE.Mesh(riserPadGeo, mats.chassisBlackSteel);
    topPad.position.y = DIM.SHAFT_PERP_OFFSET - 0.062;
    topPad.castShadow = true;
    riser.add(topPad);

    clampsGroup.add(riser);
  }

  // Angled stiffener bridge tying upper horizontal frame down to UCP-205 #3 riser
  const bridgeStart = new THREE.Vector3(-0.14, topPlatformY, pz);
  const ucp3Pos = externalShaftPointAtS(ucpStationsS[0]);
  const bridgeEnd = ucp3Pos.clone().add(new THREE.Vector3(-0.02, -0.062, 0));
  const bridgeVec = new THREE.Vector3().subVectors(bridgeEnd, bridgeStart);
  const bridgeLen = bridgeVec.length();
  for (const fz of [-0.072, 0.072]) {
    const arm = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(bridgeLen, 0.024, 0.024)),
      mats.chassisBlackSteel,
    );
    arm.position.copy(bridgeStart).lerp(bridgeEnd, 0.5);
    arm.position.z += fz;
    arm.rotation.z = Math.atan2(bridgeVec.y, bridgeVec.x);
    arm.castShadow = true;
    upperFrameGroup.add(arm);
  }

  // =========================================================================
  // 4. FIXED 100 cm HORIZONTAL + 500 cm INCLINED (18°) WHITE PVC 12" PIPE
  // =========================================================================
  const intakeX = DIM.INTAKE_END_X;
  const intakeY = DIM.INTAKE_END_Y;
  const propX = DIM.PROPELLER_X;
  const propY = DIM.PROPELLER_Y;

  // Hotspot anchors
  const vbeltAnchor = new THREE.Object3D();
  vbeltAnchor.position.set(DIM.BELT_X, (DIM.ENGINE_CRANK_Y + DIM.DRIVEN_PULLEY_Y) * 0.5, 0.06);
  root.add(vbeltAnchor);

  const kopelAnchor = new THREE.Object3D();
  kopelAnchor.position.set(lowerKopelPos.x, lowerKopelPos.y + 0.16, pz);
  root.add(kopelAnchor);

  const dischargeAnchor = new THREE.Object3D();
  dischargeAnchor.position.set(DIM.DISCHARGE_MOUTH_X, DIM.DISCHARGE_MOUTH_Y + 0.22, pz);
  root.add(dischargeAnchor);

  const propellerAnchor = new THREE.Object3D();
  propellerAnchor.position.set(propX, propY + 0.26, pz);
  root.add(propellerAnchor);

  // Main 12-Inch (300mm) White PVC Pipe: Exact 100 cm Horizontal -> 500 cm @ 18 deg
  const pipeCurvePts = [
    new THREE.Vector3(DIM.DISCHARGE_MOUTH_X, DIM.DISCHARGE_MOUTH_Y, pz), // -1.45, 0.62
    new THREE.Vector3(-0.95, DIM.DISCHARGE_MOUTH_Y, pz),
    new THREE.Vector3(-0.54, DIM.DISCHARGE_MOUTH_Y, pz),
    new THREE.Vector3(-0.32, pipeCenterYAt(-0.32), pz), // Crisp 18° elbow bend at -0.45
    new THREE.Vector3(0.55, pipeCenterYAt(0.55), pz),
    new THREE.Vector3(2.35, pipeCenterYAt(2.35), pz),
    new THREE.Vector3(intakeX, intakeY, pz), // +4.305, -0.925
  ];
  const pipeCurve = new THREE.CatmullRomCurve3(pipeCurvePts, false, 'centripetal', 0.18);

  const pipeGeo = trackGeo(
    new THREE.TubeGeometry(pipeCurve, 92, DIM.PIPE_OUTER_R, 32, false),
  );

  const pipeSolidMesh = new THREE.Mesh(pipeGeo, mats.pumpPipeSolid);
  pipeSolidMesh.castShadow = true;
  pipeSolidMesh.receiveShadow = true;
  pipeGroup.add(pipeSolidMesh);

  const pipeXrayMesh = new THREE.Mesh(pipeGeo, mats.pumpPipeXray);
  pipeXrayMesh.visible = false;
  pipeXrayMesh.renderOrder = 3;
  pipeGroup.add(pipeXrayMesh);

  // Heavy 12-Bolt Steel Backing Flange + EPDM Rubber Gasket at the exact 18° Miter Elbow (X = -0.45 m)
  const elbowFlangeGroup = new THREE.Group();
  elbowFlangeGroup.position.set(DIM.PIPE_ELBOW_JOIN_X, DIM.PIPE_ELBOW_JOIN_Y, pz);
  elbowFlangeGroup.rotation.z = -DIM.PIPE_SLOPE_RAD * 0.5; // Bisects 0° horizontal & -18° inclined pipe!

  const flangeRingShape = new THREE.Shape();
  flangeRingShape.absarc(0, 0, DIM.PIPE_OUTER_R + 0.044, 0, Math.PI * 2, false);
  const flangeHole = new THREE.Path();
  flangeHole.absarc(0, 0, DIM.PIPE_OUTER_R - 0.002, 0, Math.PI * 2, true);
  flangeRingShape.holes.push(flangeHole);

  const flangePlateGeo = trackGeo(
    new THREE.ExtrudeGeometry(flangeRingShape, {
      depth: 0.016,
      bevelEnabled: true,
      bevelThickness: 0.0025,
      bevelSize: 0.002,
      bevelSegments: 2,
    }),
  );
  flangePlateGeo.rotateY(Math.PI / 2);

  // Twin steel backing flange rings clamping the 18° PVC miter joint
  for (const fx of [-0.020, 0.004]) {
    const fDisc = new THREE.Mesh(flangePlateGeo, mats.clampSteel);
    fDisc.position.x = fx;
    fDisc.castShadow = true;
    fDisc.receiveShadow = true;
    elbowFlangeGroup.add(fDisc);
  }

  // EPDM black rubber sealing gasket sandwiched between the steel flanges
  const gasketGeo = trackGeo(
    new THREE.CylinderGeometry(DIM.PIPE_OUTER_R + 0.040, DIM.PIPE_OUTER_R + 0.040, 0.008, 32),
  );
  gasketGeo.rotateZ(Math.PI / 2);
  const gasketMesh = new THREE.Mesh(gasketGeo, mats.tireRubber);
  elbowFlangeGroup.add(gasketMesh);

  // 12 galvanized hex flange bolts & nuts circling the 18° steel backing flange
  const flangeBoltGeo = trackGeo(new THREE.CylinderGeometry(0.0075, 0.0075, 0.056, 6));
  flangeBoltGeo.rotateZ(Math.PI / 2);
  const flangeNutGeo = trackGeo(new THREE.CylinderGeometry(0.0115, 0.0115, 0.010, 6));
  flangeNutGeo.rotateZ(Math.PI / 2);
  const boltCircleR = DIM.PIPE_OUTER_R + 0.026;

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const by = Math.cos(a) * boltCircleR;
    const bz = Math.sin(a) * boltCircleR;

    const bolt = new THREE.Mesh(flangeBoltGeo, mats.boltZinc);
    bolt.position.set(0, by, bz);
    elbowFlangeGroup.add(bolt);

    for (const nx of [-0.024, 0.024]) {
      const nut = new THREE.Mesh(flangeNutGeo, mats.boltZinc);
      nut.position.set(nx, by, bz);
      elbowFlangeGroup.add(nut);
    }
  }
  pipeGroup.add(elbowFlangeGroup);

  // Reinforced steel lip flange at the 100 cm Horizontal Discharge Mouth
  const mouthFlangeGeo = trackGeo(
    new THREE.TorusGeometry(DIM.PIPE_OUTER_R + 0.008, 0.015, 12, 32),
  );
  const mouthFlange = new THREE.Mesh(mouthFlangeGeo, mats.clampSteel);
  mouthFlange.position.set(DIM.DISCHARGE_MOUTH_X, DIM.DISCHARGE_MOUTH_Y, pz);
  const qMouth = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    DIM.DISCHARGE_DIR,
  );
  mouthFlange.quaternion.copy(qMouth);
  mouthFlange.castShadow = true;
  pipeGroup.add(mouthFlange);

  // Flared Intake Bellmouth Ring aligned strictly perpendicular to 18° inclined white PVC pipe
  const intakeFlangeGeo = trackGeo(
    new THREE.TorusGeometry(DIM.PIPE_OUTER_R + 0.012, 0.014, 12, 32),
  );
  const intakeFlange = new THREE.Mesh(intakeFlangeGeo, mats.clampSteel);
  intakeFlange.position.set(intakeX, intakeY, pz);
  const qIntake = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(Math.cos(DIM.PIPE_SLOPE_RAD), -Math.sin(DIM.PIPE_SLOPE_RAD), 0),
  );
  intakeFlange.quaternion.copy(qIntake);
  pipeGroup.add(intakeFlange);

  // Internal 3-vane steady bearing spider just upstream of the impeller hub (s = 4.56 m)
  const vaneGeo = trackGeo(new THREE.BoxGeometry(0.045, DIM.PIPE_INNER_R - 0.025, 0.009));
  const spiderHubGeo = trackGeo(new THREE.CylinderGeometry(0.036, 0.036, 0.065, 16));
  const spiderPt = pipePointAtS(DIM.PROPELLER_S - 0.22);
  const spider = new THREE.Group();
  spider.position.copy(spiderPt);
  spider.rotation.z = -DIM.PIPE_SLOPE_RAD;

  const sHub = new THREE.Mesh(spiderHubGeo, mats.castIronDark);
  sHub.rotation.z = Math.PI / 2;
  spider.add(sHub);

  for (let v = 0; v < 3; v++) {
    const a = (v / 3) * Math.PI * 2;
    const vane = new THREE.Mesh(vaneGeo, mats.clampSteel);
    const midR = (DIM.PIPE_INNER_R + 0.03) * 0.5;
    vane.position.set(0, Math.cos(a) * midR, Math.sin(a) * midR);
    vane.rotation.x = a;
    spider.add(vane);
  }
  pipeGroup.add(spider);

  // -----------------------------------------------------------------------
  // B. 5 Bolted Steel Band Clamps along the 18° White PVC Column + Tie Bars
  //    Aligned with the 3 UCP-205 riser pedestals + elbow & gland reinforcement!
  // -----------------------------------------------------------------------
  const clampStationsS = [0.24, 0.60, 1.75, 2.85, 3.88];
  const bandGeo = trackGeo(new THREE.TorusGeometry(DIM.PIPE_OUTER_R + 0.008, 0.011, 10, 32));
  const earGeo = trackGeo(new THREE.BoxGeometry(0.044, 0.042, 0.055));
  const clampBoltGeo = trackGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.075, 6));

  for (const sPos of clampStationsS) {
    const cPt = pipePointAtS(sPos);
    const clamp = new THREE.Group();
    clamp.position.copy(cPt);
    clamp.rotation.z = -DIM.PIPE_SLOPE_RAD;

    const band = new THREE.Mesh(bandGeo, mats.clampSteel);
    band.rotation.y = Math.PI / 2;
    band.scale.set(1, 1, 2.2);
    band.castShadow = true;
    clamp.add(band);

    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, mats.clampSteel);
      ear.position.set(0, 0, side * (DIM.PIPE_OUTER_R + 0.028));
      clamp.add(ear);

      const cBolt = new THREE.Mesh(clampBoltGeo, mats.boltZinc);
      cBolt.position.set(0, 0, side * (DIM.PIPE_OUTER_R + 0.036));
      clamp.add(cBolt);
    }
    clampsGroup.add(clamp);
  }

  // Twin longitudinal stiffener tie-bars connecting the band clamps along the 18° white PVC slope
  const tieStart = pipePointAtS(clampStationsS[0]);
  const tieEnd = pipePointAtS(clampStationsS[clampStationsS.length - 1]);
  const tieVec = new THREE.Vector3().subVectors(tieEnd, tieStart);
  const tieGeo = trackGeo(new THREE.BoxGeometry(tieVec.length(), 0.022, 0.026));
  for (const side of [-1, 1]) {
    const tieBar = new THREE.Mesh(tieGeo, mats.chassisBlackSteel);
    tieBar.position.copy(tieStart).lerp(tieEnd, 0.5);
    tieBar.position.z += side * (DIM.PIPE_OUTER_R + 0.026);
    tieBar.rotation.z = -DIM.PIPE_SLOPE_RAD;
    clampsGroup.add(tieBar);
  }

  // -----------------------------------------------------------------------
  // C. 3-Blade Open Axial Flow Propeller + Saringan Pompa Strainer Cage
  // -----------------------------------------------------------------------
  propellerContainer.position.copy(propPos);
  propellerContainer.rotation.z = -DIM.PIPE_SLOPE_RAD;
  const propellerSpinGroup = buildAxialPropeller(mats);
  propellerContainer.add(propellerSpinGroup);

  // Saringan Pompa (BOM C.7): Welded Steel-Bar Intake Suction Strainer Cage at canal inlet
  const strainerGroup = new THREE.Group();
  const sLen = 0.25;
  const sRad = DIM.PIPE_OUTER_R + 0.004;
  const endRingGeo = trackGeo(new THREE.TorusGeometry(sRad, 0.009, 8, 28));
  const midRingGeo = trackGeo(new THREE.TorusGeometry(sRad, 0.007, 8, 28));
  const barGeo = trackGeo(new THREE.CylinderGeometry(0.005, 0.005, sLen, 8));
  const capCrossGeo = trackGeo(new THREE.CylinderGeometry(0.0055, 0.0055, sRad * 2, 8));

  for (const rx of [0.01, sLen * 0.5, sLen]) {
    const ring = new THREE.Mesh(rx === sLen * 0.5 ? midRingGeo : endRingGeo, mats.clampSteel);
    ring.rotation.y = Math.PI / 2;
    ring.position.x = rx;
    strainerGroup.add(ring);
  }

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const bar = new THREE.Mesh(barGeo, mats.clampSteel);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(sLen * 0.5, Math.cos(a) * sRad, Math.sin(a) * sRad);
    strainerGroup.add(bar);
  }

  for (let i = 0; i < 3; i++) {
    const crossBar = new THREE.Mesh(capCrossGeo, mats.clampSteel);
    crossBar.position.set(sLen, 0, 0);
    crossBar.rotation.x = (i / 3) * Math.PI;
    strainerGroup.add(crossBar);
  }

  strainerContainer.position.set(intakeX, intakeY, pz);
  strainerContainer.rotation.z = -DIM.PIPE_SLOPE_RAD;
  strainerContainer.add(strainerGroup);

  // -----------------------------------------------------------------------
  // C2. ADAPTIVE STEEL A-FRAME PIPE SUPPORT STAND ON CANAL SIDE (s = 3.55 m)
  //     Prevents the 500 cm grey PVC AW column + water load from sagging!
  //     - Tanggul mode: legs plant directly into the canal bed/slope
  //     - Studio & Field mode: legs land flush on the -1.32 m test floor
  // -----------------------------------------------------------------------
  const aFramePt = pipePointAtS(DIM.CANAL_AFRAME_S);
  const aFrameCollar = new THREE.Group();
  aFrameCollar.position.copy(aFramePt);
  aFrameCollar.rotation.z = -DIM.PIPE_SLOPE_RAD;

  // Heavy bolted saddle collar clamping the 12" PVC AW column
  const afBand = new THREE.Mesh(bandGeo, mats.clampSteel);
  afBand.rotation.y = Math.PI / 2;
  afBand.scale.set(1, 1, 2.8);
  afBand.castShadow = true;
  aFrameCollar.add(afBand);

  const afSaddleArcGeo = trackGeo(
    new THREE.CylinderGeometry(
      DIM.PIPE_OUTER_R + 0.014,
      DIM.PIPE_OUTER_R + 0.014,
      0.11,
      22,
      1,
      true,
      Math.PI * 0.65,
      Math.PI * 0.70,
    ),
  );
  afSaddleArcGeo.rotateZ(Math.PI / 2);
  const afSaddleArc = new THREE.Mesh(afSaddleArcGeo, mats.chassisBlackSteel);
  afSaddleArc.castShadow = true;
  aFrameCollar.add(afSaddleArc);

  const afUnderBeam = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(0.11, 0.048, 0.54)),
    mats.chassisBlackSteel,
  );
  afUnderBeam.position.y = -(DIM.PIPE_OUTER_R + 0.032);
  afUnderBeam.castShadow = true;
  aFrameCollar.add(afUnderBeam);

  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, mats.clampSteel);
    ear.position.set(0, 0, side * (DIM.PIPE_OUTER_R + 0.028));
    aFrameCollar.add(ear);

    const bolt = new THREE.Mesh(clampBoltGeo, mats.boltZinc);
    bolt.position.set(0, 0, side * (DIM.PIPE_OUTER_R + 0.036));
    aFrameCollar.add(bolt);
  }
  canalSupportGroup.add(aFrameCollar);

  // Helper to construct twin splayed A-frame steel legs + horizontal cross-brace + baseplates
  const buildAFrameLegs = (targetFootYForSide: (zFoot: number) => number, spreadZ: number): THREE.Group => {
    const g = new THREE.Group();
    const topY = aFramePt.y - DIM.PIPE_OUTER_R - 0.035;
    const zAxis = new THREE.Vector3(0, 0, 1);

    const legBottomPoints: THREE.Vector3[] = [];
    for (const side of [-1, 1]) {
      const zTop = pz + side * 0.22;
      const zFoot = pz + side * spreadZ;
      const yFoot = targetFootYForSide(zFoot);
      const pTop = new THREE.Vector3(aFramePt.x, topY, zTop);
      const pFoot = new THREE.Vector3(aFramePt.x, yFoot, zFoot);
      legBottomPoints.push(pFoot);

      const vec = new THREE.Vector3().subVectors(pFoot, pTop);
      const legLen = Math.max(0.12, vec.length());
      const legMesh = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.054, 0.054, legLen)),
        mats.chassisBlackSteel,
      );
      legMesh.position.copy(pTop).lerp(pFoot, 0.5);
      legMesh.quaternion.setFromUnitVectors(zAxis, vec.normalize());
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      g.add(legMesh);

      // Angled longitudinal buttress kicker leg resisting 18° axial thrust toward the canal
      const pKickerFoot = new THREE.Vector3(aFramePt.x + 0.28, targetFootYForSide(zFoot), zFoot);
      const kVec = new THREE.Vector3().subVectors(pKickerFoot, pTop);
      const kMesh = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.034, 0.034, Math.max(0.12, kVec.length()))),
        mats.chassisBlackSteel,
      );
      kMesh.position.copy(pTop).lerp(pKickerFoot, 0.5);
      kMesh.quaternion.setFromUnitVectors(zAxis, kVec.normalize());
      kMesh.castShadow = true;
      g.add(kMesh);

      // Heavy steel foot baseplate + anchor bolts
      const footPlate = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.38, 0.022, 0.20)),
        mats.castIronDark,
      );
      footPlate.position.set(aFramePt.x + 0.14, yFoot + 0.011, zFoot);
      footPlate.castShadow = true;
      footPlate.receiveShadow = true;
      g.add(footPlate);
    }

    // Mid-height horizontal A-frame cross-tie bar
    const midY = (topY + Math.min(legBottomPoints[0].y, legBottomPoints[1].y)) * 0.5;
    const midHalfSpan = (0.22 + spreadZ) * 0.5;
    const crossTie = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.042, 0.042, midHalfSpan * 2 + 0.04)),
      mats.chassisBlackSteel,
    );
    crossTie.position.set(aFramePt.x, midY, pz);
    crossTie.castShadow = true;
    g.add(crossTie);

    return g;
  };

  // Variant 1: Tanggul mode legs anchored into the canal bed/slope
  const aFrameTanggulLegs = buildAFrameLegs(
    (zFoot) => leveeTerrainHeightAt(aFramePt.x, zFoot) - 0.02,
    0.58,
  );
  canalSupportGroup.add(aFrameTanggulLegs);

  // Variant 2: Studio & Field mode legs resting flush on the -1.32 m floor
  const aFramePodiumLegs = buildAFrameLegs(
    () => DIM.PODIUM_FLOOR_Y,
    0.56,
  );
  aFramePodiumLegs.visible = false;
  canalSupportGroup.add(aFramePodiumLegs);

  // -----------------------------------------------------------------------
  // D. Internal Helical Axial Water Flow Streamlines (Visible in X-Ray)
  // -----------------------------------------------------------------------
  for (let s = 0; s < 3; s++) {
    const helixPts: THREE.Vector3[] = [];
    const steps = 54;
    const phaseOff = (s / 3) * Math.PI * 2;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const pt = pipeCurve.getPoint(1 - u);
      const swirlR = 0.092 * (1 - 0.25 * Math.pow(u, 2));
      const angle = phaseOff + u * Math.PI * 8.0;
      helixPts.push(
        new THREE.Vector3(
          pt.x,
          pt.y + Math.cos(angle) * swirlR,
          pt.z + Math.sin(angle) * swirlR,
        ),
      );
    }
    const helixCurve = new THREE.CatmullRomCurve3(helixPts);
    const helixGeo = trackGeo(new THREE.TubeGeometry(helixCurve, 80, 0.013, 6, false));
    const helixMesh = new THREE.Mesh(helixGeo, mats.internalFlowShader);
    helixMesh.renderOrder = 2;
    internalFlowGroup.add(helixMesh);
  }

  // =========================================================================
  // KINEMATICS, X-RAY, ADAPTIVE HOSE & EXPLODED VIEW UPDATE
  // =========================================================================
  const updateKinematics = (
    engineAngle: number,
    rpm: number,
    xrayMix: number,
    explodeMix: number,
    waterFlowEnabled: boolean,
    dischargeHoseAttached: boolean,
    beltGuardVisible: boolean,
    cavitationEfficiency: number,
    stageMode: StageMode,
    time: number,
  ) => {
    const pumpAngle = engineAngle / PULLEY_RATIO;
    const normRpm = Math.max(0, Math.min(1, rpm / 2200));

    // 1. Driven Pulley & 40 cm Countershaft
    drivenPulleySpinGroup.rotation.x = pumpAngle;

    // 2. Triple V-Belt B-69 texture translation synced to pulley surface speed
    const beltLinearDist = (engineAngle * DIM.DRIVE_PULLEY_RADIUS) / 0.55;
    mats.vbeltRubber.map!.offset.x = -(beltLinearDist % 1);

    // 3. Upper Kopel Universal Joint (strictly on-axis local X spin)
    kopelInputYoke.rotation.x = pumpAngle;
    kopelSpiderSpin.rotation.x = pumpAngle;
    kopelOutputSpin.rotation.x = pumpAngle;

    // 4. Parallel 18° External Shaft, Lower Entry Kopel, Final Entry Shaft & Propeller
    parallelShaftSpinGroup.rotation.x = pumpAngle;
    lowerKopelInputSpin.rotation.x = pumpAngle;
    lowerKopelSpiderSpin.rotation.x = pumpAngle;
    lowerKopelOutputSpin.rotation.x = pumpAngle;
    entryShaftSpinGroup.rotation.x = pumpAngle;
    propellerSpinGroup.rotation.x = pumpAngle;

    // 5. Grey SNI PVC Pipe Solid vs Fresnel X-Ray Ghost Shader, Belt Guard & Adaptive Selang Buang
    mats.pumpPipeXray.uniforms.uXrayMix.value = xrayMix;
    pipeSolidMesh.visible = xrayMix < 0.45;
    pipeXrayMesh.visible = xrayMix > 0.05;

    beltGuardGroup.visible = beltGuardVisible;
    beltGuardGroup.position.set(-explodeMix * 0.62, explodeMix * 0.14, 0);

    dischargeHoseGroup.visible = dischargeHoseAttached;
    hoseTanggulGroup.visible = stageMode === 'tanggul';
    hosePodiumGroup.visible = stageMode !== 'tanggul';

    // Adaptive Steel A-Frame Pipe Support legs match Tanggul canal bed vs Studio/Field -1.32 m floor
    aFrameTanggulLegs.visible = stageMode === 'tanggul';
    aFramePodiumLegs.visible = stageMode !== 'tanggul';

    const flowActive =
      waterFlowEnabled && rpm > 260 ? normRpm * Math.max(0, cavitationEfficiency) : 0;
    mats.internalFlowShader.uniforms.uTime.value = time;
    mats.internalFlowShader.uniforms.uSpeed.value = normRpm;
    mats.internalFlowShader.uniforms.uOpacity.value = xrayMix * flowActive * 0.85;
    internalFlowGroup.visible = xrayMix > 0.05 && flowActive > 0.02;

    // 6. Smooth Exploded View Assembly Separations
    vbeltGroup.position.x = -explodeMix * 0.38;
    kopelGroup.position.set(
      kopelPos.x,
      kopelPos.y + explodeMix * 0.42,
      kopelPos.z,
    );
    lowerKopelGroup.position.set(
      lowerKopelPos.x,
      lowerKopelPos.y + explodeMix * 0.42,
      lowerKopelPos.z,
    );
    driveShaftGroup.position.y = explodeMix * 0.42;
    clampsGroup.position.y = explodeMix * 0.28;
    upperFrameGroup.position.y = explodeMix * 0.20;
    pipeGroup.position.z = explodeMix * 0.42;
    canalSupportGroup.position.z = explodeMix * 0.42;
    dischargeHoseGroup.position.set(-explodeMix * 0.45, 0, explodeMix * 0.42);

    propellerContainer.position.set(
      propX + explodeMix * 0.56 * Math.cos(DIM.PIPE_SLOPE_RAD),
      propY - explodeMix * 0.56 * Math.sin(DIM.PIPE_SLOPE_RAD),
      pz + explodeMix * 0.42,
    );
    strainerContainer.position.set(
      intakeX + explodeMix * 0.92 * Math.cos(DIM.PIPE_SLOPE_RAD),
      intakeY - explodeMix * 0.92 * Math.sin(DIM.PIPE_SLOPE_RAD),
      pz + explodeMix * 0.42,
    );
    propellerAnchor.position.set(
      propX + explodeMix * 0.56 * Math.cos(DIM.PIPE_SLOPE_RAD),
      propY - explodeMix * 0.56 * Math.sin(DIM.PIPE_SLOPE_RAD) + 0.26,
      pz + explodeMix * 0.42,
    );
    kopelAnchor.position.set(
      lowerKopelPos.x,
      lowerKopelPos.y + 0.16 + explodeMix * 0.42,
      pz,
    );
  };

  return {
    root,
    updateKinematics,
    getHotspotAnchors: () => ({
      vbelt: vbeltAnchor,
      kopel: kopelAnchor,
      discharge: dischargeAnchor,
      propeller: propellerAnchor,
    }),
    dispose: () => {
      disposableGeos.forEach((g) => g.dispose());
    },
  };
}
