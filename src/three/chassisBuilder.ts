import * as THREE from 'three';
import { DIM, pipeCenterYAt } from './dimensions';
import { MaterialLibrary } from './materials';

export interface ChassisAssembly {
  root: THREE.Group;
}

function createCChannelBar(
  length: number,
  height: number,
  flangeWidth: number,
  thickness: number,
  material: THREE.Material,
): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(flangeWidth, 0);
  shape.lineTo(flangeWidth, thickness);
  shape.lineTo(thickness, thickness);
  shape.lineTo(thickness, height - thickness);
  shape.lineTo(flangeWidth, height - thickness);
  shape.lineTo(flangeWidth, height);
  shape.lineTo(0, height);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: length,
    bevelEnabled: false,
  });
  geo.translate(-flangeWidth / 2, -height / 2, -length / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createPneumaticWheel(mats: MaterialLibrary): THREE.Group {
  const wheel = new THREE.Group();
  const r = DIM.WHEEL_RADIUS; // 0.28 m

  // Main rugged pneumatic tire carcass (Torus)
  const tireTubeR = 0.088;
  const tireMajorR = r - tireTubeR; // 0.192 m -> outer radius exactly 0.28 m!
  const tireGeo = new THREE.TorusGeometry(tireMajorR, tireTubeR, 20, 40);
  const tire = new THREE.Mesh(tireGeo, mats.tireRubber);
  tire.castShadow = true;
  tire.receiveShadow = true;
  wheel.add(tire);

  // Instanced chunky chevron agricultural tread lugs around circumference
  const lugCount = 24;
  const lugGeo = new THREE.BoxGeometry(0.022, 0.036, 0.105);
  const lugInst = new THREE.InstancedMesh(lugGeo, mats.tireRubber, lugCount * 2);
  const dummy = new THREE.Object3D();
  let idx = 0;
  for (let i = 0; i < lugCount; i++) {
    const a = (i / lugCount) * Math.PI * 2;
    for (const side of [-1, 1]) {
      const angle = a + (side > 0 ? Math.PI / lugCount : 0);
      const rad = r - 0.008;
      dummy.position.set(Math.cos(angle) * rad, Math.sin(angle) * rad, side * 0.028);
      dummy.rotation.set(0, side * 0.28, angle);
      dummy.updateMatrix();
      lugInst.setMatrixAt(idx++, dummy.matrix);
    }
  }
  lugInst.instanceMatrix.needsUpdate = true;
  lugInst.computeBoundingSphere();
  lugInst.castShadow = true;
  wheel.add(lugInst);

  // Heavy stamped 13-inch steel wheel rim & dish
  const rimBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.142, 0.142, 0.12, 28),
    mats.wheelRimSteel,
  );
  rimBarrel.rotation.x = Math.PI / 2;
  rimBarrel.castShadow = true;
  wheel.add(rimBarrel);

  const rimDish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.132, 0.105, 0.032, 24),
    mats.wheelRimSteel,
  );
  rimDish.rotation.x = Math.PI / 2;
  rimDish.position.z = 0.045;
  wheel.add(rimDish);

  // Central bearing hub cap
  const hubCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.046, 0.145, 16),
    mats.castIronDark,
  );
  hubCap.rotation.x = Math.PI / 2;
  wheel.add(hubCap);

  // 5 Lug bolts on rim face
  const lugBoltGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.024, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const b = new THREE.Mesh(lugBoltGeo, mats.boltZinc);
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(a) * 0.072, Math.sin(a) * 0.072, 0.062);
    wheel.add(b);
  }

  return wheel;
}

/**
 * Helper to place a structural steel strut cleanly between two 3D points.
 */
function createStrutBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  widthX: number,
  heightY: number,
  material: THREE.Material,
): THREE.Mesh {
  const zAxis = new THREE.Vector3(0, 0, 1);
  const vec = new THREE.Vector3().subVectors(end, start);
  const len = Math.max(0.02, vec.length());
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(widthX, heightY, len),
    material,
  );
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.quaternion.setFromUnitVectors(zAxis, vec.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildMobileChassis(mats: MaterialLibrary): ChassisAssembly {
  const root = new THREE.Group();
  root.name = 'MobileWheeledChassis_18DegDropThroat';

  const deckY = DIM.SKID_DECK_Y; // 0.44 m
  const railH = 0.075;
  const railCenterY = deckY - railH / 2; // top face sits flush at y = 0.44 m

  // =========================================================================
  // 1. REDESIGNED STEPPED / DROP-THROAT C-CHANNEL LOWER FRAME (FOR 18° PIPE)
  //    - Engine side (Z = -0.66 .. +0.08): full-length flat heavy skid deck
  //    - Pump front (X = -1.24 .. -0.44, Z = +0.08 .. +0.62): flat horizontal saddle deck
  //    - Pump rear (X = -0.44 .. +0.62, Z = +0.16 .. +0.60): open drop-throat 18° cradle
  //      so the plunging 5m pipe at 18° passes cleanly with zero collision!
  // =========================================================================

  // A. Engine-side full-length longitudinal C-channel rails (X: -1.24 to +0.44)
  const engRailLen = 1.68;
  const engRailMidX = -0.40;
  for (const rz of [-0.66, 0.08]) {
    const rail = createCChannelBar(engRailLen, railH, 0.048, 0.008, mats.chassisBlackSteel);
    rail.rotation.y = Math.PI / 2;
    rail.position.set(engRailMidX, railCenterY, rz);
    root.add(rail);
  }

  // B. Pump-side outer front horizontal C-channel rail (X: -1.24 to -0.42, Z = +0.62)
  const pumpFrontLen = 0.82;
  const pumpFrontRail = createCChannelBar(pumpFrontLen, railH, 0.048, 0.008, mats.chassisBlackSteel);
  pumpFrontRail.rotation.y = Math.PI / 2;
  pumpFrontRail.position.set(-0.83, railCenterY, 0.62);
  root.add(pumpFrontRail);

  // C. Full-width front crossbeams (all sit under the horizontal 1.0m spout where pipe bottom is Y = 0.462m)
  const fullCrossLen = 1.32; // Z = -0.66 to +0.62 (center Z = -0.02)
  for (const cx of [-1.22, -0.84, -0.52]) {
    const beam = createCChannelBar(fullCrossLen, railH, 0.045, 0.008, mats.chassisBlackSteel);
    beam.position.set(cx, railCenterY, -0.02);
    root.add(beam);
  }

  // D. Engine-only rear crossbeams (Z = -0.66 to +0.08, leaving the pump drop-throat completely clear!)
  const engCrossLen = 0.78;
  for (const cx of [-0.04, 0.42]) {
    const beam = createCChannelBar(engCrossLen, railH, 0.045, 0.008, mats.chassisBlackSteel);
    beam.position.set(cx, railCenterY, -0.29);
    root.add(beam);
  }

  // =========================================================================
  // 1B. HEAVY 18°-INCLINED DROP-THROAT PIPE CRADLE SUB-FRAME
  //     Rigidly supports the 500 cm pipe as it dives at 18° past the elbow!
  // =========================================================================
  const slope = DIM.PIPE_SLOPE_RAD; // 18 deg
  const cradleStartX = -0.45;
  const cradleEndX = 0.56;
  const cradleStartY = railCenterY;
  const cradleEndY = railCenterY - (cradleEndX - cradleStartX) * Math.tan(slope);

  // Twin heavy 18°-angled side stringers flanking the pipe (Z = 0.16 & Z = 0.60)
  for (const sz of [0.16, 0.60]) {
    const pA = new THREE.Vector3(cradleStartX, cradleStartY, sz);
    const pB = new THREE.Vector3(cradleEndX, cradleEndY, sz);
    const stringer = createStrutBetween(pA, pB, 0.046, 0.068, mats.chassisBlackSteel);
    root.add(stringer);

    // Steel gusset plate reinforcing the 18° knee weld joint
    const kneePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.11, 0.014),
      mats.chassisBlackSteel,
    );
    kneePlate.position.set(cradleStartX + 0.02, cradleStartY - 0.03, sz);
    kneePlate.castShadow = true;
    root.add(kneePlate);
  }

  // Lateral welded tie-plate connecting inner 18° stringer knee (Z=0.16) directly to engine rail (Z=0.08)
  const innerKneeTie = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, railH, 0.12),
    mats.chassisBlackSteel,
  );
  innerKneeTie.position.set(cradleStartX, railCenterY, 0.12);
  innerKneeTie.castShadow = true;
  root.add(innerKneeTie);

  // Lower horizontal drop-beam beneath the 18° pipe at X = +0.28 (exact clearance under Y_bottom = 0.225m!)
  const dropSaddleX = 0.28;
  const dropPipeY = pipeCenterYAt(dropSaddleX); // ~0.383 m
  const dropPipeBottomY = dropPipeY - DIM.PIPE_OUTER_R; // ~0.225 m
  const dropBeamY = dropPipeBottomY - 0.032; // ~0.193 m (zero pipe collision!)

  const dropCrossBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.068, 0.052, 0.50),
    mats.chassisBlackSteel,
  );
  dropCrossBeam.position.set(dropSaddleX, dropBeamY, DIM.PUMP_Z);
  dropCrossBeam.castShadow = true;
  dropCrossBeam.receiveShadow = true;
  root.add(dropCrossBeam);

  // Rear closed end crossbeam tying both 18° stringers at X = +0.52 (clean clearance under pipe bottom = 0.139 m)
  const rearCradleX = 0.52;
  const rearCradleY = railCenterY - (rearCradleX - cradleStartX) * Math.tan(slope); // ~0.087 m
  const rearCrossBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.064, 0.048, 0.50),
    mats.chassisBlackSteel,
  );
  rearCrossBeam.position.set(rearCradleX, rearCradleY, DIM.PUMP_Z);
  rearCrossBeam.castShadow = true;
  rearCrossBeam.receiveShadow = true;
  root.add(rearCrossBeam);

  // Heavy diagonal tie-struts linking inner drop-cradle stringer rigidly up to the engine frame rail
  root.add(
    createStrutBetween(
      new THREE.Vector3(dropSaddleX, dropBeamY, 0.16),
      new THREE.Vector3(dropSaddleX, railCenterY, 0.08),
      0.044,
      0.044,
      mats.chassisBlackSteel,
    ),
  );
  root.add(
    createStrutBetween(
      new THREE.Vector3(rearCradleX, rearCradleY, 0.16),
      new THREE.Vector3(0.40, railCenterY, 0.08),
      0.044,
      0.044,
      mats.chassisBlackSteel,
    ),
  );

  // Curved steel cradle saddle + upper clamp band hugging the 18° plunging pipe at X = +0.28
  const inclinedSaddleGeo = new THREE.CylinderGeometry(
    DIM.PIPE_OUTER_R + 0.013,
    DIM.PIPE_OUTER_R + 0.013,
    0.075,
    22,
    1,
    true,
    Math.PI * 0.68,
    Math.PI * 0.64,
  );
  inclinedSaddleGeo.rotateZ(Math.PI / 2);
  const inclinedSaddle = new THREE.Mesh(inclinedSaddleGeo, mats.chassisBlackSteel);
  inclinedSaddle.position.set(dropSaddleX, dropPipeY, DIM.PUMP_Z);
  inclinedSaddle.rotation.z = -slope;
  inclinedSaddle.castShadow = true;
  root.add(inclinedSaddle);

  // Front horizontal pipe saddles + bolted U-bolt clamping straps at BOTH X = -1.22 (front crossbeam) & X = -0.84
  // Connects the entire front pump frame bay securely to the 1.0 m horizontal PVC discharge section!
  const frontPipeY = DIM.DISCHARGE_MOUTH_Y; // 0.62 m
  const frontPostH = Math.max(0.025, frontPipeY - DIM.PIPE_OUTER_R - deckY + 0.02);
  const frontSaddleGeo = new THREE.CylinderGeometry(
    DIM.PIPE_OUTER_R + 0.013,
    DIM.PIPE_OUTER_R + 0.013,
    0.072,
    22,
    1,
    true,
    Math.PI * 0.68,
    Math.PI * 0.64,
  );
  frontSaddleGeo.rotateZ(Math.PI / 2);
  const uBoltBandGeo = new THREE.TorusGeometry(DIM.PIPE_OUTER_R + 0.011, 0.0085, 8, 28, Math.PI);
  const uBoltPostGeo = new THREE.CylinderGeometry(0.0085, 0.0085, 0.21, 8);
  const uBoltNutGeo = new THREE.CylinderGeometry(0.013, 0.013, 0.016, 6);

  for (const sx of [-1.22, -0.84]) {
    const saddleBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.074, frontPostH + 0.022, 0.34),
      mats.chassisBlackSteel,
    );
    saddleBase.position.set(sx, deckY + frontPostH * 0.5 - 0.005, DIM.PUMP_Z);
    saddleBase.castShadow = true;
    saddleBase.receiveShadow = true;
    root.add(saddleBase);

    const saddleArc = new THREE.Mesh(frontSaddleGeo, mats.chassisBlackSteel);
    saddleArc.position.set(sx, frontPipeY, DIM.PUMP_Z);
    saddleArc.castShadow = true;
    root.add(saddleArc);

    // Top steel U-bolt clamping strap securing the PVC pipe down onto the steel saddle
    const uBand = new THREE.Mesh(uBoltBandGeo, mats.clampSteel);
    uBand.rotation.y = Math.PI / 2;
    uBand.position.set(sx, frontPipeY, DIM.PUMP_Z);
    uBand.castShadow = true;
    root.add(uBand);

    for (const side of [-1, 1]) {
      const zLeg = DIM.PUMP_Z + side * (DIM.PIPE_OUTER_R + 0.011);
      const uRod = new THREE.Mesh(uBoltPostGeo, mats.boltZinc);
      uRod.position.set(sx, frontPipeY - 0.095, zLeg);
      root.add(uRod);

      const uNut = new THREE.Mesh(uBoltNutGeo, mats.boltZinc);
      uNut.position.set(sx, deckY + frontPostH + 0.008, zLeg);
      root.add(uNut);
    }
  }

  // Symmetrical twin-side angled steel A-frame braces tying the upper pulley frame down to BOTH chassis rails
  // (Inner side -> Z = 0.08 engine rail; Outer side -> Z = 0.62 outer pump rail!)
  for (const bx of [-0.82, -0.52]) {
    // Inner engine-side brace
    root.add(
      createStrutBetween(
        new THREE.Vector3(bx, DIM.DRIVEN_PULLEY_Y - 0.072, DIM.PUMP_Z - 0.11),
        new THREE.Vector3(bx, deckY, 0.08),
        0.038,
        0.034,
        mats.chassisBlackSteel,
      ),
    );
    // Outer pump-side brace (eliminates cantilever on outer pulley frame!)
    root.add(
      createStrutBetween(
        new THREE.Vector3(bx, DIM.DRIVEN_PULLEY_Y - 0.072, DIM.PUMP_Z + 0.11),
        new THREE.Vector3(bx, deckY, 0.62),
        0.038,
        0.034,
        mats.chassisBlackSteel,
      ),
    );
  }

  // =========================================================================
  // 2. RAISED WELDED STEEL ENGINE MOUNTING PEDESTAL (DUDUKAN MESIN)
  //    Elevates Dongfeng ZH1130 from deckY (0.44m) to ENGINE_MOUNT_Y (0.63m)
  //    so its B3x5" flywheel pulley sits 0° level with the pump pulley!
  // =========================================================================
  const riserTopY = DIM.ENGINE_MOUNT_Y;
  const riserH = riserTopY - deckY; // 0.19 m sturdy steel pedestal
  const riserRailH = 0.055;
  const riserLegH = Math.max(0.05, riserH - riserRailH);

  for (const ex of [-0.71, -0.33]) {
    const topRail = createCChannelBar(0.72, riserRailH, 0.055, 0.008, mats.chassisBlackSteel);
    topRail.position.set(ex, riserTopY - riserRailH / 2, -0.40);
    root.add(topRail);

    for (const pzLeg of [-0.66, -0.14]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.052, riserLegH + 0.02, 0.052),
        mats.chassisBlackSteel,
      );
      leg.position.set(ex, deckY + riserLegH * 0.5, pzLeg);
      leg.castShadow = true;
      leg.receiveShadow = true;
      root.add(leg);
    }

    const gusset = new THREE.Mesh(
      new THREE.BoxGeometry(0.036, 0.034, 0.48),
      mats.chassisBlackSteel,
    );
    gusset.position.set(ex, deckY + riserLegH * 0.52, -0.40);
    gusset.rotation.x = 0.28;
    gusset.castShadow = true;
    root.add(gusset);
  }

  for (const czTie of [-0.66, -0.14]) {
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.048, 0.048),
      mats.chassisBlackSteel,
    );
    tie.position.set(-0.52, riserTopY - riserRailH / 2, czTie);
    tie.castShadow = true;
    root.add(tie);
  }

  const engineDeckPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 0.016, 0.68),
    mats.castIronDark,
  );
  engineDeckPlate.position.set(-0.52, riserTopY - 0.008, -0.40);
  engineDeckPlate.castShadow = true;
  engineDeckPlate.receiveShadow = true;
  root.add(engineDeckPlate);

  // =========================================================================
  // 2B. WELDED BATTERY TRAY & ACCU FLOODED 12V 32AH 32B20R-NS4 (BOM B.1)
  // =========================================================================
  const battX = 0.08;
  const battY = deckY;
  const battZ = -0.42;
  const batteryGroup = new THREE.Group();
  batteryGroup.position.set(battX, battY, battZ);
  root.add(batteryGroup);

  const trayPlate = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.016, 0.30),
    mats.chassisBlackSteel,
  );
  trayPlate.position.y = 0.008;
  trayPlate.castShadow = true;
  trayPlate.receiveShadow = true;
  batteryGroup.add(trayPlate);

  const battBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.21, 0.25),
    mats.batteryCaseDark,
  );
  battBody.position.y = 0.122;
  battBody.castShadow = true;
  battBody.receiveShadow = true;
  batteryGroup.add(battBody);

  const battLid = new THREE.Mesh(
    new THREE.BoxGeometry(0.188, 0.024, 0.258),
    mats.castIronDark,
  );
  battLid.position.y = 0.228;
  batteryGroup.add(battLid);

  const capGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12);
  for (let i = 0; i < 6; i++) {
    const cap = new THREE.Mesh(capGeo, mats.batteryCapYellow);
    cap.position.set(0.028, 0.244, -0.088 + i * 0.035);
    batteryGroup.add(cap);
  }

  const holdBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.205, 0.012, 0.028),
    mats.clampSteel,
  );
  holdBar.position.set(0, 0.246, 0);
  batteryGroup.add(holdBar);
  for (const hx of [-0.098, 0.098]) {
    const jRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.24, 8),
      mats.boltZinc,
    );
    jRod.position.set(hx, 0.13, 0);
    batteryGroup.add(jRod);
  }

  const posPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.012, 0.028, 12),
    mats.cableRed,
  );
  posPost.position.set(-0.048, 0.252, -0.082);
  batteryGroup.add(posPost);

  const negPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.012, 0.028, 12),
    mats.cableBlack,
  );
  negPost.position.set(-0.048, 0.252, 0.082);
  batteryGroup.add(negPost);

  const posCableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(battX - 0.048, battY + 0.26, battZ - 0.082),
    new THREE.Vector3(battX - 0.22, battY + 0.34, battZ - 0.16),
    new THREE.Vector3(-0.36, DIM.ENGINE_CRANK_Y - 0.08, DIM.ENGINE_CRANK_Z - 0.30),
    new THREE.Vector3(
      DIM.ENGINE_CRANK_X - 0.01,
      DIM.ENGINE_CRANK_Y - 0.06,
      DIM.ENGINE_CRANK_Z - 0.27,
    ),
  ]);
  const posCable = new THREE.Mesh(
    new THREE.TubeGeometry(posCableCurve, 22, 0.0085, 8, false),
    mats.cableRed,
  );
  posCable.castShadow = true;
  root.add(posCable);

  const negCableCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(battX - 0.048, battY + 0.26, battZ + 0.082),
    new THREE.Vector3(battX - 0.15, battY + 0.18, battZ + 0.14),
    new THREE.Vector3(battX - 0.16, battY + 0.02, battZ + 0.16),
  ]);
  const negCable = new THREE.Mesh(
    new THREE.TubeGeometry(negCableCurve, 14, 0.008, 8, false),
    mats.cableBlack,
  );
  root.add(negCable);

  // =========================================================================
  // 3. SHIFTED HEAVY-DUTY AXLE & TWO 13-INCH PNEUMATIC TIRES
  //    Positioned at X = -0.58 m beneath the horizontal spout (18 cm pipe clearance!)
  // =========================================================================
  const axleX = DIM.WHEEL_AXLE_X; // -0.58 m
  const axleY = DIM.WHEEL_RADIUS; // 0.28 m -> tire bottoms touch exact Y = 0.00!

  const axleShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.027, 0.027, 1.62, 18),
    mats.castIronDark,
  );
  axleShaft.rotation.x = Math.PI / 2;
  axleShaft.position.set(axleX, axleY, -0.02);
  axleShaft.castShadow = true;
  root.add(axleShaft);

  // Axle mounting drop brackets welded under outer longitudinal rails
  for (const bz of [-0.66, 0.62]) {
    const dropBracket = new THREE.Mesh(
      new THREE.BoxGeometry(0.095, railCenterY - axleY + 0.04, 0.052),
      mats.chassisBlackSteel,
    );
    dropBracket.position.set(axleX, (railCenterY + axleY) * 0.5, bz);
    dropBracket.castShadow = true;
    root.add(dropBracket);
  }

  const leftWheel = createPneumaticWheel(mats);
  leftWheel.position.set(axleX, axleY, -0.82);
  leftWheel.rotation.y = Math.PI;
  root.add(leftWheel);

  const rightWheel = createPneumaticWheel(mats);
  rightWheel.position.set(axleX, axleY, 0.78);
  root.add(rightWheel);

  // =========================================================================
  // 4. FRONT (RIVER-SIDE) & REAR (CANAL-SIDE) LEVEE STABILIZER LEGS + TOW HANDLE
  //    Locks the mobile rig securely on top of the levee crest against 5m pipe cantilever!
  // =========================================================================
  const frontLegX = -1.18;
  const frontLegH = railCenterY - 0.015;
  for (const lz of [-0.62, 0.58]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, frontLegH, 12),
      mats.chassisBlackSteel,
    );
    leg.position.set(frontLegX, frontLegH * 0.5 + 0.015, lz);
    leg.castShadow = true;
    root.add(leg);

    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.024, 0.024),
      mats.chassisBlackSteel,
    );
    brace.position.set(frontLegX + 0.11, railCenterY - 0.11, lz);
    brace.rotation.z = 0.62;
    root.add(brace);

    const footPad = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.018, 0.14),
      mats.castIronDark,
    );
    footPad.position.set(frontLegX, 0.009, lz);
    footPad.castShadow = true;
    footPad.receiveShadow = true;
    root.add(footPad);
  }

  const frontLegTie = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 1.20, 12),
    mats.chassisBlackSteel,
  );
  frontLegTie.rotation.x = Math.PI / 2;
  frontLegTie.position.set(frontLegX, 0.15, -0.02);
  root.add(frontLegTie);

  // Rear Canal-Side Outrigger Stabilizer Legs (4 grounded anchor points across engine & closed 18° cradle!)
  const rearLegConfigs = [
    { x: 0.40, topY: railCenterY, z: -0.62 },
    { x: 0.40, topY: railCenterY, z: 0.08 },
    { x: rearCradleX, topY: rearCradleY + 0.01, z: 0.16 },
    { x: rearCradleX, topY: rearCradleY + 0.01, z: 0.60 },
  ];
  for (const cfg of rearLegConfigs) {
    const h = Math.max(0.06, cfg.topY - 0.016);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.021, 0.023, h, 12),
      mats.chassisBlackSteel,
    );
    leg.position.set(cfg.x, h * 0.5 + 0.016, cfg.z);
    leg.castShadow = true;
    root.add(leg);

    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.018, 0.15),
      mats.castIronDark,
    );
    pad.position.set(cfg.x, 0.009, cfg.z);
    pad.castShadow = true;
    pad.receiveShadow = true;
    root.add(pad);
  }

  // Welded front tow/maneuvering handle extending ahead of engine frame
  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.22, railCenterY, -0.56),
    new THREE.Vector3(-1.54, railCenterY + 0.14, -0.52),
    new THREE.Vector3(-1.54, railCenterY + 0.14, -0.06),
    new THREE.Vector3(-1.22, railCenterY, -0.02),
  ]);
  const handleMesh = new THREE.Mesh(
    new THREE.TubeGeometry(handleCurve, 28, 0.016, 10, false),
    mats.chassisBlackSteel,
  );
  handleMesh.castShadow = true;
  root.add(handleMesh);

  return { root };
}
