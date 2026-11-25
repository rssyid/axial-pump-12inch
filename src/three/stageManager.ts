import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { CavitationState, StageMode, TimeOfDay } from '../types';
import { DIM, leveeTerrainHeightAt } from './dimensions';
import { ProceduralTextureSet } from './textures';

export interface StageManager {
  setAtmosphere: (mode: StageMode, timeOfDay: TimeOfDay) => void;
  update: (
    time: number,
    rpm: number,
    waterFlowEnabled: boolean,
    canalWaterY: number,
    cavitationState: CavitationState,
  ) => void;
  dispose: () => void;
}

/**
 * Creates a smooth animated water shader material for the Canal (suction intake)
 * and River (flowing outfall), featuring Fresnel sky reflection, directional ripples,
 * and translucent depth so submerged components (impeller & strainer) remain legible.
 */
function createWaterSurfaceShader(
  deepColorHex: number,
  shallowColorHex: number,
  skyColorHex: number,
  flowSpeedZ: number,
  opacity: number,
  suctionCenter: THREE.Vector2,
  enableSuction: boolean,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uSuctionStrength: { value: 0 },
      uVortexBoost: { value: 0 },
      uDeepColor: { value: new THREE.Color(deepColorHex) },
      uShallowColor: { value: new THREE.Color(shallowColorHex) },
      uSkyColor: { value: new THREE.Color(skyColorHex) },
      uFogColor: { value: new THREE.Color(0xc4d9e8) },
      uSunDir: { value: new THREE.Vector3(-0.48, 0.78, 0.39).normalize() },
      uSpecColor: { value: new THREE.Color(0xfff5e0) },
      uFlowSpeedZ: { value: flowSpeedZ },
      uOpacity: { value: opacity },
      uSuctionCenter: { value: suctionCenter },
      uEnableSuction: { value: enableSuction ? 1.0 : 0.0 },
    },
    vertexShader: `
      uniform float uTime;
      uniform float uFlowSpeedZ;
      varying vec3 vWorldPos;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float w1 = sin(wp.x * 1.4 + wp.z * 0.9 - uTime * 1.8) * 0.014;
        float w2 = cos(wp.x * 2.3 - wp.z * 1.7 + uTime * (1.4 + abs(uFlowSpeedZ))) * 0.009;
        wp.y += w1 + w2;
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uSuctionStrength;
      uniform float uVortexBoost;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uSkyColor;
      uniform vec3 uFogColor;
      uniform vec3 uSunDir;
      uniform vec3 uSpecColor;
      uniform float uFlowSpeedZ;
      uniform float uOpacity;
      uniform vec2 uSuctionCenter;
      uniform float uEnableSuction;

      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vec2 p = vWorldPos.xz;
        float zFlow = p.y - uTime * uFlowSpeedZ;

        // Multi-scale procedural water ripples
        float r1 = sin(p.x * 2.6 + zFlow * 2.1 + uTime * 1.5);
        float r2 = cos(p.x * 4.8 - zFlow * 3.4 - uTime * 2.1);
        float r3 = sin((p.x + zFlow) * 7.2 + uTime * 2.8) * 0.5;
        float ripple = (r1 + r2 + r3) * 0.25;

        // Perturbed surface normal for crisp sun/sky Fresnel glints
        vec3 n = normalize(vec3(
          (r1 - r2) * 0.085,
          1.0,
          (r2 + r3) * 0.085
        ));

        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.2);

        // Specular sun / moonlight sparkle
        vec3 sunDir = normalize(uSunDir);
        vec3 halfVec = normalize(sunDir + viewDir);
        float spec = pow(max(dot(n, halfVec), 0.0), 64.0) * 0.72;

        vec3 waterCol = mix(uDeepColor, uShallowColor, clamp(0.45 + ripple * 0.45, 0.0, 1.0));
        waterCol = mix(waterCol, uSkyColor, clamp(fresnel * 0.62, 0.0, 0.72));
        waterCol += uSpecColor * spec;

        // Animated inward suction spiral & cavitation vortex rings around canal intake
        if (uEnableSuction > 0.5 && uSuctionStrength > 0.02) {
          vec2 rel = p - uSuctionCenter;
          float d = length(rel);
          float ang = atan(rel.y, rel.x);
          float spiral = sin(d * (14.0 + uVortexBoost * 8.0) + ang * (2.0 + uVortexBoost * 2.0) + uTime * (6.5 + uVortexBoost * 7.0)) * 0.5 + 0.5;
          float mask = smoothstep(2.0, 0.16, d) * smoothstep(0.05, 0.22, d);
          float intensity = (0.35 + uVortexBoost * 0.55) * uSuctionStrength;
          vec3 foamCol = mix(vec3(0.76, 0.93, 0.98), vec3(0.96, 0.98, 1.0), uVortexBoost);
          waterCol += foamCol * spiral * mask * intensity;
        }

        // Horizon distance fog blend matching active time-of-day sky
        float dist = length(cameraPosition - vWorldPos);
        float fogF = 1.0 - exp(-pow(dist * 0.022, 2.0));
        waterCol = mix(waterCol, uFogColor, clamp(fogF, 0.0, 0.92));

        gl_FragColor = vec4(waterCol, uOpacity);
      }
    `,
  });
}

/**
 * Builds the 3D Tanggul (Levee / Embankment) environment separating the Canal (+X)
 * and River (-X), complete with vertex-colored sloped terrain, animated water planes,
 * timber sleeper pads under the stabilizer feet, and instanced tropical grass/reeds.
 */
