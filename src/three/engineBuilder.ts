import * as THREE from 'three';
import { DIM } from './dimensions';
import { MaterialLibrary } from './materials';

export interface EngineAssembly {
  root: THREE.Group;
  vibrationGroup: THREE.Group;
  flywheelGroup: THREE.Group;
  hopperGroup: THREE.Group;
  exhaustGroup: THREE.Group;
  crankshaftGroup: THREE.Group;
  pistonGroup: THREE.Group;
  conRodGroup: THREE.Group;
  combustionFlashMesh: THREE.Mesh;
  throttleLeverPivot: THREE.Group;
  exhaustRainCapPivot: THREE.Group;
  exhaustTipWorldAnchor: THREE.Object3D;
  cutawaySolidMeshes: THREE.Mesh[];
  cutawayGhostMeshes: THREE.Mesh[];
  hotspotAnchor: THREE.Object3D;
  updateKinematics: (
    crankAngle: number,
    rpm: number,
    time: number,
    xrayMix: number,
    explodeMix: number,
  ) => void;
}

export function buildDongfengEngine(mats: MaterialLibrary): EngineAssembly {
  const root = new THREE.Group();
  root.name = 'DongfengZH1130_Root';

  // Everything vibrates subtly inside vibrationGroup
  const vibrationGroup = new THREE.Group();
  root.add(vibrationGroup);

  const cx = DIM.ENGINE_CRANK_X;
  const cy = DIM.ENGINE_CRANK_Y;
  const cz = DIM.ENGINE_CRANK_Z;

  const cutawaySolidMeshes: THREE.Mesh[] = [];
  const cutawayGhostMeshes: THREE.Mesh[] = [];

  const registerCutawayPair = (
    geom: THREE.BufferGeometry,
    parent: THREE.Object3D,
    pos: [number, number, number],
    rot: [number, number, number] = [0, 0, 0],
    solidMat: THREE.Material = mats.crimsonEnamel,
  ) => {
    const solid = new THREE.Mesh(geom, solidMat);
    solid.position.set(...pos);
    solid.rotation.set(...rot);
    solid.castShadow = true;
    solid.receiveShadow = true;
    parent.add(solid);
    cutawaySolidMeshes.push(solid);

    const ghost = new THREE.Mesh(geom, mats.crimsonCutawayGhost);
    ghost.position.set(...pos);
    ghost.rotation.set(...rot);
    ghost.visible = false;
    ghost.renderOrder = 4;
    parent.add(ghost);
    cutawayGhostMeshes.push(ghost);
    return { solid, ghost };
  };

  // =========================================================================
  // 1. HEAVY CAST-IRON HORIZONTAL CRANKCASE & CYLINDER BLOCK
  // =========================================================================
  const blockGroup = new THREE.Group();
  vibrationGroup.add(blockGroup);

  // Heavy lower oil pan / crankcase mounting base resting flush on raised engine pedestal (y=0.63)
  const basePlateGeo = new THREE.BoxGeometry(0.46, 0.05, 0.64);
  const basePlate = new THREE.Mesh(basePlateGeo, mats.castIronDark);
  basePlate.position.set(cx, DIM.ENGINE_MOUNT_Y + 0.025, cz - 0.16);
  basePlate.castShadow = true;
  basePlate.receiveShadow = true;
  blockGroup.add(basePlate);

  // Mounting feet flanges with 4 heavy hex anchor bolts
  const footBoltGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6);
  for (const bx of [-0.19, 0.19]) {
    for (const bz of [0.10, -0.40]) {
      const bolt = new THREE.Mesh(footBoltGeo, mats.boltZinc);
      bolt.position.set(cx + bx, DIM.ENGINE_MOUNT_Y + 0.06, cz + bz);
      blockGroup.add(bolt);
    }
  }

  // Main Crankcase Body (splits into solid lower/back housing + cutaway outer jacket)
  const crankcaseBackGeo = new THREE.BoxGeometry(0.42, 0.34, 0.24);
  const crankcaseBack = new THREE.Mesh(crankcaseBackGeo, mats.crimsonEnamel);
  crankcaseBack.position.set(cx, cy - 0.02, cz + 0.05);
  crankcaseBack.castShadow = true;
  crankcaseBack.receiveShadow = true;
  blockGroup.add(crankcaseBack);

  // Cutaway crankcase front/side shell (fades to ghost in X-Ray so crankshaft is visible!)
  const crankcaseFrontShellGeo = new THREE.BoxGeometry(0.43, 0.35, 0.20);
  registerCutawayPair(
    crankcaseFrontShellGeo,
    blockGroup,
    [cx, cy - 0.02, cz - 0.12],
    [0, 0, 0],
    mats.crimsonEnamel,
  );

  // Rear cast-iron side inspection cover plate with perimeter bolts
  const inspectPlateGeo = new THREE.BoxGeometry(0.025, 0.22, 0.24);
  const inspectPlate = new THREE.Mesh(inspectPlateGeo, mats.castIronDark);
  inspectPlate.position.set(cx + 0.22, cy - 0.02, cz + 0.02);
  inspectPlate.castShadow = true;
  blockGroup.add(inspectPlate);

  const smallBoltGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.022, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const b = new THREE.Mesh(smallBoltGeo, mats.boltZinc);
    b.rotation.z = Math.PI / 2;
    b.position.set(
      cx + 0.236,
      cy - 0.02 + Math.sin(a) * 0.085,
      cz + 0.02 + Math.cos(a) * 0.095,
    );
    blockGroup.add(b);
  }

  // Horizontal Cylinder Water Jacket Barrel (outer cutaway shell)
  const cylOuterGeo = new THREE.CylinderGeometry(0.145, 0.15, 0.42, 24);
  registerCutawayPair(
    cylOuterGeo,
    blockGroup,
    [cx, cy, cz - 0.38],
    [Math.PI / 2, 0, 0],
    mats.crimsonEnamel,
  );

  // Cast Cooling Fins along the cylinder block exterior
  const finGeo = new THREE.CylinderGeometry(0.162, 0.162, 0.01, 24);
  for (let i = 0; i < 6; i++) {
    registerCutawayPair(
      finGeo,
      blockGroup,
      [cx, cy, cz - 0.24 - i * 0.052],
      [Math.PI / 2, 0, 0],
      mats.crimsonEnamel,
    );
  }

  // Cylinder Head & Valve Rocker Cover (at -Z front of cylinder)
  const headGeo = new THREE.BoxGeometry(0.28, 0.28, 0.11);
  const cylHead = new THREE.Mesh(headGeo, mats.castIronDark);
  cylHead.position.set(cx, cy, cz - 0.635);
  cylHead.castShadow = true;
  cylHead.receiveShadow = true;
  blockGroup.add(cylHead);

  // 4 Heavy Cylinder Head Stud Nuts
  const headNutGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.032, 6);
  for (const hx of [-0.095, 0.095]) {
    for (const hy of [-0.095, 0.095]) {
      const nut = new THREE.Mesh(headNutGeo, mats.boltZinc);
      nut.rotation.x = Math.PI / 2;
      nut.position.set(cx + hx, cy + hy, cz - 0.70);
      blockGroup.add(nut);
    }
  }

  // Die-cast Valve Cover (with cast ribs)
  const valveCoverGeo = new THREE.BoxGeometry(0.20, 0.21, 0.08);
  const valveCover = new THREE.Mesh(valveCoverGeo, mats.crimsonEnamel);
  valveCover.position.set(cx, cy, cz - 0.725);
  valveCover.castShadow = true;
  blockGroup.add(valveCover);

  // Decompression lever knob on valve cover
  const decompShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.06, 10),
    mats.machinedSteel,
  );
  decompShaft.position.set(cx, cy + 0.12, cz - 0.72);
  blockGroup.add(decompShaft);

  // =========================================================================
  // 2. INTERNAL ANIMATED CUTAWAY (LINER, PISTON, CONROD, CRANKSHAFT)
  // =========================================================================
  // Honed Steel Cylinder Liner (half-section cutaway open toward +X / camera view)
  const linerGeo = new THREE.CylinderGeometry(
    DIM.PISTON_RADIUS + 0.005,
    DIM.PISTON_RADIUS + 0.005,
    0.34,
    24,
    1,
    true,
    Math.PI * 0.25,
    Math.PI * 1.4,
  );
  const linerMesh = new THREE.Mesh(linerGeo, mats.machinedSteel);
  linerMesh.rotation.x = Math.PI / 2;
  linerMesh.position.set(cx, cy, cz - 0.36);
  blockGroup.add(linerMesh);

  // Combustion Chamber Flash Glow (pulses on 4-stroke power stroke)
  const combustionFlashMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.056, 16, 12),
    mats.combustionGlow,
  );
  combustionFlashMesh.scale.set(1, 1, 0.55);
  combustionFlashMesh.position.set(cx, cy, cz - 0.51);
  blockGroup.add(combustionFlashMesh);

  // Counterweighted Forged Crankshaft rotating around X axis
  const crankshaftGroup = new THREE.Group();
  crankshaftGroup.position.set(cx, cy, cz);
  blockGroup.add(crankshaftGroup);

  // Main shaft journal extending from crankcase to flywheel & drive pulley
  const mainJournal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.56, 20),
    mats.machinedSteel,
  );
  mainJournal.rotation.z = Math.PI / 2;
  mainJournal.position.set(-0.14, 0, 0);
  crankshaftGroup.add(mainJournal);

  // Two forged counterweights (D-shaped extrusions)
  const webShape = new THREE.Shape();
  webShape.absarc(0, 0, 0.095, -Math.PI * 0.65, Math.PI * 0.65, false);
  webShape.lineTo(-0.04, 0.068);
  webShape.lineTo(-0.04, -0.068);
  webShape.closePath();
  const webGeo = new THREE.ExtrudeGeometry(webShape, {
    depth: 0.026,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 2,
  });
  webGeo.rotateY(Math.PI / 2);

  for (const wx of [-0.055, 0.029]) {
    const web = new THREE.Mesh(webGeo, mats.castIronDark);
    web.position.set(wx, 0, 0);
    crankshaftGroup.add(web);
  }

  // Offset Crankpin at radius DIM.CRANK_RADIUS along -Z (theta = 0 at TDC)
  const crankPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.024, 0.075, 16),
    mats.machinedSteel,
  );
  crankPin.rotation.z = Math.PI / 2;
  crankPin.position.set(0, 0, -DIM.CRANK_RADIUS);
  crankshaftGroup.add(crankPin);

  // Forged I-Beam Connecting Rod (pivots on wrist pin & tracks crankpin)
  const conRodGroup = new THREE.Group();
  conRodGroup.position.set(cx, cy, cz - DIM.CONROD_LENGTH);
  blockGroup.add(conRodGroup);

  const rodBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.03, DIM.CONROD_LENGTH),
    mats.machinedSteel,
  );
  rodBeam.position.set(0, 0, DIM.CONROD_LENGTH / 2);
  conRodGroup.add(rodBeam);

  // Big-end cap housing around crankpin
  const bigEnd = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.038, 0.044, 18),
    mats.castIronDark,
  );
  bigEnd.rotation.z = Math.PI / 2;
  bigEnd.position.set(0, 0, DIM.CONROD_LENGTH);
  conRodGroup.add(bigEnd);

  // Small-end wrist-pin eye
  const smallEnd = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.04, 14),
    mats.machinedSteel,
  );
  smallEnd.rotation.z = Math.PI / 2;
  conRodGroup.add(smallEnd);

  // Reciprocating 130mm Aluminum-Alloy Piston with 3 Piston Rings
  const pistonGroup = new THREE.Group();
  pistonGroup.position.set(cx, cy, cz - DIM.CONROD_LENGTH);
  blockGroup.add(pistonGroup);

  const pistonBody = new THREE.Mesh(
    new THREE.CylinderGeometry(DIM.PISTON_RADIUS, DIM.PISTON_RADIUS, 0.125, 24),
    mats.pistonAlloy,
  );
  pistonBody.rotation.x = Math.PI / 2;
  pistonBody.position.set(0, 0, -0.02);
  pistonGroup.add(pistonBody);

  // 3 Piston Compression & Oil Scraper Rings
  const ringGeo = new THREE.TorusGeometry(DIM.PISTON_RADIUS + 0.002, 0.0032, 8, 28);
  for (const rz of [-0.068, -0.054, -0.040]) {
    const ring = new THREE.Mesh(ringGeo, mats.castIronDark);
    ring.position.set(0, 0, rz);
    pistonGroup.add(ring);
  }

  // Wrist pin inside piston
  const wristPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, 0.11, 14),
    mats.machinedSteel,
  );
  wristPin.rotation.z = Math.PI / 2;
  pistonGroup.add(wristPin);

  // =========================================================================
  // 3. CRIMSON RADIATOR HOPPER, FUEL TANK, CAPS, EYEBOLT & NAMEPLATE
  // =========================================================================
  const hopperGroup = new THREE.Group();
  vibrationGroup.add(hopperGroup);

  // Signature Crimson-Red Rectangular Top Radiator Hopper (beveled extrusion)
  const hopperShape = new THREE.Shape();
  const hw = 0.215;
  const hd = 0.26;
  const hr = 0.025;
  hopperShape.moveTo(-hw + hr, -hd);
  hopperShape.lineTo(hw - hr, -hd);
  hopperShape.quadraticCurveTo(hw, -hd, hw, -hd + hr);
  hopperShape.lineTo(hw, hd - hr);
  hopperShape.quadraticCurveTo(hw, hd, hw - hr, hd);
  hopperShape.lineTo(-hw + hr, hd);
  hopperShape.quadraticCurveTo(-hw, hd, -hw, hd - hr);
  hopperShape.lineTo(-hw, -hd + hr);
  hopperShape.quadraticCurveTo(-hw, -hd, -hw + hr, -hd);

  const hopperGeo = new THREE.ExtrudeGeometry(hopperShape, {
    depth: 0.30,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelSegments: 3,
  });
  hopperGeo.rotateX(-Math.PI / 2);

  const hopperMesh = new THREE.Mesh(hopperGeo, mats.crimsonEnamel);
  hopperMesh.position.set(cx, cy + 0.16, cz - 0.31);
  hopperMesh.castShadow = true;
  hopperMesh.receiveShadow = true;
  hopperGroup.add(hopperMesh);

  // Radiator Grille Louvers on the front (-Z) of the hopper
  const grilleFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.22, 0.022),
    mats.castIronDark,
  );
  grilleFrame.position.set(cx, cy + 0.31, cz - 0.582);
  hopperGroup.add(grilleFrame);

  for (let i = 0; i < 6; i++) {
    const louver = new THREE.Mesh(
      new THREE.BoxGeometry(0.29, 0.012, 0.026),
      mats.chassisBlackSteel,
    );
    louver.rotation.x = 0.35;
    louver.position.set(cx, cy + 0.23 + i * 0.032, cz - 0.588);
    hopperGroup.add(louver);
  }

  // Rear Mounted Diesel Fuel Tank (crimson painted steel with recessed seam)
  const fuelTankGeo = new THREE.BoxGeometry(0.38, 0.24, 0.24);
  const fuelTank = new THREE.Mesh(fuelTankGeo, mats.crimsonEnamel);
  fuelTank.position.set(cx, cy + 0.29, cz + 0.06);
  fuelTank.castShadow = true;
  fuelTank.receiveShadow = true;
  hopperGroup.add(fuelTank);

  // Radiator Cap (pressure brass/steel) & Fuel Filler Cap
  const radNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.046, 0.04, 18),
    mats.castIronDark,
  );
  radNeck.position.set(cx, cy + 0.485, cz - 0.36);
  hopperGroup.add(radNeck);

  const radCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048, 0.048, 0.02, 18),
    mats.machinedSteel,
  );
  radCap.position.set(cx, cy + 0.51, cz - 0.36);
  hopperGroup.add(radCap);

  const fuelCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, 0.035, 16),
    mats.brassFitting,
  );
  fuelCap.position.set(cx + 0.09, cy + 0.425, cz + 0.06);
  hopperGroup.add(fuelCap);

  // Forged Lifting Eyebolt on top center of engine hopper
  const eyeboltStem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.045, 12),
    mats.machinedSteel,
  );
  eyeboltStem.position.set(cx, cy + 0.495, cz - 0.16);
  hopperGroup.add(eyeboltStem);

  const eyeboltRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.032, 0.01, 12, 24),
    mats.machinedSteel,
  );
  eyeboltRing.position.set(cx, cy + 0.54, cz - 0.16);
  eyeboltRing.castShadow = true;
  hopperGroup.add(eyeboltRing);

  // Iconic Yellow/Black Industrial Dongfeng ZH1130 Nameplate Badge (on BOTH sides of hopper)
  const plateGeo = new THREE.PlaneGeometry(0.26, 0.13);
  const plateRight = new THREE.Mesh(plateGeo, mats.nameplateMat);
  plateRight.rotation.y = Math.PI / 2;
  plateRight.position.set(cx + 0.232, cy + 0.31, cz - 0.31);
  hopperGroup.add(plateRight);

  const plateLeft = new THREE.Mesh(plateGeo, mats.nameplateMat);
  plateLeft.rotation.y = -Math.PI / 2;
  plateLeft.position.set(cx - 0.232, cy + 0.31, cz - 0.31);
  hopperGroup.add(plateLeft);

  // =========================================================================
  // 4. MASSIVE SPOKED/DISHED FLYWHEEL + DUAL-GROOVE V-BELT PULLEY
  // =========================================================================
  const flywheelGroup = new THREE.Group();
  flywheelGroup.position.set(DIM.FLYWHEEL_X, cy, cz);
  vibrationGroup.add(flywheelGroup);

  // Lathe-turned heavy dished cast-iron flywheel rim
  const fwR = DIM.FLYWHEEL_RADIUS;
  const fwRimPts = [
    new THREE.Vector2(fwR - 0.068, -0.055),
    new THREE.Vector2(fwR, -0.055),
    new THREE.Vector2(fwR, 0.055),
    new THREE.Vector2(fwR - 0.068, 0.055),
    new THREE.Vector2(fwR - 0.074, 0.035),
    new THREE.Vector2(fwR - 0.074, -0.035),
    new THREE.Vector2(fwR - 0.068, -0.055),
  ];
  const fwRimGeo = new THREE.LatheGeometry(fwRimPts, 48);
  fwRimGeo.rotateZ(Math.PI / 2);
  const fwRim = new THREE.Mesh(fwRimGeo, mats.castIronFlywheel);
  fwRim.castShadow = true;
  fwRim.receiveShadow = true;
  flywheelGroup.add(fwRim);

  // Machined bright outer bevel ring on flywheel for crisp rotation feedback
  const fwEdgeRing = new THREE.Mesh(
    new THREE.TorusGeometry(fwR - 0.008, 0.006, 10, 48),
    mats.machinedSteel,
  );
  fwEdgeRing.rotation.y = Math.PI / 2;
  fwEdgeRing.position.x = -0.053;
  flywheelGroup.add(fwEdgeRing);

  // Toothed Steel Flywheel Starter Ring Gear (64 instanced teeth engaging 12V OTOR Starter)
  const toothCount = 64;
  const toothGeo = new THREE.BoxGeometry(0.022, 0.014, 0.011);
  const ringGearInst = new THREE.InstancedMesh(toothGeo, mats.machinedSteel, toothCount);
  const dummyTooth = new THREE.Object3D();
  for (let i = 0; i < toothCount; i++) {
    const a = (i / toothCount) * Math.PI * 2;
    const rad = fwR + 0.005;
    dummyTooth.position.set(0.036, Math.cos(a) * rad, Math.sin(a) * rad);
    dummyTooth.rotation.set(a, 0, 0);
    dummyTooth.updateMatrix();
    ringGearInst.setMatrixAt(i, dummyTooth.matrix);
  }
  ringGearInst.instanceMatrix.needsUpdate = true;
  ringGearInst.computeBoundingSphere();
  flywheelGroup.add(ringGearInst);

  // Central flywheel hub (crimson painted)
  const fwHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.088, 0.095, 0.11, 24),
    mats.crimsonEnamel,
  );
  fwHub.rotation.z = Math.PI / 2;
  fwHub.castShadow = true;
  flywheelGroup.add(fwHub);

  // 6 Sculpted Cast-Iron Spokes (dished slightly inward)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(0.034, fwR - 0.11, 0.044),
      mats.crimsonEnamel,
    );
    const midR = (fwR - 0.05 + 0.07) * 0.5;
    spoke.position.set(
      0,
      Math.cos(angle) * midR,
      Math.sin(angle) * midR,
    );
    spoke.rotation.x = angle;
    spoke.castShadow = true;
    flywheelGroup.add(spoke);
  }

  // Flywheel timing indicator boss & starting crank nut
  const crankNut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.032, 0.04, 6),
    mats.machinedSteel,
  );
  crankNut.rotation.z = Math.PI / 2;
  crankNut.position.x = -0.172;
  flywheelGroup.add(crankNut);

  // Pulley - B3 X 5" (3-Groove B-section 5-inch cast pulley bolted to flywheel hub at x = DIM.BELT_X)
  // Grooves centered at -0.024, 0.000, +0.024
  const pr = DIM.DRIVE_PULLEY_RADIUS;
  const pulleyProfile = [
    new THREE.Vector2(0.032, -0.040),
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
    new THREE.Vector2(0.032, 0.040),
  ];
  const drivePulleyGeo = new THREE.LatheGeometry(pulleyProfile, 40);
  drivePulleyGeo.rotateZ(Math.PI / 2);
  const drivePulley = new THREE.Mesh(drivePulleyGeo, mats.machinedSteel);
  drivePulley.position.x = DIM.BELT_X - DIM.FLYWHEEL_X; // exact -0.11
  drivePulley.castShadow = true;
  flywheelGroup.add(drivePulley);

  // 4 Pulley Hub Mounting Bolts
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const pb = new THREE.Mesh(smallBoltGeo, mats.boltZinc);
    pb.rotation.z = Math.PI / 2;
    pb.position.set(
      DIM.BELT_X - DIM.FLYWHEEL_X - 0.042,
      Math.cos(a) * 0.054,
      Math.sin(a) * 0.054,
    );
    flywheelGroup.add(pb);
  }

  // =========================================================================
  // 4B. MOTOR STARTER OTOR 12 VOLT (BOM B.2) ENGAGING FLYWHEEL RING GEAR
  // =========================================================================
  const starterGroup = new THREE.Group();
  starterGroup.position.set(cx - 0.09, cy - 0.12, cz - 0.25);
  blockGroup.add(starterGroup);

  // Main cylindrical 12V starter motor body
  const starterBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.052, 0.21, 20),
    mats.exhaustMatteBlack,
  );
  starterBody.rotation.z = Math.PI / 2;
  starterBody.castShadow = true;
  starterGroup.add(starterBody);

  // Cast aluminum pinion nose housing pointing forward toward flywheel ring gear
  const starterNose = new THREE.Mesh(
    new THREE.CylinderGeometry(0.036, 0.048, 0.095, 18),
    mats.machinedSteel,
  );
  starterNose.rotation.z = Math.PI / 2;
  starterNose.position.x = -0.145;
  starterNose.castShadow = true;
  starterGroup.add(starterNose);

  // Mounting flange collar bolted to crankcase
  const starterFlange = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.068, 0.018, 18),
    mats.castIronDark,
  );
  starterFlange.rotation.z = Math.PI / 2;
  starterFlange.position.x = -0.105;
  starterGroup.add(starterFlange);

  // Piggyback 12V Solenoid Relay Cylinder on top of starter motor
  const solenoid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.125, 16),
    mats.castIronDark,
  );
  solenoid.rotation.z = Math.PI / 2;
  solenoid.position.set(0.01, 0.062, -0.02);
  solenoid.castShadow = true;
  starterGroup.add(solenoid);

  // Brass positive terminal stud on back of solenoid
  const solStud = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.028, 10),
    mats.brassFitting,
  );
  solStud.rotation.z = Math.PI / 2;
  solStud.position.set(0.082, 0.062, -0.02);
  starterGroup.add(solStud);

  // =========================================================================
  // 5. VERTICAL EXHAUST MUFFLER (WITH RAIN CAP), AIR CLEANER, INJECTION PUMP
  // =========================================================================
  const exhaustGroup = new THREE.Group();
  vibrationGroup.add(exhaustGroup);

  // Exhaust manifold elbow coming out top-left of cylinder head
  const manifoldCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(cx - 0.08, cy + 0.12, cz - 0.62),
    new THREE.Vector3(cx - 0.16, cy + 0.24, cz - 0.65),
    new THREE.Vector3(cx - 0.18, cy + 0.36, cz - 0.65),
  ]);
  const manifoldMesh = new THREE.Mesh(
    new THREE.TubeGeometry(manifoldCurve, 14, 0.026, 12, false),
    mats.exhaustMatteBlack,
  );
  manifoldMesh.castShadow = true;
  exhaustGroup.add(manifoldMesh);

  // Vertical Black Cylindrical Muffler Canister
  const mufflerBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.068, 0.34, 24),
    mats.exhaustMatteBlack,
  );
  mufflerBody.position.set(cx - 0.18, cy + 0.52, cz - 0.65);
  mufflerBody.castShadow = true;
  exhaustGroup.add(mufflerBody);

  // Muffler end flanges
  for (const my of [cy + 0.355, cy + 0.685]) {
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.072, 0.072, 0.016, 24),
      mats.exhaustMatteBlack,
    );
    cap.position.set(cx - 0.18, my, cz - 0.65);
    exhaustGroup.add(cap);
  }

  // Exhaust tailpipe stack
  const stackPipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.026, 0.18, 16),
    mats.exhaustMatteBlack,
  );
  stackPipe.position.set(cx - 0.18, cy + 0.77, cz - 0.65);
  stackPipe.castShadow = true;
  exhaustGroup.add(stackPipe);

  // Hinged Angled Rain-Cap Tip (flutters open proportionally with RPM!)
  const exhaustRainCapPivot = new THREE.Group();
  exhaustRainCapPivot.position.set(cx - 0.205, cy + 0.86, cz - 0.65);
  exhaustGroup.add(exhaustRainCapPivot);

  const rainCapDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.034, 0.008, 16),
    mats.castIronDark,
  );
  rainCapDisc.position.set(0.025, 0.008, 0);
  exhaustRainCapPivot.add(rainCapDisc);

  const rainCapWeight = new THREE.Mesh(
    new THREE.BoxGeometry(0.026, 0.012, 0.014),
    mats.machinedSteel,
  );
  rainCapWeight.position.set(-0.012, 0.006, 0);
  exhaustRainCapPivot.add(rainCapWeight);

  // World anchor for exhaust puffs & heat shimmer
  const exhaustTipWorldAnchor = new THREE.Object3D();
  exhaustTipWorldAnchor.position.set(cx - 0.18, cy + 0.88, cz - 0.65);
  exhaustGroup.add(exhaustTipWorldAnchor);

  // Oil-Bath Air Cleaner Canister (mounted on opposite side of cylinder head)
  const airPipeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(cx + 0.08, cy + 0.12, cz - 0.62),
    new THREE.Vector3(cx + 0.17, cy + 0.22, cz - 0.65),
    new THREE.Vector3(cx + 0.19, cy + 0.32, cz - 0.65),
  ]);
  const airPipe = new THREE.Mesh(
    new THREE.TubeGeometry(airPipeCurve, 12, 0.024, 12, false),
    mats.castIronDark,
  );
  exhaustGroup.add(airPipe);

  const airCanister = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.072, 0.20, 24),
    mats.crimsonEnamel,
  );
  airCanister.position.set(cx + 0.19, cy + 0.42, cz - 0.65);
  airCanister.castShadow = true;
  exhaustGroup.add(airCanister);

  // Domed pre-cleaner mushroom cap on top of oil-bath air cleaner
  const airCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.086, 0.086, 0.045, 24),
    mats.exhaustMatteBlack,
  );
  airCap.position.set(cx + 0.19, cy + 0.54, cz - 0.65);
  exhaustGroup.add(airCap);

  // Fuel Injection Pump, Copper High-Pressure Fuel Line & Throttle Lever
  const injPumpBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.10, 0.08),
    mats.machinedSteel,
  );
  injPumpBody.position.set(cx + 0.23, cy + 0.02, cz - 0.20);
  blockGroup.add(injPumpBody);

  // High-pressure curved copper fuel injection line from pump to cylinder head injector
  const fuelLineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(cx + 0.24, cy + 0.07, cz - 0.20),
    new THREE.Vector3(cx + 0.26, cy + 0.12, cz - 0.36),
    new THREE.Vector3(cx + 0.19, cy + 0.08, cz - 0.55),
    new THREE.Vector3(cx + 0.08, cy + 0.02, cz - 0.66),
  ]);
  const copperFuelLine = new THREE.Mesh(
    new THREE.TubeGeometry(fuelLineCurve, 22, 0.006, 8, false),
    mats.copperLine,
  );
  blockGroup.add(copperFuelLine);

  // Fuel gravity feed line from tank to injection pump
  const feedCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(cx + 0.16, cy + 0.18, cz + 0.02),
    new THREE.Vector3(cx + 0.24, cy + 0.14, cz - 0.08),
    new THREE.Vector3(cx + 0.24, cy + 0.05, cz - 0.17),
  ]);
  const feedLine = new THREE.Mesh(
    new THREE.TubeGeometry(feedCurve, 14, 0.005, 8, false),
    mats.copperLine,
  );
  blockGroup.add(feedLine);

  // =========================================================================
  // 5B. DETAILED DONGFENG THROTTLE QUADRANT & GOVERNOR LINKAGE ASSEMBLY
  //     Mounted on the rear/operator side (+X) with notched arc plate,
  //     STOP/IDLE/MAX tick stops, brass pivot boss, moving linkage rod to
  //     the fuel injection pump rack, and return spring!
  // =========================================================================
  const throttleBaseX = cx + 0.235;
  const throttleBaseY = cy + 0.125;
  const throttleBaseZ = cz + 0.05;

  // Welded steel mounting boss on crankcase side
  const quadrantBoss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.028, 0.036, 16),
    mats.castIronDark,
  );
  quadrantBoss.rotation.z = Math.PI / 2;
  quadrantBoss.position.set(throttleBaseX, throttleBaseY, throttleBaseZ);
  quadrantBoss.castShadow = true;
  blockGroup.add(quadrantBoss);

  // Fan-shaped notched steel throttle quadrant plate (120-degree arc facing upward)
  const quadShape = new THREE.Shape();
  const qInnerR = 0.032;
  const qOuterR = 0.115;
  const qStart = Math.PI * 0.16;
  const qEnd = Math.PI * 0.84;
  quadShape.absarc(0, 0, qOuterR, qStart, qEnd, false);
  quadShape.absarc(0, 0, qInnerR, qEnd, qStart, true);
  quadShape.closePath();

  const quadGeo = new THREE.ExtrudeGeometry(quadShape, {
    depth: 0.008,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 2,
  });
  quadGeo.rotateY(Math.PI / 2);
  const quadMesh = new THREE.Mesh(quadGeo, mats.machinedSteel);
  quadMesh.position.set(throttleBaseX + 0.012, throttleBaseY, throttleBaseZ);
  quadMesh.castShadow = true;
  blockGroup.add(quadMesh);

  // Machined detent notch markers along quadrant rim (STOP -> IDLE -> CRUISE -> MAX)
  const notchGeo = new THREE.BoxGeometry(0.014, 0.014, 0.008);
  for (let i = 0; i <= 6; i++) {
    const a = qStart + (i / 6) * (qEnd - qStart);
    const notch = new THREE.Mesh(
      notchGeo,
      i === 0 ? mats.crimsonEnamel : i === 6 ? mats.batteryCapYellow : mats.castIronDark,
    );
    notch.position.set(
      throttleBaseX + 0.018,
      throttleBaseY + Math.sin(a) * (qOuterR - 0.006),
      throttleBaseZ - Math.cos(a) * (qOuterR - 0.006),
    );
    notch.rotation.x = a;
    blockGroup.add(notch);
  }

  // Brass wing-nut friction lock pivot hub
  const pivotHub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.044, 16),
    mats.brassFitting,
  );
  pivotHub.rotation.z = Math.PI / 2;
  pivotHub.position.set(throttleBaseX + 0.018, throttleBaseY, throttleBaseZ);
  blockGroup.add(pivotHub);

  // Rotating Throttle Governor Lever Pivot (sweeps smoothly across quadrant with RPM!)
  const throttleLeverPivot = new THREE.Group();
  throttleLeverPivot.position.set(throttleBaseX + 0.026, throttleBaseY, throttleBaseZ);
  blockGroup.add(throttleLeverPivot);

  // Curved steel handle arm + side pointer tab
  const leverArm = new THREE.Mesh(
    new THREE.BoxGeometry(0.010, 0.19, 0.018),
    mats.machinedSteel,
  );
  leverArm.position.y = 0.095;
  leverArm.castShadow = true;
  throttleLeverPivot.add(leverArm);

  const detentPin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.026, 10),
    mats.brassFitting,
  );
  detentPin.rotation.z = Math.PI / 2;
  detentPin.position.set(-0.008, qOuterR - 0.008, 0);
  throttleLeverPivot.add(detentPin);

  // High-visibility ribbed red handle grip + brass ferrule cap
  const gripFerrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.010, 0.020, 12),
    mats.brassFitting,
  );
  gripFerrule.position.y = 0.175;
  throttleLeverPivot.add(gripFerrule);

  const leverKnob = new THREE.Mesh(
    new THREE.SphereGeometry(0.025, 16, 14),
    mats.crimsonEnamel,
  );
  leverKnob.scale.set(1.0, 1.25, 1.0);
  leverKnob.position.y = 0.205;
  leverKnob.castShadow = true;
  throttleLeverPivot.add(leverKnob);

  // Lower bell-crank clevis arm driving the governor control rod forward to the injection pump
  const lowerBellCrank = new THREE.Mesh(
    new THREE.BoxGeometry(0.009, 0.068, 0.014),
    mats.machinedSteel,
  );
  lowerBellCrank.position.y = -0.032;
  throttleLeverPivot.add(lowerBellCrank);

  // Animated steel governor linkage rod connecting throttle bell-crank -> injection pump rack (-Z)
  const governorLinkageRod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0045, 0.0045, 0.23, 10),
    mats.machinedSteel,
  );
  governorLinkageRod.rotation.x = Math.PI / 2;
  governorLinkageRod.position.set(throttleBaseX + 0.020, throttleBaseY - 0.056, throttleBaseZ - 0.11);
  blockGroup.add(governorLinkageRod);

  // Coiled governor return tension spring alongside the linkage rod
  const govSpringCoil = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0095, 0.0095, 0.085, 12),
    mats.brassFitting,
  );
  govSpringCoil.rotation.x = Math.PI / 2;
  govSpringCoil.position.set(throttleBaseX + 0.020, throttleBaseY - 0.056, throttleBaseZ - 0.14);
  blockGroup.add(govSpringCoil);

  // Hotspot anchor for ZH1130 Engine
  const hotspotAnchor = new THREE.Object3D();
  hotspotAnchor.position.set(cx, cy + 0.58, cz - 0.28);
  vibrationGroup.add(hotspotAnchor);

  // =========================================================================
  // KINEMATICS & CUTAWAY UPDATE
  // =========================================================================
  const updateKinematics = (
    crankAngle: number,
    rpm: number,
    time: number,
    xrayMix: number,
    explodeMix: number,
  ) => {
    const normRpm = Math.max(0, Math.min(1, rpm / 2200));

    // 1. Flywheel & Crankshaft synchronized rotation around X axis
    flywheelGroup.rotation.x = crankAngle;
    crankshaftGroup.rotation.x = crankAngle;

    // 2. Exact Slider-Crank Piston & Connecting Rod Kinematics
    // Crankpin in local engine Y-Z plane:
    // y_pin = R * sin(theta), z_pin = -R * cos(theta)
    const R = DIM.CRANK_RADIUS;
    const L = DIM.CONROD_LENGTH;
    const sinA = Math.sin(crankAngle);
    const cosA = Math.cos(crankAngle);
    const pinY = R * sinA;
    const pinZ = -R * cosA;

    // Piston slides strictly along -Z axis
    const rodHorizontalDist = Math.sqrt(Math.max(0.0001, L * L - pinY * pinY));
    const pistonOffsetZ = pinZ - rodHorizontalDist;

    pistonGroup.position.set(cx, cy, cz + pistonOffsetZ);
    conRodGroup.position.set(cx, cy, cz + pistonOffsetZ);

    // Connecting rod angle so big-end lands exactly on crankpin (pinY, pinZ)
    const rodAngle = Math.atan2(pinY, rodHorizontalDist);
    conRodGroup.rotation.x = -rodAngle;

    // 3. 4-Stroke Combustion Flash (fires every 720 degrees = 4*PI near TDC)
    const cyclePhase = ((crankAngle % (Math.PI * 4)) + Math.PI * 4) % (Math.PI * 4);
    const powerWindow = cyclePhase < 0.75 ? Math.sin((cyclePhase / 0.75) * Math.PI) : 0;
    mats.combustionGlow.opacity =
      xrayMix > 0.08 && rpm > 40 ? powerWindow * 0.85 * xrayMix : 0;

    // 4. Cutaway X-Ray Shell Transition
    const showGhost = xrayMix > 0.05;
    mats.crimsonCutawayGhost.uniforms.uXrayMix.value = xrayMix;
    for (let i = 0; i < cutawaySolidMeshes.length; i++) {
      cutawaySolidMeshes[i].visible = xrayMix < 0.45;
      cutawayGhostMeshes[i].visible = showGhost;
    }

    // 5. Throttle Quadrant Lever, Governor Linkage Rod & Exhaust Rain-Cap Lift
    const throttleAngle = -0.78 + normRpm * 1.56; // Sweeps STOP (-45°) -> IDLE -> MAX (+45°)
    throttleLeverPivot.rotation.x = throttleAngle;
    // Translate governor linkage rod & stretch return spring linearly with lever bell-crank
    const rodShiftZ = Math.sin(throttleAngle) * 0.042;
    governorLinkageRod.position.z = throttleBaseZ - 0.11 - rodShiftZ;
    govSpringCoil.position.z = throttleBaseZ - 0.14 - rodShiftZ * 0.5;
    govSpringCoil.scale.y = 1.0 + normRpm * 0.24;

    const flutter = rpm > 60 ? Math.sin(time * (18 + normRpm * 42)) * 0.06 : 0;
    exhaustRainCapPivot.rotation.z = -(normRpm * 0.78 + flutter);

    // 6. Subtle, realistic high-frequency single-cylinder engine block vibration
    if (rpm > 30) {
      const vibAmp = (0.0014 + normRpm * 0.0032) * (1 - explodeMix * 0.7);
      const vibFreq = 26 + normRpm * 52;
      vibrationGroup.position.set(
        Math.sin(time * vibFreq * 1.1) * vibAmp * 0.5,
        Math.sin(time * vibFreq * 2.0) * vibAmp,
        Math.cos(time * vibFreq * 1.5) * vibAmp * 1.35,
      );
      vibrationGroup.rotation.z = Math.sin(time * vibFreq) * vibAmp * 1.2;
    } else {
      vibrationGroup.position.set(0, 0, 0);
      vibrationGroup.rotation.z = 0;
    }

    // 7. Clean Exploded-View Assembly Separation
    flywheelGroup.position.x = DIM.FLYWHEEL_X - explodeMix * 0.52;
    hopperGroup.position.y = explodeMix * 0.48;
    exhaustGroup.position.set(0, explodeMix * 0.42, -explodeMix * 0.34);
  };

  return {
    root,
    vibrationGroup,
    flywheelGroup,
    hopperGroup,
    exhaustGroup,
    crankshaftGroup,
    pistonGroup,
    conRodGroup,
    combustionFlashMesh,
    throttleLeverPivot,
    exhaustRainCapPivot,
    exhaustTipWorldAnchor,
    cutawaySolidMeshes,
    cutawayGhostMeshes,
    hotspotAnchor,
    updateKinematics,
  };
}
