import * as THREE from 'three';
import { CavitationState, StageMode, TimeOfDay } from '../types';
import { DIM } from './dimensions';
import { MaterialLibrary } from './materials';
import { ProceduralTextureSet } from './textures';

export interface FluidAndFxSystem {
  root: THREE.Group;
  update: (
    dt: number,
    time: number,
    rpm: number,
    waterFlowEnabled: boolean,
    dischargeHoseAttached: boolean,
    stageMode: StageMode,
    timeOfDay: TimeOfDay,
    canalWaterY: number,
    cavitationState: CavitationState,
    cavitationEfficiency: number,
    loadHp: number,
    explodeMix: number,
    exhaustWorldPos: THREE.Vector3,
  ) => void;
  dispose: () => void;
}

interface WaterParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  isSplash: boolean;
}

interface ExhaustParticle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
}

/**
 * Generates a parabolic 12-inch water jet tube mesh with pre-allocated vertex buffers
 * that morph smoothly with RPM without reallocating geometry every frame.
 */
export function createFluidAndFxSystem(
  mats: MaterialLibrary,
  textures: ProceduralTextureSet,
): FluidAndFxSystem {
  const root = new THREE.Group();
  root.name = 'FluidAndExhaustFX';

  // =========================================================================
  // 1. DYNAMIC PARABOLIC WATER-JET MESH (ZERO-GC VERTEX MORPHING)
  // =========================================================================
  const lengthSegs = 28;
  const radialSegs = 20;
  const vertCount = (lengthSegs + 1) * (radialSegs + 1);
  const jetPositions = new Float32Array(vertCount * 3);
  const jetNormals = new Float32Array(vertCount * 3);
  const jetUvs = new Float32Array(vertCount * 2);
  const jetIndices: number[] = [];

  for (let i = 0; i <= lengthSegs; i++) {
    const u = i / lengthSegs;
    for (let j = 0; j <= radialSegs; j++) {
      const v = j / radialSegs;
      const idx = i * (radialSegs + 1) + j;
      jetUvs[idx * 2] = u;
      jetUvs[idx * 2 + 1] = v;
    }
  }
  for (let i = 0; i < lengthSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = (i + 1) * (radialSegs + 1) + j;
      const c = (i + 1) * (radialSegs + 1) + (j + 1);
      const d = i * (radialSegs + 1) + (j + 1);
      jetIndices.push(a, b, d, b, c, d);
    }
  }

  const jetGeo = new THREE.BufferGeometry();
  jetGeo.setAttribute('position', new THREE.BufferAttribute(jetPositions, 3));
  jetGeo.setAttribute('normal', new THREE.BufferAttribute(jetNormals, 3));
  jetGeo.setAttribute('uv', new THREE.BufferAttribute(jetUvs, 2));
  jetGeo.setIndex(jetIndices);

  const jetMesh = new THREE.Mesh(jetGeo, mats.waterJetShader);
  jetMesh.frustumCulled = false;
  jetMesh.renderOrder = 5;
  root.add(jetMesh);

  // Floor Splash Foam Pool Ring (positioned dynamically at parabolic impact X!)
  const splashPoolGeo = new THREE.CircleGeometry(0.68, 32);
  splashPoolGeo.rotateX(-Math.PI / 2);
  const splashPoolMat = new THREE.MeshBasicMaterial({
    map: textures.particleSoftMap,
    color: 0xdcf4ff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const splashPoolMesh = new THREE.Mesh(splashPoolGeo, splashPoolMat);
  splashPoolMesh.position.set(-4.5, DIM.RIVER_WATER_Y + 0.025, DIM.PUMP_Z);
  splashPoolMesh.renderOrder = 3;
  root.add(splashPoolMesh);

  // Expanding Outer Turbulent Whitewater Ripple Ring around river outfall impact
  const splashRippleGeo = new THREE.RingGeometry(0.45, 0.92, 36);
  splashRippleGeo.rotateX(-Math.PI / 2);
  const splashRippleMat = new THREE.MeshBasicMaterial({
    map: textures.particleSoftMap,
    color: 0xf0faff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const splashRippleMesh = new THREE.Mesh(splashRippleGeo, splashRippleMat);
  splashRippleMesh.position.set(-4.5, DIM.RIVER_WATER_Y + 0.028, DIM.PUMP_Z);
  splashRippleMesh.renderOrder = 3;
  root.add(splashRippleMesh);

  // Canal Intake Suction Swirl Ring + Inner Cavitation Vortex Core (tracks live canalWaterY!)
  const suctionRingGeo = new THREE.RingGeometry(0.18, 0.68, 32);
  suctionRingGeo.rotateX(-Math.PI / 2);
  const suctionRingMat = new THREE.MeshBasicMaterial({
    map: textures.particleSoftMap,
    color: 0xbfe8f2,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
  });
  const suctionRingMesh = new THREE.Mesh(suctionRingGeo, suctionRingMat);
  suctionRingMesh.position.set(DIM.INTAKE_END_X - 0.15, DIM.CANAL_WATER_Y + 0.02, DIM.PUMP_Z);
  suctionRingMesh.renderOrder = 3;
  root.add(suctionRingMesh);

  const vortexCoreGeo = new THREE.ConeGeometry(0.24, 0.28, 24, 1, true);
  vortexCoreGeo.rotateX(Math.PI); // Funnel apex pointing downward into intake strainer!
  const vortexCoreMat = new THREE.MeshBasicMaterial({
    color: 0xe6f9ff,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const vortexCoreMesh = new THREE.Mesh(vortexCoreGeo, vortexCoreMat);
  vortexCoreMesh.position.set(DIM.PROPELLER_X, DIM.CANAL_WATER_Y - 0.06, DIM.PUMP_Z);
  vortexCoreMesh.renderOrder = 4;
  root.add(vortexCoreMesh);

  // =========================================================================
  // 2. BALLISTIC WATER SPRAY & SPLASH PARTICLE SYSTEM (420 PARTICLES)
  // =========================================================================
  const waterCount = 420;
  const waterParticles: WaterParticle[] = [];
  const waterPosArr = new Float32Array(waterCount * 3);
  const waterColArr = new Float32Array(waterCount * 3);

  for (let i = 0; i < waterCount; i++) {
    waterParticles.push({
      pos: new THREE.Vector3(-10, -10, 0),
      vel: new THREE.Vector3(),
      age: Math.random() * 1.2,
      life: 0.4 + Math.random() * 0.7,
      isSplash: false,
    });
    waterPosArr[i * 3 + 1] = -10;
    waterColArr[i * 3] = 0.85;
    waterColArr[i * 3 + 1] = 0.95;
    waterColArr[i * 3 + 2] = 1.0;
  }

  const waterPtsGeo = new THREE.BufferGeometry();
  waterPtsGeo.setAttribute('position', new THREE.BufferAttribute(waterPosArr, 3));
  waterPtsGeo.setAttribute('color', new THREE.BufferAttribute(waterColArr, 3));

  const waterPtsMat = new THREE.PointsMaterial({
    size: 0.14,
    map: textures.particleSoftMap,
    transparent: true,
    opacity: 0.78,
    vertexColors: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const waterPoints = new THREE.Points(waterPtsGeo, waterPtsMat);
  waterPoints.frustumCulled = false;
  waterPoints.renderOrder = 6;
  root.add(waterPoints);

  // =========================================================================
  // 3. DIESEL EXHAUST PUFFS & HEAT SHIMMER PARTICLES (80 PARTICLES)
  // =========================================================================
  const exhaustCount = 80;
  const exhaustParticles: ExhaustParticle[] = [];
  const exhaustPosArr = new Float32Array(exhaustCount * 3);
  const exhaustColArr = new Float32Array(exhaustCount * 3);

  for (let i = 0; i < exhaustCount; i++) {
    exhaustParticles.push({
      pos: new THREE.Vector3(0, -10, 0),
      vel: new THREE.Vector3(),
      age: Math.random() * 1.4,
      life: 0.65 + Math.random() * 0.85,
    });
    exhaustPosArr[i * 3 + 1] = -10;
  }

  const exhaustGeo = new THREE.BufferGeometry();
  exhaustGeo.setAttribute('position', new THREE.BufferAttribute(exhaustPosArr, 3));
  exhaustGeo.setAttribute('color', new THREE.BufferAttribute(exhaustColArr, 3));

  const exhaustMat = new THREE.PointsMaterial({
    size: 0.19,
    map: textures.particleSoftMap,
    transparent: true,
    opacity: 0.32,
    vertexColors: true,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const exhaustPoints = new THREE.Points(exhaustGeo, exhaustMat);
  exhaustPoints.frustumCulled = false;
  exhaustPoints.renderOrder = 6;
  root.add(exhaustPoints);

  // Reusable scratch vectors (zero GC in loop)
  const _p = new THREE.Vector3();
  const _tangent = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _right = new THREE.Vector3();
  const _normal = new THREE.Vector3();
  const _mouth = new THREE.Vector3();

  let prevRpm = 0;
  let accelLoadSmooth = 0;

  const update = (
    dt: number,
    time: number,
    rpm: number,
    waterFlowEnabled: boolean,
    dischargeHoseAttached: boolean,
    stageMode: StageMode,
    timeOfDay: TimeOfDay,
    canalWaterY: number,
    cavitationState: CavitationState,
    cavitationEfficiency: number,
    loadHp: number,
    explodeMix: number,
    exhaustWorldPos: THREE.Vector3,
  ) => {
    const safeDt = Math.max(0.001, Math.min(dt, 0.05));
    const normRpm = Math.max(0, Math.min(1, rpm / 2200));
    const rawAccel = Math.max(0, (rpm - prevRpm) / safeDt / 1200);
    prevRpm = rpm;
    accelLoadSmooth = THREE.MathUtils.damp(
      accelLoadSmooth,
      Math.min(1, rawAccel),
      4.5,
      safeDt,
    );

    const rawFlowFactor =
      waterFlowEnabled && rpm > 300
        ? Math.max(0, (rpm - 300) / (2200 - 300))
        : 0;

    // Cavitation air-entrainment sputtering modulates discharge jet smoothly
    const sputter =
      cavitationState === 'critical'
        ? 0.45 + 0.55 * Math.max(0, Math.sin(time * 19.0) * Math.cos(time * 7.3))
        : cavitationState === 'warning'
          ? 0.86 + 0.14 * Math.sin(time * 14.0)
          : 1.0;

    const flowFactor = rawFlowFactor * Math.max(0, cavitationEfficiency) * sputter;

    const isTanggul = stageMode === 'tanggul';
    const surfaceY = isTanggul
      ? DIM.RIVER_WATER_Y + 0.025
      : DIM.PODIUM_FLOOR_Y + 0.025;

    // Discharge origin switches seamlessly between open 1m PVC mouth & adaptive Selang Buang tip
    let exitDir = DIM.DISCHARGE_DIR;
    if (dischargeHoseAttached) {
      if (isTanggul) {
        exitDir = DIM.HOSE_TANGGUL_EXIT_DIR;
        _mouth.set(
          DIM.HOSE_TANGGUL_TIP_X - explodeMix * 0.45,
          DIM.HOSE_TANGGUL_TIP_Y,
          DIM.PUMP_Z + explodeMix * 0.42,
        );
      } else {
        exitDir = DIM.HOSE_PODIUM_EXIT_DIR;
        _mouth.set(
          DIM.HOSE_PODIUM_TIP_X - explodeMix * 0.45,
          DIM.HOSE_PODIUM_TIP_Y,
          DIM.PUMP_Z + explodeMix * 0.42,
        );
      }
    } else {
      _mouth.set(
        DIM.DISCHARGE_MOUTH_X,
        DIM.DISCHARGE_MOUTH_Y,
        DIM.PUMP_Z + explodeMix * 0.42,
      );
    }

    // -----------------------------------------------------------------------
    // A. Update Parabolic 12-Inch Water Jet Mesh & Multi-Ring Splash Foam
    // -----------------------------------------------------------------------
    const jetVisible = flowFactor > 0.02;
    jetMesh.visible = jetVisible;
    splashPoolMesh.visible = jetVisible;
    splashRippleMesh.visible = jetVisible;

    // Canal suction surface swirl + cavitation air-core vortex funnel (tracks live canalWaterY!)
    const waterAboveIntake = canalWaterY > DIM.INTAKE_END_Y - 0.04;
    suctionRingMesh.visible = isTanggul && rawFlowFactor > 0.02 && waterAboveIntake;
    if (suctionRingMesh.visible) {
      const cavBoost =
        cavitationState === 'critical' ? 1.75 : cavitationState === 'warning' ? 1.35 : 1.0;
      const pulse = 0.86 + Math.sin(time * (5.2 * cavBoost)) * 0.14;
      suctionRingMesh.position.set(
        DIM.INTAKE_END_X - 0.18,
        canalWaterY + 0.022,
        DIM.PUMP_Z + explodeMix * 0.42,
      );
      suctionRingMesh.scale.set(
        pulse * (0.8 + rawFlowFactor * 0.55) * cavBoost,
        1,
        pulse * (0.8 + rawFlowFactor * 0.55) * cavBoost,
      );
      suctionRingMesh.rotation.y = time * (1.4 + rawFlowFactor * 3.0) * cavBoost;
      suctionRingMat.opacity = Math.min(0.85, (0.20 + rawFlowFactor * 0.34) * cavBoost);
    }

    // Air-entraining vortex funnel visibly drops from canal surface when submergence is low!
    const showVortex =
      isTanggul &&
      rawFlowFactor > 0.06 &&
      waterAboveIntake &&
      cavitationState !== 'safe';
    vortexCoreMesh.visible = showVortex;
    if (showVortex) {
      const funnelDepth = Math.max(0.08, Math.min(0.32, canalWaterY - DIM.PROPELLER_Y + 0.14));
      vortexCoreMesh.position.set(
        DIM.PROPELLER_X,
        canalWaterY - funnelDepth * 0.46,
        DIM.PUMP_Z + explodeMix * 0.42,
      );
      const vScale = (cavitationState === 'critical' ? 1.15 : 0.85) * (0.75 + rawFlowFactor * 0.45);
      vortexCoreMesh.scale.set(vScale, funnelDepth / 0.28, vScale);
      vortexCoreMesh.rotation.y = -time * (8.5 + rawFlowFactor * 9.0);
      vortexCoreMat.opacity =
        (cavitationState === 'critical' ? 0.52 : 0.32) * (0.65 + 0.35 * Math.sin(time * 12));
    }

    let impactX = _mouth.x - 1.2;

    if (jetVisible) {
      const v0 = 1.35 + flowFactor * 3.15;
      const vx = exitDir.x * v0;
      const vy = exitDir.y * v0;
      const g = 9.81;

      const dropH = Math.max(0.08, _mouth.y - surfaceY);
      const disc = vy * vy + 2 * g * dropH;
      const tHit = (vy + Math.sqrt(Math.max(0.01, disc))) / g;
      impactX = _mouth.x + vx * tHit;

      const posAttr = jetGeo.attributes.position as THREE.BufferAttribute;
      const normAttr = jetGeo.attributes.normal as THREE.BufferAttribute;

      for (let i = 0; i <= lengthSegs; i++) {
        const u = i / lengthSegs;
        const t = u * tHit;

        _p.set(_mouth.x + vx * t, _mouth.y + vy * t - 0.5 * g * t * t, _mouth.z);
        _tangent.set(vx, vy - g * t, 0).normalize();
        _right.crossVectors(_tangent, _up).normalize();
        if (_right.lengthSq() < 0.001) _right.set(0, 0, 1);
        _normal.crossVectors(_right, _tangent).normalize();

        const baseR = DIM.PIPE_INNER_R * (0.62 + 0.34 * flowFactor);
        const radius = baseR * (1.0 + u * 0.32) * (1.0 - 0.10 * Math.sin(u * Math.PI));

        for (let j = 0; j <= radialSegs; j++) {
          const theta = (j / radialSegs) * Math.PI * 2;
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);

          const nx = _right.x * cosT + _normal.x * sinT;
          const ny = _right.y * cosT + _normal.y * sinT;
          const nz = _right.z * cosT + _normal.z * sinT;

          const idx = (i * (radialSegs + 1) + j) * 3;
          jetPositions[idx] = _p.x + nx * radius;
          jetPositions[idx + 1] = Math.max(surfaceY - 0.02, _p.y + ny * radius);
          jetPositions[idx + 2] = _p.z + nz * radius;

          jetNormals[idx] = nx;
          jetNormals[idx + 1] = ny;
          jetNormals[idx + 2] = nz;
        }
      }

      posAttr.needsUpdate = true;
      normAttr.needsUpdate = true;

      mats.waterJetShader.uniforms.uTime.value = time;
      mats.waterJetShader.uniforms.uFlowSpeed.value = flowFactor;
      mats.waterJetShader.uniforms.uIntensity.value = 0.48 + flowFactor * 0.52;

      // Update river/floor splash foam pool + expanding concentric whitewater ripple ring
      splashPoolMesh.position.set(impactX, surfaceY + 0.005, _mouth.z);
      const riverBoost = isTanggul ? 1.52 : 1.0;
      const poolScale = (0.72 + flowFactor * 0.96 + Math.sin(time * 14) * 0.06) * riverBoost;
      splashPoolMesh.scale.set(poolScale * 1.38, 1, poolScale);
      splashPoolMat.opacity = 0.36 + flowFactor * 0.48;

      const ripplePhase = (time * (0.95 + flowFactor * 0.9)) % 1;
      const rippleScale = (0.85 + ripplePhase * 1.65) * riverBoost * (0.65 + flowFactor * 0.55);
      splashRippleMesh.position.set(impactX - ripplePhase * 0.32, surfaceY + 0.008, _mouth.z);
      splashRippleMesh.scale.set(rippleScale * 1.35, 1, rippleScale);
      splashRippleMat.opacity = (1 - ripplePhase) * (0.28 + flowFactor * 0.38);
    }

    // -----------------------------------------------------------------------
    // B. Update Ballistic Water Spray & River/Floor Splash Droplets
    // -----------------------------------------------------------------------
    waterPoints.visible = jetVisible;
    if (jetVisible) {
      const v0 = 1.4 + flowFactor * 3.2;
      const g = 9.81;
      for (let i = 0; i < waterCount; i++) {
        const pt = waterParticles[i];
        pt.age += safeDt;

        if (pt.age >= pt.life) {
          pt.age = 0;
          if (i % 5 < 3) {
            pt.isSplash = false;
            pt.life = 0.35 + Math.random() * 0.55;
            const ang = Math.random() * Math.PI * 2;
            const rad = DIM.PIPE_INNER_R * (0.45 + Math.random() * 0.52);
            pt.pos.set(
              _mouth.x,
              _mouth.y + Math.sin(ang) * rad,
              _mouth.z + Math.cos(ang) * rad,
            );
            const speedSpread = v0 * (0.85 + Math.random() * 0.35);
            pt.vel.set(
              exitDir.x * speedSpread + (Math.random() - 0.5) * 0.45,
              exitDir.y * speedSpread + (Math.random() - 0.5) * 0.5,
              (Math.random() - 0.5) * (0.55 + flowFactor * 0.45),
            );
          } else {
            pt.isSplash = true;
            pt.life = 0.30 + Math.random() * 0.48;
            const ang = Math.random() * Math.PI * 2;
            const r = Math.random() * (isTanggul ? 0.52 : 0.32);
            pt.pos.set(
              impactX + Math.cos(ang) * r,
              surfaceY + 0.02,
              _mouth.z + Math.sin(ang) * r,
            );
            const splashSpd = 0.65 + flowFactor * 1.75;
            pt.vel.set(
              Math.cos(ang) * splashSpd * (0.4 + Math.random() * 0.8) - flowFactor * 0.65,
              0.75 + Math.random() * (1.25 + flowFactor * 1.5),
              Math.sin(ang) * splashSpd * (0.5 + Math.random() * 0.8),
            );
          }
        } else {
          pt.vel.y -= g * safeDt;
          pt.pos.addScaledVector(pt.vel, safeDt);
          if (pt.pos.y < surfaceY + 0.01) {
            pt.pos.y = surfaceY + 0.01;
            pt.vel.y *= -0.25;
            pt.vel.x *= 0.72;
            pt.vel.z *= 0.72;
          }
        }

        const idx = i * 3;
        waterPosArr[idx] = pt.pos.x;
        waterPosArr[idx + 1] = pt.pos.y;
        waterPosArr[idx + 2] = pt.pos.z;

        const fade = 1 - pt.age / pt.life;
        const bright = pt.isSplash ? 0.96 : 0.72 + fade * 0.25;
        waterColArr[idx] = bright * 0.82;
        waterColArr[idx + 1] = bright * 0.94;
        waterColArr[idx + 2] = bright;
      }
      (waterPtsGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (waterPtsGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      waterPtsMat.opacity = 0.35 + flowFactor * 0.48;
      waterPtsMat.size = 0.09 + flowFactor * 0.075;
    }

    // -----------------------------------------------------------------------
    // C. Load- & Acceleration-Reactive Diesel Exhaust Puffs from Muffler Stack
    // -----------------------------------------------------------------------
    const exhaustActive = rpm > 60;
    exhaustPoints.visible = exhaustActive;
    if (exhaustActive) {
      const loadRatio = Math.min(1, loadHp / 30.0);
      const sootFactor = Math.min(1, loadRatio * 0.72 + accelLoadSmooth * 0.55);
      const isNight = stageMode !== 'studio' && timeOfDay === 'night';

      for (let i = 0; i < exhaustCount; i++) {
        const ep = exhaustParticles[i];
        ep.age += safeDt * (0.72 + normRpm * 1.45);

        if (ep.age >= ep.life) {
          ep.age = 0;
          ep.life = 0.62 + Math.random() * 0.92;
          ep.pos.copy(exhaustWorldPos);
          ep.pos.x += (Math.random() - 0.5) * 0.025;
          ep.pos.z += (Math.random() - 0.5) * 0.025;
          ep.vel.set(
            (Math.random() - 0.5) * 0.24 - 0.10 - sootFactor * 0.08,
            0.55 + normRpm * 1.35 + sootFactor * 0.35 + Math.random() * 0.32,
            (Math.random() - 0.5) * 0.24,
          );
        } else {
          ep.pos.addScaledVector(ep.vel, safeDt);
          ep.vel.y *= 0.984;
          ep.pos.x += Math.sin(time * 4.2 + i) * 0.0024;
          ep.pos.z += Math.cos(time * 3.6 + i) * 0.0024;
        }

        const idx = i * 3;
        exhaustPosArr[idx] = ep.pos.x;
        exhaustPosArr[idx + 1] = ep.pos.y;
        exhaustPosArr[idx + 2] = ep.pos.z;

        const lifeRatio = 1 - ep.age / ep.life;
        // Pale warm heat haze at idle -> dense dark diesel soot on heavy load / throttle rev
        const baseShade = (0.58 - sootFactor * 0.40) * lifeRatio;
        if (isNight) {
          // Subtly backlit by the warm tripod LED work-light so smoke reads clearly at night
          exhaustColArr[idx] = Math.min(1, baseShade * 1.15 + 0.10 * lifeRatio);
          exhaustColArr[idx + 1] = Math.min(1, baseShade * 1.05 + 0.08 * lifeRatio);
          exhaustColArr[idx + 2] = Math.min(1, baseShade * 0.92 + 0.05 * lifeRatio);
        } else {
          exhaustColArr[idx] = baseShade;
          exhaustColArr[idx + 1] = baseShade * 0.97;
          exhaustColArr[idx + 2] = baseShade * 1.02;
        }
      }
      (exhaustGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (exhaustGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
      exhaustMat.opacity = 0.15 + normRpm * 0.18 + sootFactor * 0.26;
      exhaustMat.size = 0.17 + sootFactor * 0.11;
    }
  };

  return {
    root,
    update,
    dispose: () => {
      jetGeo.dispose();
      splashPoolGeo.dispose();
      splashPoolMat.dispose();
      splashRippleGeo.dispose();
      splashRippleMat.dispose();
      suctionRingGeo.dispose();
      suctionRingMat.dispose();
      vortexCoreGeo.dispose();
      vortexCoreMat.dispose();
      waterPtsGeo.dispose();
      waterPtsMat.dispose();
      exhaustGeo.dispose();
      exhaustMat.dispose();
    },
  };
}