function buildTanggulEnvironment(
  textures: ProceduralTextureSet,
  disposables: Array<{ dispose: () => void }>,
) {
  const tanggulGroup = new THREE.Group();
  tanggulGroup.name = 'TanggulCanalRiverEnvironment';

  // 1. Continuous Procedural Embankment Terrain (78m across X, 72m along Z -> blends seamlessly into fog)
  const terrainGeo = new THREE.PlaneGeometry(78, 72, 112, 36);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colArr = new Float32Array(posAttr.count * 3);

  const cCrestDirt = new THREE.Color(0x9a886b);
  const cGravelTrack = new THREE.Color(0x7c6f5c);
  const cGrassSlope = new THREE.Color(0x4b6a37);
  const cLushGrass = new THREE.Color(0x3a572a);
  const cWetClay = new THREE.Color(0x524638);
  const cBedMud = new THREE.Color(0x2e2a23);
  const tmpCol = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const y = leveeTerrainHeightAt(x, z);
    posAttr.setY(i, y);

    const noise = Math.sin(x * 0.73 + z * 0.51) * 0.5 + 0.5;

    if (x >= DIM.LEVEE_CREST_MIN_X - 0.15 && x <= DIM.LEVEE_CREST_MAX_X + 0.15) {
      // Compacted gravel/earth levee crown road
      const trackMix = THREE.MathUtils.smoothstep(Math.abs(x + 0.52), 0.35, 1.15);
      tmpCol.copy(cCrestDirt).lerp(cGravelTrack, 0.35 + noise * 0.35);
      if (trackMix > 0.72) {
        tmpCol.lerp(cGrassSlope, (trackMix - 0.72) * 1.8);
      }
    } else if (y < -1.22) {
      // Submerged river/canal mud bed
      tmpCol.copy(cBedMud).lerp(cWetClay, noise * 0.35);
    } else if (y < -0.45) {
      // Damp shoreline clay/mud bank
      const wetT = THREE.MathUtils.clamp((-0.45 - y) / 0.75, 0, 1);
      tmpCol.copy(cGrassSlope).lerp(cWetClay, wetT);
    } else {
      // Grassy embankment slopes & distant fields
      tmpCol.copy(cGrassSlope).lerp(cLushGrass, noise * 0.65);
    }

    colArr[i * 3] = tmpCol.r;
    colArr[i * 3 + 1] = tmpCol.g;
    colArr[i * 3 + 2] = tmpCol.b;
  }

  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  terrainGeo.computeVertexNormals();
  disposables.push(terrainGeo);

  const terrainMat = new THREE.MeshStandardMaterial({
    map: textures.fieldGroundMap,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0.02,
    envMapIntensity: 0.35,
  });
  disposables.push(terrainMat);

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  tanggulGroup.add(terrainMesh);

  // 2. Animated Canal Water Plane (+X intake side, Y = -0.58 m, semi-transparent so impeller/strainer show!)
  const canalGeo = new THREE.PlaneGeometry(14.5, 70, 36, 48);
  canalGeo.rotateX(-Math.PI / 2);
  disposables.push(canalGeo);

  const canalWaterMat = createWaterSurfaceShader(
    0x1e4742,
    0x326a61,
    0xbcd5e6,
    0.32,
    0.72,
    new THREE.Vector2(DIM.INTAKE_END_X - 0.15, DIM.PUMP_Z),
    true,
  );
  disposables.push(canalWaterMat);

  const canalWater = new THREE.Mesh(canalGeo, canalWaterMat);
  canalWater.position.set(8.3, DIM.CANAL_WATER_Y, 0);
  canalWater.renderOrder = 2;
  tanggulGroup.add(canalWater);

  // 3. Animated River Water Plane (-X discharge outfall side, Y = -1.15 m, faster flow!)
  const riverGeo = new THREE.PlaneGeometry(21.0, 70, 40, 48);
  riverGeo.rotateX(-Math.PI / 2);
  disposables.push(riverGeo);

  const riverWaterMat = createWaterSurfaceShader(
    0x1a3f54,
    0x2c6078,
    0xc4dcf0,
    1.15,
    0.84,
    new THREE.Vector2(-4.5, DIM.PUMP_Z),
    false,
  );
  disposables.push(riverWaterMat);

  const riverWater = new THREE.Mesh(riverGeo, riverWaterMat);
  riverWater.position.set(-13.4, DIM.RIVER_WATER_Y, 0);
  riverWater.renderOrder = 2;
  tanggulGroup.add(riverWater);

  // 4. Timber Sleeper Planks (Bantalan Kayu) resting flush at Y = 0.00 under wheels & stabilizer pads
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x6b5138,
    roughness: 0.90,
    metalness: 0.04,
  });
  const plankGeo = new THREE.BoxGeometry(0.28, 0.022, 1.85);
  disposables.push(timberMat, plankGeo);

  for (const px of [-1.18, 0.44]) {
    const plank = new THREE.Mesh(plankGeo, timberMat);
    plank.position.set(px, 0.002, -0.02);
    plank.receiveShadow = true;
    plank.castShadow = true;
    tanggulGroup.add(plank);
  }

  // 5. Instanced Tropical Grass Tufts & Canal Reeds (multi-blade crossed geometry, grounded at terrainHeightAt)
  const blade1 = new THREE.PlaneGeometry(0.18, 0.42);
  blade1.translate(0, 0.21, 0);
  const blade2 = blade1.clone();
  blade2.rotateY(Math.PI / 3);
  const blade3 = blade1.clone();
  blade3.rotateY((Math.PI * 2) / 3);

  // Merge the 3 crossed blades cleanly into one tuft BufferGeometry
  const tuftGeo = new THREE.BufferGeometry();
  const srcs = [blade1, blade2, blade3];
  const totalVerts = srcs.reduce((acc, g) => acc + g.attributes.position.count, 0);
  const posCombined = new Float32Array(totalVerts * 3);
  const normCombined = new Float32Array(totalVerts * 3);
  const idxCombined: number[] = [];
  let vOff = 0;
  for (const g of srcs) {
    posCombined.set(g.attributes.position.array as Float32Array, vOff * 3);
    normCombined.set(g.attributes.normal.array as Float32Array, vOff * 3);
    const idx = g.index!;
    for (let k = 0; k < idx.count; k++) {
      idxCombined.push(idx.getX(k) + vOff);
    }
    vOff += g.attributes.position.count;
    g.dispose();
  }
  tuftGeo.setAttribute('position', new THREE.BufferAttribute(posCombined, 3));
  tuftGeo.setAttribute('normal', new THREE.BufferAttribute(normCombined, 3));
  tuftGeo.setIndex(idxCombined);
  disposables.push(tuftGeo);

  const tuftMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  disposables.push(tuftMat);

  // Deterministic pseudo-random scatter along levee shoulders, canal reeds, and river banks
  const tuftCoords: Array<{ x: number; y: number; z: number; scale: number; tint: number }> = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const addZone = (
    count: number,
    xMin: number,
    xMax: number,
    zMin: number,
    zMax: number,
    scaleBase: number,
    avoidCenterPump: boolean,
  ) => {
    for (let i = 0; i < count; i++) {
      const x = xMin + rand() * (xMax - xMin);
      const z = zMin + rand() * (zMax - zMin);
      // Keep direct sightline around the pump rig & hose clear
      if (avoidCenterPump && Math.abs(z - 0.15) < 1.35) continue;
      const y = leveeTerrainHeightAt(x, z);
      tuftCoords.push({
        x,
        y: y - 0.03,
        z,
        scale: scaleBase * (0.82 + rand() * 0.42),
        tint: rand(),
      });
    }
  };

  // Canal-side embankment grass & shoreline reeds (+X)
  addZone(95, 0.85, 3.6, -15, 15, 1.05, true);
  // Far canal bank lush tall reeds (+X)
  addZone(90, 11.8, 17.5, -18, 18, 1.55, false);
  // River-side embankment slope grass (-X)
  addZone(85, -4.4, -1.85, -15, 15, 1.0, true);
  // Levee crest grass border fringes (outside wheels)
  addZone(45, -1.75, 0.72, -16, -2.1, 0.8, false);
  addZone(45, -1.75, 0.72, 2.1, 16, 0.8, false);

  const tuftInst = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCoords.length);
  const dummy = new THREE.Object3D();
  const cA = new THREE.Color(0x3f632b);
  const cB = new THREE.Color(0x5e7d36);
  const cC = new THREE.Color(0x7c8442);
  const instCol = new THREE.Color();

  for (let i = 0; i < tuftCoords.length; i++) {
    const c = tuftCoords[i];
    dummy.position.set(c.x, c.y, c.z);
    dummy.rotation.set(
      (rand() - 0.5) * 0.18,
      rand() * Math.PI * 2,
      (rand() - 0.5) * 0.18,
    );
    dummy.scale.set(c.scale, c.scale * (0.85 + rand() * 0.45), c.scale);
    dummy.updateMatrix();
    tuftInst.setMatrixAt(i, dummy.matrix);

    instCol.copy(c.tint < 0.55 ? cA : cB).lerp(cC, rand() * 0.35);
    tuftInst.setColorAt(i, instCol);
  }
  tuftInst.instanceMatrix.needsUpdate = true;
  if (tuftInst.instanceColor) tuftInst.instanceColor.needsUpdate = true;
  tuftInst.computeBoundingSphere();
  tanggulGroup.add(tuftInst);

  // 6. Weathered Wooden Levee Shoulder Posts along the far embankment road for human scale
  const postGeo = new THREE.CylinderGeometry(0.055, 0.062, 0.82, 10);
  postGeo.translate(0, 0.41, 0);
  disposables.push(postGeo);

  for (const pzPost of [-5.8, -3.2, 3.6, 6.4]) {
    for (const pxPost of [-1.68, 0.65]) {
      const pyPost = leveeTerrainHeightAt(pxPost, pzPost);
      const post = new THREE.Mesh(postGeo, timberMat);
      post.position.set(pxPost, pyPost - 0.05, pzPost);
      post.castShadow = true;
      post.receiveShadow = true;
      tanggulGroup.add(post);
    }
  }

  return {
    tanggulGroup,
    canalWater,
    canalWaterMat,
    riverWaterMat,
  };
}

