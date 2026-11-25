import * as THREE from 'three';
import { CadDimensionId, Language, StageMode } from '../types';
import { DIM, pipePointAtS } from './dimensions';

export interface CadDimensionAnchor {
  id: CadDimensionId;
  anchor: THREE.Object3D;
  accent: 'amber' | 'cyan';
  getLabel: (
    stageMode: StageMode,
    canalWaterY: number,
    lang: Language,
  ) => {
    label: string;
    sublabel?: string;
  };
}

export interface CadDimensionsSystem {
  root: THREE.Group;
  getAnchors: () => CadDimensionAnchor[];
  update: (
    visible: boolean,
    stageMode: StageMode,
    canalWaterY: number,
    explodeMix: number,
  ) => void;
  dispose: () => void;
}

/**
 * Builds crisp 3D CAD Engineering Dimension lines, witness leader lines,
 * precision 3D cone arrowheads, and an exact 18-degree angle arc anchored
 * directly to the 12-inch PVC AW Axial Pump geometry.
 */
export function buildCadDimensionsOverlay(): CadDimensionsSystem {
  const root = new THREE.Group();
  root.name = 'CadDimensionsOverlay3D';
  root.visible = false;

  const disposables: Array<{ dispose: () => void }> = [];
  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const amberLineMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xf5b027,
      transparent: true,
      opacity: 0.95,
    }),
  );
  const amberWitnessMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0xf5b027,
      transparent: true,
      opacity: 0.55,
    }),
  );
  const cyanLineMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95,
    }),
  );
  const cyanWitnessMat = trackMat(
    new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
    }),
  );
  const amberArrowMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0xf5b027 }),
  );
  const cyanArrowMat = trackMat(
    new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
  );

  const arrowConeGeo = trackGeo(new THREE.ConeGeometry(0.022, 0.085, 10));
  const upY = new THREE.Vector3(0, 1, 0);

  const addLine = (
    parent: THREE.Object3D,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    mat: THREE.LineBasicMaterial,
  ) => {
    const geo = trackGeo(new THREE.BufferGeometry().setFromPoints([p1, p2]));
    const line = new THREE.Line(geo, mat);
    line.renderOrder = 8;
    parent.add(line);
    return line;
  };

  const addArrowHead = (
    parent: THREE.Object3D,
    tip: THREE.Vector3,
    dir: THREE.Vector3,
    mat: THREE.MeshBasicMaterial,
  ) => {
    const nDir = dir.clone().normalize();
    const cone = new THREE.Mesh(arrowConeGeo, mat);
    cone.position.copy(tip).addScaledVector(nDir, -0.042);
    cone.quaternion.setFromUnitVectors(upY, nDir);
    cone.renderOrder = 8;
    parent.add(cone);
    return cone;
  };

  const addLinearDimension = (
    parent: THREE.Object3D,
    srcA: THREE.Vector3,
    srcB: THREE.Vector3,
    offsetVec: THREE.Vector3,
    accent: 'amber' | 'cyan',
  ): THREE.Object3D => {
    const lineMat = accent === 'amber' ? amberLineMat : cyanLineMat;
    const witMat = accent === 'amber' ? amberWitnessMat : cyanWitnessMat;
    const arrowMat = accent === 'amber' ? amberArrowMat : cyanArrowMat;

    const dimA = srcA.clone().add(offsetVec);
    const dimB = srcB.clone().add(offsetVec);
    const overshoot = offsetVec.clone().normalize().multiplyScalar(0.07);

    // Extension / witness lines from actual geometry to dimension bar
    addLine(parent, srcA, dimA.clone().add(overshoot), witMat);
    addLine(parent, srcB, dimB.clone().add(overshoot), witMat);

    // Main dimension line + dual arrowheads
    addLine(parent, dimA, dimB, lineMat);
    const dirAB = new THREE.Vector3().subVectors(dimB, dimA).normalize();
    addArrowHead(parent, dimA, dirAB.clone().negate(), arrowMat);
    addArrowHead(parent, dimB, dirAB, arrowMat);

    // Anchor at exact midpoint for crisp DOM label projection
    const anchor = new THREE.Object3D();
    anchor.position.copy(dimA).lerp(dimB, 0.5);
    parent.add(anchor);
    return anchor;
  };

  const pz = DIM.PUMP_Z;
  const frontZ = pz + DIM.PIPE_OUTER_R + 0.16;

  // =========================================================================
  // 1. HORIZONTAL 100 cm DISCHARGE SPOUT DIMENSION (X: -1.45 -> -0.45)
  // =========================================================================
  const horizAnchor = addLinearDimension(
    root,
    new THREE.Vector3(DIM.DISCHARGE_MOUTH_X, DIM.PIPE_ELBOW_JOIN_Y + DIM.PIPE_OUTER_R, frontZ),
    new THREE.Vector3(DIM.PIPE_ELBOW_JOIN_X, DIM.PIPE_ELBOW_JOIN_Y + DIM.PIPE_OUTER_R, frontZ),
    new THREE.Vector3(0, 0.56, 0.08),
    'amber',
  );

  // =========================================================================
  // 2. INCLINED 500 cm COLUMN DIMENSION (s = 0 -> s = 5.0 m @ 18 deg)
  //    Offset cleanly down-front of the grey PVC pipe so it never touches the shaft
  // =========================================================================
  const perpDown = new THREE.Vector3(
    -Math.sin(DIM.PIPE_SLOPE_RAD),
    -Math.cos(DIM.PIPE_SLOPE_RAD),
    0,
  );
  const pElbowFront = pipePointAtS(0).add(new THREE.Vector3(0, 0, DIM.PIPE_OUTER_R + 0.04));
  const pIntakeFront = pipePointAtS(DIM.PIPE_INCLINED_LEN).add(
    new THREE.Vector3(0, 0, DIM.PIPE_OUTER_R + 0.04),
  );

  const inclinedAnchor = addLinearDimension(
    root,
    pElbowFront,
    pIntakeFront,
    perpDown.clone().multiplyScalar(0.54).add(new THREE.Vector3(0, 0, 0.24)),
    'amber',
  );

  // =========================================================================
  // 3. EXACT 18-DEGREE SLOPE ANGLE ARC AT MITER ELBOW
  // =========================================================================
  const elbowOrigin = new THREE.Vector3(DIM.PIPE_ELBOW_JOIN_X, DIM.PIPE_ELBOW_JOIN_Y, frontZ + 0.06);
  const refLen = 1.25;
  // Horizontal reference datum extending +X from elbow
  addLine(
    root,
    elbowOrigin,
    elbowOrigin.clone().add(new THREE.Vector3(refLen, 0, 0)),
    amberWitnessMat,
  );
  // Sloped 18° ray
  addLine(
    root,
    elbowOrigin,
    elbowOrigin.clone().add(
      new THREE.Vector3(
        Math.cos(DIM.PIPE_SLOPE_RAD) * refLen,
        -Math.sin(DIM.PIPE_SLOPE_RAD) * refLen,
        0,
      ),
    ),
    amberWitnessMat,
  );

  // Precision circular arc from 0° down to -18°
  const arcRadius = 0.98;
  const arcPts: THREE.Vector3[] = [];
  const arcSegs = 20;
  for (let i = 0; i <= arcSegs; i++) {
    const a = -(i / arcSegs) * DIM.PIPE_SLOPE_RAD;
    arcPts.push(
      new THREE.Vector3(
        elbowOrigin.x + Math.cos(a) * arcRadius,
        elbowOrigin.y + Math.sin(a) * arcRadius,
        elbowOrigin.z,
      ),
    );
  }
  const arcGeo = trackGeo(new THREE.BufferGeometry().setFromPoints(arcPts));
  const arcLine = new THREE.Line(arcGeo, amberLineMat);
  arcLine.renderOrder = 8;
  root.add(arcLine);

  const slopeAnchor = new THREE.Object3D();
  const midAngle = -DIM.PIPE_SLOPE_RAD * 0.5;
  slopeAnchor.position.set(
    elbowOrigin.x + Math.cos(midAngle) * (arcRadius + 0.26),
    elbowOrigin.y + Math.sin(midAngle) * (arcRadius + 0.26),
    elbowOrigin.z,
  );
  root.add(slopeAnchor);

  // =========================================================================
  // 4. GLAND-TO-IMPELLER ~100 cm DIMENSION (s = 3.88 m -> s = 4.78 m)
  // =========================================================================
  const pGland = pipePointAtS(3.84).add(new THREE.Vector3(0, DIM.PIPE_OUTER_R, 0.08));
  const pImpeller = pipePointAtS(DIM.PROPELLER_S).add(new THREE.Vector3(0, DIM.PIPE_OUTER_R, 0.08));
  const perpUp = new THREE.Vector3(
    Math.sin(DIM.PIPE_SLOPE_RAD),
    Math.cos(DIM.PIPE_SLOPE_RAD),
    0,
  );
  const glandAnchor = addLinearDimension(
    root,
    pGland,
    pImpeller,
    perpUp.clone().multiplyScalar(0.38).add(new THREE.Vector3(0, 0, 0.16)),
    'cyan',
  );

  // =========================================================================
  // 5. 12-INCH (Ø 300 mm) PIPE DIAMETER CALLOUT AT DISCHARGE MOUTH
  // =========================================================================
  const diaAnchor = addLinearDimension(
    root,
    new THREE.Vector3(DIM.DISCHARGE_MOUTH_X, DIM.DISCHARGE_MOUTH_Y - DIM.PIPE_OUTER_R, pz),
    new THREE.Vector3(DIM.DISCHARGE_MOUTH_X, DIM.DISCHARGE_MOUTH_Y + DIM.PIPE_OUTER_R, pz),
    new THREE.Vector3(-0.34, 0, 0.12),
    'cyan',
  );

  // =========================================================================
  // 6. DYNAMIC VERTICAL ELEVATION DIMENSION (STATIC LIFT IN TANGGUL / PODIUM 1.32m)
  //    Updated cleanly when canalWaterY or stageMode changes (zero per-frame GC)
  // =========================================================================
  const liftPositions = new Float32Array(6); // 2 vertices for main vertical bar
  const liftLineGeo = trackGeo(new THREE.BufferGeometry());
  liftLineGeo.setAttribute('position', new THREE.BufferAttribute(liftPositions, 3));
  const liftLine = new THREE.Line(liftLineGeo, cyanLineMat);
  liftLine.renderOrder = 8;
  root.add(liftLine);

  const liftTopWitPos = new Float32Array(6);
  const liftTopWitGeo = trackGeo(new THREE.BufferGeometry());
  liftTopWitGeo.setAttribute('position', new THREE.BufferAttribute(liftTopWitPos, 3));
  const liftTopWit = new THREE.Line(liftTopWitGeo, cyanWitnessMat);
  liftTopWit.renderOrder = 8;
  root.add(liftTopWit);

  const liftBotWitPos = new Float32Array(6);
  const liftBotWitGeo = trackGeo(new THREE.BufferGeometry());
  liftBotWitGeo.setAttribute('position', new THREE.BufferAttribute(liftBotWitPos, 3));
  const liftBotWit = new THREE.Line(liftBotWitGeo, cyanWitnessMat);
  liftBotWit.renderOrder = 8;
  root.add(liftBotWit);

  const liftTopArrow = new THREE.Mesh(arrowConeGeo, cyanArrowMat);
  liftTopArrow.renderOrder = 8;
  root.add(liftTopArrow);

  const liftBotArrow = new THREE.Mesh(arrowConeGeo, cyanArrowMat);
  liftBotArrow.rotation.z = Math.PI; // points straight down
  liftBotArrow.renderOrder = 8;
  root.add(liftBotArrow);

  const liftAnchor = new THREE.Object3D();
  root.add(liftAnchor);

  const setSeg = (
    geo: THREE.BufferGeometry,
    arr: Float32Array,
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
  ) => {
    arr[0] = x1;
    arr[1] = y1;
    arr[2] = z1;
    arr[3] = x2;
    arr[4] = y2;
    arr[5] = z2;
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  };

  let lastStage: StageMode | null = null;
  let lastCanalY = Number.NaN;

  const update = (
    visible: boolean,
    stageMode: StageMode,
    canalWaterY: number,
    explodeMix: number,
  ) => {
    root.visible = visible;
    if (!visible) return;

    // Subtle lateral shift only when exploded so CAD lines track the pipe cleanly
    root.position.z = explodeMix * 0.42;

    if (stageMode !== lastStage || Math.abs(canalWaterY - lastCanalY) > 0.002) {
      lastStage = stageMode;
      lastCanalY = canalWaterY;

      if (stageMode === 'tanggul') {
        // Vertical Static Lift from live Canal Water surface up to Discharge Outlet center
        const xBar = 4.95;
        const zBar = pz + 0.15;
        const yBot = canalWaterY;
        const yTop = DIM.DISCHARGE_MOUTH_Y;

        setSeg(liftLineGeo, liftPositions, xBar, yBot, zBar, xBar, yTop, zBar);
        setSeg(liftTopWitGeo, liftTopWitPos, xBar - 0.55, yTop, zBar, xBar + 0.12, yTop, zBar);
        setSeg(liftBotWitGeo, liftBotWitPos, xBar - 0.55, yBot, zBar, xBar + 0.12, yBot, zBar);

        liftTopArrow.position.set(xBar, yTop - 0.042, zBar);
        liftBotArrow.position.set(xBar, yBot + 0.042, zBar);
        liftAnchor.position.set(xBar + 0.06, (yBot + yTop) * 0.5, zBar);
      } else {
        // Vertical Podium Elevation in Studio / Field modes (-1.32 m -> 0.00 m)
        const xBar = -2.02;
        const zBar = 1.08;
        const yBot = DIM.PODIUM_FLOOR_Y;
        const yTop = 0.0;

        setSeg(liftLineGeo, liftPositions, xBar, yBot, zBar, xBar, yTop, zBar);
        setSeg(liftTopWitGeo, liftTopWitPos, -1.68, yTop, zBar, xBar - 0.08, yTop, zBar);
        setSeg(liftBotWitGeo, liftBotWitPos, -1.68, yBot, zBar, xBar - 0.08, yBot, zBar);

        liftTopArrow.position.set(xBar, yTop - 0.042, zBar);
        liftBotArrow.position.set(xBar, yBot + 0.042, zBar);
        liftAnchor.position.set(xBar - 0.06, (yBot + yTop) * 0.5, zBar);
      }
    }
  };

  const anchors: CadDimensionAnchor[] = [
    {
      id: 'horiz_1m',
      anchor: horizAnchor,
      accent: 'amber',
      getLabel: (_stage, _waterY, lang) => ({
        label: '100 cm',
        sublabel: lang === 'id' ? 'Mendatar' : 'Horizontal',
      }),
    },
    {
      id: 'inclined_5m',
      anchor: inclinedAnchor,
      accent: 'amber',
      getLabel: (_stage, _waterY, lang) => ({
        label: '500 cm',
        sublabel: lang === 'id' ? 'Pipa Miring' : 'Inclined Pipe',
      }),
    },
    {
      id: 'slope_18deg',
      anchor: slopeAnchor,
      accent: 'amber',
      getLabel: (_stage, _waterY, lang) => ({
        label: lang === 'id' ? '18,0°' : '18.0°',
        sublabel: lang === 'id' ? 'Kemiringan' : 'Slope',
      }),
    },
    {
      id: 'gland_1m',
      anchor: glandAnchor,
      accent: 'cyan',
      getLabel: () => ({
        label: '±100 cm',
        sublabel: 'Gland → Impeller',
      }),
    },
    {
      id: 'pipe_dia',
      anchor: diaAnchor,
      accent: 'cyan',
      getLabel: () => ({
        label: 'Ø 300 mm',
        sublabel: '12" PVC AW',
      }),
    },
    {
      id: 'lift_height',
      anchor: liftAnchor,
      accent: 'cyan',
      getLabel: (stageMode, canalWaterY, lang) => {
        if (stageMode === 'tanggul') {
          const liftM = Math.max(0.45, DIM.DISCHARGE_MOUTH_Y - canalWaterY);
          const formatted =
            lang === 'id'
              ? liftM.toFixed(2).replace('.', ',')
              : liftM.toFixed(2);
          return {
            label: `${formatted} m`,
            sublabel: lang === 'id' ? 'Head Statis' : 'Static Lift',
          };
        }
        return {
          label: lang === 'id' ? '1,32 m' : '1.32 m',
          sublabel: lang === 'id' ? 'Podium Uji' : 'Test Podium',
        };
      },
    },
  ];

  return {
    root,
    getAnchors: () => anchors,
    update,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