/**
 * Builds a multi-part industrial Portable Tripod LED Floodlight Tower
 * planted on the levee crest for Night Flood Operations (Mode Malam).
 */
function buildNightWorkLightTower(
  disposables: Array<{ dispose: () => void }>,
  isSoftwareGl: boolean,
) {
  const towerGroup = new THREE.Group();
  towerGroup.name = 'NightFloodlightTripodTower';
  towerGroup.visible = false;

  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const yellowPaintMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xd99b1e,
      roughness: 0.42,
      metalness: 0.35,
    }),
  );
  const darkSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1b2028,
      roughness: 0.52,
      metalness: 0.72,
    }),
  );
  const chromeMastMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.24,
      metalness: 0.88,
    }),
  );
  const ledFaceWarmMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfff8e6,
    }),
  );
  const ledFaceCoolMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xe6f4ff,
    }),
  );
  const beaconMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
    }),
  );
  const beamConeMat = track(
    new THREE.MeshBasicMaterial({
      color: 0xfff4d6,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  // 1. Tripod 3 Splayed Legs + Rubber Foot Pads (bottom sits strictly at local Y = 0)
  const legLen = 0.96;
  const legGeo = track(new THREE.CylinderGeometry(0.018, 0.020, legLen, 10));
  const footGeo = track(new THREE.CylinderGeometry(0.036, 0.044, 0.028, 12));
  const collarHub = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.044, 0.048, 0.09, 14)),
    darkSteelMat,
  );
  collarHub.position.y = 0.76;
  collarHub.castShadow = true;
  towerGroup.add(collarHub);

  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI * 0.16;
    const footX = Math.cos(a) * 0.58;
    const footZ = Math.sin(a) * 0.58;

    const pTop = new THREE.Vector3(Math.cos(a) * 0.03, 0.76, Math.sin(a) * 0.03);
    const pBot = new THREE.Vector3(footX, 0.014, footZ);
    const dir = new THREE.Vector3().subVectors(pTop, pBot);

    const leg = new THREE.Mesh(legGeo, yellowPaintMat);
    leg.position.copy(pBot).lerp(pTop, 0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    leg.castShadow = true;
    towerGroup.add(leg);

    const foot = new THREE.Mesh(footGeo, darkSteelMat);
    foot.position.set(footX, 0.014, footZ);
    towerGroup.add(foot);

    // Center spider brace linking leg midpoint to lower mast
    const brace = new THREE.Mesh(
      track(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 8)),
      darkSteelMat,
    );
    const pMid = pBot.clone().lerp(pTop, 0.45);
    const pHub = new THREE.Vector3(0, 0.36, 0);
    brace.position.copy(pMid).lerp(pHub, 0.5);
    brace.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3().subVectors(pMid, pHub).normalize(),
    );
    towerGroup.add(brace);
  }

  // 2. Telescoping Two-Stage Mast (reaches Y = 2.68 m)
  const lowerMast = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.026, 0.028, 1.55, 14)),
    yellowPaintMat,
  );
  lowerMast.position.y = 0.36 + 1.55 * 0.5;
  lowerMast.castShadow = true;
  towerGroup.add(lowerMast);

  const lockCollar = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.038, 0.038, 0.075, 14)),
    darkSteelMat,
  );
  lockCollar.position.y = 1.91;
  towerGroup.add(lockCollar);

  const upperMast = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.018, 0.020, 0.82, 14)),
    chromeMastMat,
  );
  upperMast.position.y = 1.91 + 0.82 * 0.5;
  upperMast.castShadow = true;
  towerGroup.add(upperMast);

  // 3. Crossbar T-Arm & Twin Die-Cast LED Floodlight Heads
  const crossBar = new THREE.Mesh(
    track(new THREE.BoxGeometry(0.62, 0.036, 0.036)),
    darkSteelMat,
  );
  crossBar.position.y = 2.68;
  crossBar.castShadow = true;
  towerGroup.add(crossBar);

  // Top amber safety beacon dome
  const beaconBase = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.032, 0.036, 0.03, 12)),
    darkSteelMat,
  );
  beaconBase.position.y = 2.715;
  towerGroup.add(beaconBase);

  const beaconDome = new THREE.Mesh(
    track(new THREE.SphereGeometry(0.030, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.65)),
    beaconMat,
  );
  beaconDome.position.y = 2.73;
  towerGroup.add(beaconDome);

  // Helper to build a ribbed die-cast LED floodlight head + subtle volumetric light cone
  const createFloodHead = (
    offsetX: number,
    aimWorldTarget: THREE.Vector3,
    towerWorldPos: THREE.Vector3,
    faceMat: THREE.Material,
  ) => {
    const head = new THREE.Group();
    head.position.set(offsetX, 2.64, 0.05);

    const housing = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.24, 0.16, 0.085)),
      yellowPaintMat,
    );
    housing.castShadow = true;
    head.add(housing);

    const bezel = new THREE.Mesh(
      track(new THREE.BoxGeometry(0.255, 0.175, 0.022)),
      darkSteelMat,
    );
    bezel.position.z = 0.038;
    head.add(bezel);

    const lens = new THREE.Mesh(
      track(new THREE.PlaneGeometry(0.21, 0.13)),
      faceMat,
    );
    lens.position.z = 0.051;
    head.add(lens);

    // Volumetric soft beam cone projecting along +Z of head
    const coneGeo = track(new THREE.ConeGeometry(1.15, 3.6, 20, 1, true));
    coneGeo.translate(0, -1.8, 0);
    coneGeo.rotateX(-Math.PI / 2);
    const beamMesh = new THREE.Mesh(coneGeo, beamConeMat);
    beamMesh.position.z = 0.06;
    beamMesh.renderOrder = 7;
    head.add(beamMesh);

    const headWorld = towerWorldPos.clone().add(head.position);
    head.lookAt(aimWorldTarget.clone().sub(headWorld).add(head.position));
    towerGroup.add(head);
    return head;
  };

  // Place tower cleanly on the levee shoulder behind the engine/pump rig
  const towerPos = new THREE.Vector3(-0.35, 0.0, -1.72);
  towerGroup.position.copy(towerPos);

  const mainAim = new THREE.Vector3(-0.55, 0.65, 0.15);
  const canalAim = new THREE.Vector3(2.85, -0.45, 0.38);

  createFloodHead(-0.22, mainAim, towerPos, ledFaceWarmMat);
  createFloodHead(0.22, canalAim, towerPos, ledFaceCoolMat);

  // 4. Actual Three.js Night Work SpotLights (1 shadow-casting key spot + 1 non-shadow canal fill spot)
  const workSpotMain = new THREE.SpotLight(0xfff1d6, 0, 20, Math.PI / 2.8, 0.62, 1.35);
  workSpotMain.position.set(towerPos.x - 0.22, towerPos.y + 2.64, towerPos.z + 0.12);
  workSpotMain.target.position.copy(mainAim);
  if (!isSoftwareGl) {
    workSpotMain.castShadow = true;
    workSpotMain.shadow.mapSize.set(1024, 1024);
    workSpotMain.shadow.camera.near = 0.8;
    workSpotMain.shadow.camera.far = 18;
    workSpotMain.shadow.bias = -0.0006;
  }

  const workSpotCanal = new THREE.SpotLight(0xdbeafe, 0, 22, Math.PI / 2.6, 0.68, 1.3);
  workSpotCanal.position.set(towerPos.x + 0.22, towerPos.y + 2.64, towerPos.z + 0.12);
  workSpotCanal.target.position.copy(canalAim);

  const workOutfallFill = new THREE.PointLight(0x93c5fd, 0, 12, 1.5);
  workOutfallFill.position.set(-3.8, 1.4, 0.9);

  return {
    towerGroup,
    workSpotMain,
    workSpotCanal,
    workOutfallFill,
    setTowerBaseY: (baseY: number) => {
      towerGroup.position.y = baseY;
      workSpotMain.position.y = baseY + 2.64;
      workSpotCanal.position.y = baseY + 2.64;
    },
  };
}

export function createStageManager(
  scene: THREE.Scene,
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): StageManager {
  const disposables: Array<{ dispose: () => void }> = [];

  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
  }

  // =========================================================================
  // 1. THREE-POINT LIGHTING RIG + STUDIO SOFTBOXES
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x161a22, 0.72);
  hemiLight.position.set(0, 14, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff4e4, 2.15);
  keyLight.position.set(-5.8, 9.2, 6.2);
  keyLight.target.position.set(0.5, 0.2, 0.0);
  scene.add(keyLight.target);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1.0;
    keyLight.shadow.camera.far = 28.0;
    keyLight.shadow.camera.left = -8.5;
    keyLight.shadow.camera.right = 8.5;
    keyLight.shadow.camera.top = 6.5;
    keyLight.shadow.camera.bottom = -6.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.024;
    keyLight.shadow.radius = 3;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x8ec5ff, 1.35);
  rimLight.position.set(5.5, 4.2, -6.2);
  rimLight.target.position.set(0.4, 0.5, 0.0);
  scene.add(rimLight.target);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0x9fb5d1, 0.55);
  fillLight.position.set(-4.5, 2.8, -3.5);
  scene.add(fillLight);

  const softboxes: THREE.RectAreaLight[] = [];
  if (!isSoftwareGl) {
    const sb1 = new THREE.RectAreaLight(0xffffff, 4.2, 6.5, 1.8);
    sb1.position.set(0.4, 4.6, 1.4);
    sb1.lookAt(0.4, 0.7, 0.1);
    scene.add(sb1);
    softboxes.push(sb1);

    const sb2 = new THREE.RectAreaLight(0xdbeafe, 2.4, 5.0, 1.2);
    sb2.position.set(-2.6, 2.8, -2.6);
    sb2.lookAt(-0.4, 0.7, 0.0);
    scene.add(sb2);
    softboxes.push(sb2);
  }

  // =========================================================================
  // 2. ELEVATED 1.32 m CONCRETE-STEEL PODIUM + LOWERED STUDIO / FIELD FLOOR
  //    Keeps the entire 5m (18 deg) PVC pipe & submerged strainer cleanly
  //    visible above the ground floor in Studio & Field inspection modes.
  // =========================================================================
  const flatFloorGroup = new THREE.Group();
  scene.add(flatFloorGroup);

  const floorGeo = new THREE.CircleGeometry(38, 64);
  floorGeo.rotateX(-Math.PI / 2);
  disposables.push(floorGeo);

  const studioFloorMat = new THREE.MeshStandardMaterial({
    map: textures.studioFloorMap,
    color: 0xffffff,
    metalness: 0.28,
    roughness: 0.42,
    envMapIntensity: 0.85,
  });
  const fieldFloorMat = new THREE.MeshStandardMaterial({
    map: textures.fieldGroundMap,
    color: 0xc2b6a1,
    metalness: 0.04,
    roughness: 0.94,
    envMapIntensity: 0.35,
  });
  disposables.push(studioFloorMat, fieldFloorMat);

  const floorMesh = new THREE.Mesh(floorGeo, studioFloorMat);
  floorMesh.position.y = DIM.PODIUM_FLOOR_Y;
  floorMesh.receiveShadow = true;
  flatFloorGroup.add(floorMesh);

  // --- 1.32 m Concrete-Steel Display Podium beneath wheeled skid (Y = -1.32 to Y = 0.00) ---
  const podiumGroup = new THREE.Group();
  podiumGroup.name = 'ConcreteSteelDisplayPodium';
  flatFloorGroup.add(podiumGroup);

  const podiumCenterX = -0.46;
  const podiumCenterZ = -0.02;
  const podiumW = 2.46; // X: -1.69 .. +0.77 (clears 18° white PVC pipe cleanly!)
  const podiumD = 2.24; // Z: -1.14 .. +1.10
  const podiumH = -DIM.PODIUM_FLOOR_Y; // 1.32 m

  const studioConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x262d38,
    roughness: 0.84,
    metalness: 0.08,
    envMapIntensity: 0.55,
  });
  const fieldConcreteMat = new THREE.MeshStandardMaterial({
    map: textures.fieldGroundMap,
    color: 0xa6a39b,
    roughness: 0.92,
    metalness: 0.03,
    envMapIntensity: 0.38,
  });
  const podiumSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1e242d,
    roughness: 0.44,
    metalness: 0.78,
    envMapIntensity: 0.9,
  });
  const podiumAccentMat = new THREE.MeshStandardMaterial({
    color: 0xc28722,
    roughness: 0.52,
    metalness: 0.35,
  });
  disposables.push(studioConcreteMat, fieldConcreteMat, podiumSteelMat, podiumAccentMat);

  // Concrete Monolith Core (Y = -1.24 to -0.06)
  const coreH = podiumH - 0.14;
  const coreGeo = new THREE.BoxGeometry(podiumW, coreH, podiumD);
  const podiumCoreMesh = new THREE.Mesh(coreGeo, studioConcreteMat);
  podiumCoreMesh.position.set(podiumCenterX, DIM.PODIUM_FLOOR_Y + 0.08 + coreH * 0.5, podiumCenterZ);
  podiumCoreMesh.castShadow = true;
  podiumCoreMesh.receiveShadow = true;
  podiumGroup.add(podiumCoreMesh);

  // Stepped Concrete Base Plinth resting flush on floor (Y = -1.32 to -1.24)
  const plinthGeo = new THREE.BoxGeometry(podiumW + 0.22, 0.08, podiumD + 0.22);
  const podiumPlinthMesh = new THREE.Mesh(plinthGeo, studioConcreteMat);
  podiumPlinthMesh.position.set(podiumCenterX, DIM.PODIUM_FLOOR_Y + 0.04, podiumCenterZ);
  podiumPlinthMesh.castShadow = true;
  podiumPlinthMesh.receiveShadow = true;
  podiumGroup.add(podiumPlinthMesh);

  // Heavy Structural Steel Top Deck Plate (top surface sits strictly at Y = 0.00 m!)
  const topDeckGeo = new THREE.BoxGeometry(podiumW + 0.08, 0.06, podiumD + 0.08);
  const topDeckMesh = new THREE.Mesh(topDeckGeo, podiumSteelMat);
  topDeckMesh.position.set(podiumCenterX, -0.03, podiumCenterZ);
  topDeckMesh.castShadow = true;
  topDeckMesh.receiveShadow = true;
  podiumGroup.add(topDeckMesh);

  // Subtle recessed steel perimeter trim lip & thin industrial safety edge accent
  const rimStripGeo = new THREE.BoxGeometry(podiumW + 0.095, 0.014, podiumD + 0.095);
  const rimStripMesh = new THREE.Mesh(rimStripGeo, podiumAccentMat);
  rimStripMesh.position.set(podiumCenterX, -0.062, podiumCenterZ);
  podiumGroup.add(rimStripMesh);

  // 4 Vertical Structural Steel Corner Angle Columns reinforcing the concrete pedestal
  const cornerPostGeo = new THREE.BoxGeometry(0.085, coreH + 0.02, 0.085);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = new THREE.Mesh(cornerPostGeo, podiumSteelMat);
      col.position.set(
        podiumCenterX + sx * (podiumW * 0.5 - 0.01),
        DIM.PODIUM_FLOOR_Y + 0.08 + coreH * 0.5,
        podiumCenterZ + sz * (podiumD * 0.5 - 0.01),
      );
      col.castShadow = true;
      col.receiveShadow = true;
      podiumGroup.add(col);
    }
  }

  // Structural steel tie-beams on front & rear concrete faces for industrial test-stand feel
  const crossBeamGeo = new THREE.BoxGeometry(podiumW + 0.03, 0.065, 0.04);
  for (const sz of [-1, 1]) {
    const beam = new THREE.Mesh(crossBeamGeo, podiumSteelMat);
    beam.position.set(
      podiumCenterX,
      DIM.PODIUM_FLOOR_Y + 0.66,
      podiumCenterZ + sz * (podiumD * 0.5 + 0.005),
    );
    beam.castShadow = true;
    podiumGroup.add(beam);
  }
  disposables.push(coreGeo, plinthGeo, topDeckGeo, rimStripGeo, cornerPostGeo, crossBeamGeo);

  // Contact shadow directly atop the steel podium deck under tires & stabilizer pads
  const contactGeo = new THREE.PlaneGeometry(2.35, 2.15);
  contactGeo.rotateX(-Math.PI / 2);
  const contactMat = new THREE.MeshBasicMaterial({
    map: textures.contactShadowMap,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  disposables.push(contactGeo, contactMat);

  const contactShadowTop = new THREE.Mesh(contactGeo, contactMat);
  contactShadowTop.position.set(-0.46, 0.004, -0.02);
  flatFloorGroup.add(contactShadowTop);

  // Ground ambient occlusion shadow on the lowered Studio/Field floor beneath podium & hanging pipe
  const floorShadowGeo = new THREE.PlaneGeometry(8.2, 4.4);
  floorShadowGeo.rotateX(-Math.PI / 2);
  disposables.push(floorShadowGeo);
  const contactShadowFloor = new THREE.Mesh(floorShadowGeo, contactMat);
  contactShadowFloor.position.set(0.65, DIM.PODIUM_FLOOR_Y + 0.005, 0.12);
  flatFloorGroup.add(contactShadowFloor);

  // Subtle contact shadow on levee crest as well (sits flush at Y = 0.005 on flat crest)
  const crestContactShadow = new THREE.Mesh(contactGeo, contactMat);
  crestContactShadow.position.set(-0.42, 0.005, 0.0);
  scene.add(crestContactShadow);

  // =========================================================================
  // 3. PROCEDURAL 3D TANGGUL (KANAL -> SUNGAI) + NIGHT FLOODLIGHT TOWER
  // =========================================================================
  const { tanggulGroup, canalWater, canalWaterMat, riverWaterMat } =
    buildTanggulEnvironment(textures, disposables);
  scene.add(tanggulGroup);

  const nightTower = buildNightWorkLightTower(disposables, isSoftwareGl);
  scene.add(
    nightTower.towerGroup,
    nightTower.workSpotMain,
    nightTower.workSpotMain.target,
    nightTower.workSpotCanal,
    nightTower.workSpotCanal.target,
    nightTower.workOutfallFill,
  );

  // =========================================================================
  // 4. PROCEDURAL SKY / STUDIO CYCLORAMA DOME
  // =========================================================================
  const domeGeo = new THREE.SphereGeometry(48, 32, 20);
  disposables.push(domeGeo);

  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTopColor: { value: new THREE.Color(0x090c12) },
      uMidColor: { value: new THREE.Color(0x131923) },
      uBottomColor: { value: new THREE.Color(0x0b0e13) },
    },
    vertexShader: `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uBottomColor;
      varying vec3 vWorldPos;
      void main() {
        float h = normalize(vWorldPos).y;
        vec3 col = h >= 0.0
          ? mix(uMidColor, uTopColor, smoothstep(0.0, 0.55, h))
          : mix(uMidColor, uBottomColor, smoothstep(0.0, 0.25, -h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  disposables.push(domeMat);

  const skyDome = new THREE.Mesh(domeGeo, domeMat);
  scene.add(skyDome);

  // =========================================================================
  // STAGE & TIME-OF-DAY ATMOSPHERE SWITCHING (TANGGUL | STUDIO | FIELD)
  //                                          x (DAY | DUSK | NIGHT)
  // =========================================================================
  let currentMode: StageMode = 'tanggul';

  const setWaterAtmosphere = (
    skyHex: number,
    fogHex: number,
    specHex: number,
    sunX: number,
    sunY: number,
    sunZ: number,
    canalDeepHex: number,
    canalShallowHex: number,
    riverDeepHex: number,
    riverShallowHex: number,
  ) => {
    for (const mat of [canalWaterMat, riverWaterMat]) {
      mat.uniforms.uSkyColor.value.setHex(skyHex);
      mat.uniforms.uFogColor.value.setHex(fogHex);
      mat.uniforms.uSpecColor.value.setHex(specHex);
      mat.uniforms.uSunDir.value.set(sunX, sunY, sunZ).normalize();
    }
    canalWaterMat.uniforms.uDeepColor.value.setHex(canalDeepHex);
    canalWaterMat.uniforms.uShallowColor.value.setHex(canalShallowHex);
    riverWaterMat.uniforms.uDeepColor.value.setHex(riverDeepHex);
    riverWaterMat.uniforms.uShallowColor.value.setHex(riverShallowHex);
  };

  const setAtmosphere = (mode: StageMode, timeOfDay: TimeOfDay) => {
    currentMode = mode;

    // Reset night floodlight rig by default
    const isNightOutdoor = mode !== 'studio' && timeOfDay === 'night';
    nightTower.towerGroup.visible = isNightOutdoor;
    nightTower.setTowerBaseY(mode === 'tanggul' ? 0.0 : DIM.PODIUM_FLOOR_Y);
    nightTower.workSpotMain.intensity = isNightOutdoor ? 32 : 0;
    nightTower.workSpotCanal.intensity = isNightOutdoor ? 24 : 0;
    nightTower.workOutfallFill.intensity = isNightOutdoor ? 7.5 : 0;

    if (mode === 'studio') {
      flatFloorGroup.visible = true;
      tanggulGroup.visible = false;
      crestContactShadow.visible = false;

      scene.background = new THREE.Color(0x0d1118);
      scene.fog = new THREE.FogExp2(0x0d1118, 0.036);

      domeMat.uniforms.uTopColor.value.setHex(0x070a0f);
      domeMat.uniforms.uMidColor.value.setHex(0x161d29);
      domeMat.uniforms.uBottomColor.value.setHex(0x0b0e13);

      floorMesh.material = studioFloorMat;
      podiumCoreMesh.material = studioConcreteMat;
      podiumPlinthMesh.material = studioConcreteMat;
      contactMat.opacity = 0.65;

      hemiLight.color.setHex(0xcbd5e1);
      hemiLight.groundColor.setHex(0x151922);
      hemiLight.intensity = 0.72;

      keyLight.color.setHex(timeOfDay === 'dusk' ? 0xffe0bd : 0xfff5e8);
      keyLight.intensity = 2.2;
      keyLight.position.set(-4.8, 7.2, 5.2);

      rimLight.color.setHex(timeOfDay === 'night' ? 0x60a5fa : 0x7cc0ff);
      rimLight.intensity = 1.45;

      fillLight.color.setHex(0x9fb5d1);
      fillLight.intensity = 0.55;

      softboxes.forEach((sb, i) => {
        sb.intensity = i === 0 ? 4.2 : 2.4;
      });
      return;
    }

    // Outdoor Stages: TANGGUL or FIELD
    const isTanggul = mode === 'tanggul';
    flatFloorGroup.visible = !isTanggul;
    tanggulGroup.visible = isTanggul;
    crestContactShadow.visible = isTanggul;

    if (!isTanggul) {
      floorMesh.material = fieldFloorMat;
      podiumCoreMesh.material = fieldConcreteMat;
      podiumPlinthMesh.material = fieldConcreteMat;
    }

    softboxes.forEach((sb) => {
      sb.intensity = 0;
    });

    if (timeOfDay === 'day') {
      const fogHex = isTanggul ? 0xc4d9e8 : 0xc5d7e6;
      scene.background = new THREE.Color(fogHex);
      scene.fog = new THREE.FogExp2(fogHex, isTanggul ? 0.022 : 0.025);

      domeMat.uniforms.uTopColor.value.setHex(isTanggul ? 0x3f7fb8 : 0x4b84b8);
      domeMat.uniforms.uMidColor.value.setHex(fogHex);
      domeMat.uniforms.uBottomColor.value.setHex(isTanggul ? 0x8a9a8c : 0x9a8f7c);

      contactMat.opacity = 0.44;

      hemiLight.color.setHex(0xaad5f7);
      hemiLight.groundColor.setHex(isTanggul ? 0x636e4b : 0x8a7d65);
      hemiLight.intensity = 1.18;

      keyLight.color.setHex(0xffebd0);
      keyLight.intensity = 3.1;
      keyLight.position.set(-6.8, 11.2, 6.2);

      rimLight.color.setHex(0xd8eeff);
      rimLight.intensity = 0.72;

      fillLight.color.setHex(0xfff1d8);
      fillLight.intensity = 0.42;

      setWaterAtmosphere(
        0xc2dbf0,
        fogHex,
        0xfff6e5,
        -0.48,
        0.78,
        0.39,
        0x1e4742,
        0x326a61,
        0x1a3f54,
        0x2c6078,
      );
    } else if (timeOfDay === 'dusk') {
      // Golden Hour / Sore: Warm low amber sunlight & dramatic levee shadows
      const fogHex = 0xd6936c;
      scene.background = new THREE.Color(fogHex);
      scene.fog = new THREE.FogExp2(fogHex, 0.024);

      domeMat.uniforms.uTopColor.value.setHex(0x283a61);
      domeMat.uniforms.uMidColor.value.setHex(0xe8945e);
      domeMat.uniforms.uBottomColor.value.setHex(0x5e4237);

      contactMat.opacity = 0.50;

      hemiLight.color.setHex(0xffb88c);
      hemiLight.groundColor.setHex(0x4a382c);
      hemiLight.intensity = 0.92;

      keyLight.color.setHex(0xff9a4d);
      keyLight.intensity = 3.15;
      keyLight.position.set(-10.5, 3.6, 5.2);

      rimLight.color.setHex(0x7aa2d8);
      rimLight.intensity = 0.85;

      fillLight.color.setHex(0xffc794);
      fillLight.intensity = 0.38;

      setWaterAtmosphere(
        0xf2a56b,
        fogHex,
        0xffb46b,
        -0.82,
        0.32,
        0.42,
        0x1f3638,
        0x3e5952,
        0x1b3346,
        0x44576b,
      );
    } else {
      // Night Flood Operations / Malam: Indigo moonlit levee + Tripod LED Floodlight Tower!
      const fogHex = 0x09111f;
      scene.background = new THREE.Color(fogHex);
      scene.fog = new THREE.FogExp2(fogHex, 0.026);

      domeMat.uniforms.uTopColor.value.setHex(0x040710);
      domeMat.uniforms.uMidColor.value.setHex(0x0f1c32);
      domeMat.uniforms.uBottomColor.value.setHex(0x060b14);

      contactMat.opacity = 0.70;

      hemiLight.color.setHex(0x3a588a);
      hemiLight.groundColor.setHex(0x0d141c);
      hemiLight.intensity = 0.42;

      // Soft cool moonlight key so silhouette & distant banks stay legible
      keyLight.color.setHex(0x7ca2db);
      keyLight.intensity = 0.58;
      keyLight.position.set(6.5, 9.5, -5.5);

      rimLight.color.setHex(0x4b77b8);
      rimLight.intensity = 0.48;

      fillLight.color.setHex(0x283e61);
      fillLight.intensity = 0.25;

      setWaterAtmosphere(
        0x1b3252,
        fogHex,
        0xfff2d6,
        0.15,
        0.65,
        -0.55,
        0x08161a,
        0x122b32,
        0x071422,
        0x112a40,
      );
    }
  };

  const update = (
    time: number,
    rpm: number,
    waterFlowEnabled: boolean,
    canalWaterY: number,
    cavitationState: CavitationState,
  ) => {
    if (currentMode !== 'tanggul') return;

    // Live vertical elevation of the animated Canal Water plane!
    canalWater.position.y = canalWaterY;

    const flowFactor =
      waterFlowEnabled && rpm > 300
        ? Math.max(0, (rpm - 300) / (2200 - 300))
        : 0;
    const vortexBoost =
      cavitationState === 'critical'
        ? 1.0
        : cavitationState === 'warning'
          ? 0.65
          : 0.0;

    canalWaterMat.uniforms.uTime.value = time;
    canalWaterMat.uniforms.uSuctionStrength.value = flowFactor;
    canalWaterMat.uniforms.uVortexBoost.value = vortexBoost;
    riverWaterMat.uniforms.uTime.value = time;
  };

  setAtmosphere('tanggul', 'day');

  return {
    setAtmosphere,
    update,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
