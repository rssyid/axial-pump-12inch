import * as THREE from 'three';
import { ProceduralTextureSet } from './textures';

export interface MaterialLibrary {
  // Engine materials
  crimsonEnamel: THREE.MeshPhysicalMaterial;
  crimsonCutawayGhost: THREE.ShaderMaterial;
  castIronDark: THREE.MeshStandardMaterial;
  castIronFlywheel: THREE.MeshStandardMaterial;
  machinedSteel: THREE.MeshPhysicalMaterial;
  pistonAlloy: THREE.MeshPhysicalMaterial;
  copperLine: THREE.MeshStandardMaterial;
  brassFitting: THREE.MeshStandardMaterial;
  exhaustMatteBlack: THREE.MeshStandardMaterial;
  nameplateMat: THREE.MeshStandardMaterial;
  combustionGlow: THREE.MeshBasicMaterial;

  // Chassis & Tires
  chassisBlackSteel: THREE.MeshStandardMaterial;
  tireRubber: THREE.MeshStandardMaterial;
  wheelRimSteel: THREE.MeshStandardMaterial;
  boltZinc: THREE.MeshStandardMaterial;

  // Pump & Kopel
  pumpPipeSolid: THREE.MeshPhysicalMaterial;
  pumpPipeXray: THREE.ShaderMaterial;
  clampSteel: THREE.MeshStandardMaterial;
  kopelBlackSteel: THREE.MeshStandardMaterial;
  pillowBlockBlueGrey: THREE.MeshStandardMaterial;
  vbeltRubber: THREE.MeshStandardMaterial;
  propellerCastBronze: THREE.MeshPhysicalMaterial;
  dischargeHoseBlue: THREE.MeshStandardMaterial;
  dischargeHoseSpiral: THREE.MeshStandardMaterial;

  // Electrical (12V Battery & OTOR Starter)
  batteryCaseDark: THREE.MeshStandardMaterial;
  batteryCapYellow: THREE.MeshStandardMaterial;
  cableRed: THREE.MeshStandardMaterial;
  cableBlack: THREE.MeshStandardMaterial;

  // Water & X-Ray flow
  waterJetShader: THREE.ShaderMaterial;
  internalFlowShader: THREE.ShaderMaterial;

  dispose: () => void;
}

function createFresnelXrayMaterial(
  baseColorHex: number,
  rimColorHex: number,
  baseOpacity: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: new THREE.Color(baseColorHex) },
      uRimColor: { value: new THREE.Color(rimColorHex) },
      uBaseOpacity: { value: baseOpacity },
      uXrayMix: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalWorld = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uBaseColor;
      uniform vec3 uRimColor;
      uniform float uBaseOpacity;
      uniform float uXrayMix;
      varying vec3 vNormalWorld;
      varying vec3 vWorldPos;
      void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        float ndv = abs(dot(normalize(vNormalWorld), viewDir));
        float fresnel = pow(1.0 - ndv, 2.25);
        vec3 col = mix(uBaseColor, uRimColor, fresnel * 0.9);
        float alpha = clamp((uBaseOpacity + fresnel * 0.58) * uXrayMix, 0.0, 0.85);
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function createMaterialLibrary(
  textures: ProceduralTextureSet,
  isSoftwareGl: boolean,
): MaterialLibrary {
  const disposables: THREE.Material[] = [];
  const track = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  // Signature Dongfeng ZH1130 crimson enamel with subtle clearcoat
  const crimsonEnamel = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xb51920,
      metalness: 0.28,
      roughness: 0.34,
      clearcoat: isSoftwareGl ? 0.35 : 0.78,
      clearcoatRoughness: 0.22,
      bumpMap: textures.castIronBump,
      bumpScale: 0.0025,
      envMapIntensity: 1.15,
    }),
  );

  const crimsonCutawayGhost = track(
    createFresnelXrayMaterial(0x7a1219, 0xf87171, 0.09),
  );

  // Heavy cast-iron dark crankcase/cylinder accents
  const castIronDark = track(
    new THREE.MeshStandardMaterial({
      color: 0x262a31,
      metalness: 0.58,
      roughness: 0.72,
      bumpMap: textures.castIronBump,
      bumpScale: 0.006,
      roughnessMap: textures.castIronRoughness,
      envMapIntensity: 0.95,
    }),
  );

  // Heavy cast-iron flywheel (crimson-tinted hub & machined rim accents)
  const castIronFlywheel = track(
    new THREE.MeshStandardMaterial({
      color: 0x30353e,
      metalness: 0.68,
      roughness: 0.54,
      bumpMap: textures.castIronBump,
      bumpScale: 0.004,
      roughnessMap: textures.castIronRoughness,
      envMapIntensity: 1.1,
    }),
  );

  // Machined steel drive shaft, pulley grooves, crankshaft journals
  const machinedSteel = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xd8dee6,
      map: textures.brushedSteelMap,
      roughnessMap: textures.brushedSteelRoughness,
      metalness: 0.92,
      roughness: 0.22,
      anisotropy: isSoftwareGl ? 0 : 0.65,
      envMapIntensity: 1.35,
    }),
  );

  // Cast aluminum-alloy piston inside cutaway
  const pistonAlloy = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xe6ebf2,
      metalness: 0.88,
      roughness: 0.24,
      clearcoat: 0.2,
      envMapIntensity: 1.25,
    }),
  );

  // High-pressure copper fuel injection line
  const copperLine = track(
    new THREE.MeshStandardMaterial({
      color: 0xc87544,
      metalness: 0.9,
      roughness: 0.26,
      envMapIntensity: 1.3,
    }),
  );

  // Brass stuffing box packing nut & grease fittings
  const brassFitting = track(
    new THREE.MeshStandardMaterial({
      color: 0xd4a644,
      metalness: 0.88,
      roughness: 0.28,
      envMapIntensity: 1.25,
    }),
  );

  // Matte high-temp black exhaust muffler
  const exhaustMatteBlack = track(
    new THREE.MeshStandardMaterial({
      color: 0x191b1f,
      metalness: 0.35,
      roughness: 0.84,
      bumpMap: textures.castIronBump,
      bumpScale: 0.003,
      envMapIntensity: 0.7,
    }),
  );

  // Yellow/Black Dongfeng ZH1130 nameplate
  const nameplateMat = track(
    new THREE.MeshStandardMaterial({
      map: textures.nameplateMap,
      metalness: 0.45,
      roughness: 0.36,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  // Subtle internal 4-stroke combustion flash material
  const combustionGlow = track(
    new THREE.MeshBasicMaterial({
      color: 0xff7b1c,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );

  // Welded black C-channel skid frame
  const chassisBlackSteel = track(
    new THREE.MeshStandardMaterial({
      color: 0x1c2026,
      metalness: 0.55,
      roughness: 0.52,
      bumpMap: textures.castIronBump,
      bumpScale: 0.002,
      envMapIntensity: 1.0,
    }),
  );

  // Matte rubber pneumatic tires
  const tireRubber = track(
    new THREE.MeshStandardMaterial({
      color: 0x17181b,
      metalness: 0.04,
      roughness: 0.9,
      bumpMap: textures.tireTreadBump,
      bumpScale: 0.015,
      envMapIntensity: 0.45,
    }),
  );

  // Industrial steel wheel rims
  const wheelRimSteel = track(
    new THREE.MeshStandardMaterial({
      color: 0xb6bec8,
      metalness: 0.78,
      roughness: 0.34,
      envMapIntensity: 1.15,
    }),
  );

  // Galvanized zinc bolts & nuts
  const boltZinc = track(
    new THREE.MeshStandardMaterial({
      color: 0xbcc4ce,
      metalness: 0.85,
      roughness: 0.3,
      envMapIntensity: 1.2,
    }),
  );

  // 12-inch SNI Grey Industrial PVC AW Pump Pipe (semi-gloss extruded polymer)
  const pumpPipeSolid = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xe6ecf2,
      map: textures.pipeGalvanizedMap,
      roughnessMap: textures.pipeRoughness,
      metalness: 0.04,
      roughness: 0.33,
      clearcoat: isSoftwareGl ? 0.16 : 0.36,
      clearcoatRoughness: 0.28,
      side: THREE.DoubleSide,
      envMapIntensity: 0.90,
    }),
  );

  // Ghosted Fresnel X-Ray shader for the 12-inch pump pipe
  const pumpPipeXray = track(
    createFresnelXrayMaterial(0x1e3a5f, 0x38bdf8, 0.1),
  );

  // Steel band clamps
  const clampSteel = track(
    new THREE.MeshStandardMaterial({
      color: 0x2a3038,
      metalness: 0.72,
      roughness: 0.42,
      envMapIntensity: 1.1,
    }),
  );

  // Forged black Kopel (Universal Joint)
  const kopelBlackSteel = track(
    new THREE.MeshStandardMaterial({
      color: 0x181c22,
      metalness: 0.78,
      roughness: 0.34,
      envMapIntensity: 1.25,
    }),
  );

  // Pillow-block bearing housings (classic industrial cast slate-blue/green)
  const pillowBlockBlueGrey = track(
    new THREE.MeshStandardMaterial({
      color: 0x2e4552,
      metalness: 0.45,
      roughness: 0.56,
      bumpMap: textures.castIronBump,
      bumpScale: 0.004,
      envMapIntensity: 0.95,
    }),
  );

  // Animated twin rubber V-belts
  const vbeltRubber = track(
    new THREE.MeshStandardMaterial({
      map: textures.vbeltMap,
      color: 0xffffff,
      metalness: 0.06,
      roughness: 0.86,
      envMapIntensity: 0.4,
    }),
  );

  // Cast bronze / manganese-alloy 3-blade axial propeller
  const propellerCastBronze = track(
    new THREE.MeshPhysicalMaterial({
      color: 0xc99c52,
      metalness: 0.86,
      roughness: 0.28,
      clearcoat: 0.25,
      clearcoatRoughness: 0.35,
      envMapIntensity: 1.35,
    }),
  );

  // Corrugated blue PVC spiral discharge hose (Selang Buang) matching field photos
  const dischargeHoseBlue = track(
    new THREE.MeshStandardMaterial({
      color: 0x2674a8,
      metalness: 0.08,
      roughness: 0.44,
      side: THREE.DoubleSide,
      envMapIntensity: 0.75,
    }),
  );

  const dischargeHoseSpiral = track(
    new THREE.MeshStandardMaterial({
      color: 0xc8d8e6,
      metalness: 0.12,
      roughness: 0.36,
      envMapIntensity: 0.85,
    }),
  );

  // 12V 32Ah Flooded Battery & Starter Cables
  const batteryCaseDark = track(
    new THREE.MeshStandardMaterial({
      color: 0x1b2029,
      metalness: 0.08,
      roughness: 0.48,
      envMapIntensity: 0.65,
    }),
  );

  const batteryCapYellow = track(
    new THREE.MeshStandardMaterial({
      color: 0xeab308,
      metalness: 0.05,
      roughness: 0.38,
    }),
  );

  const cableRed = track(
    new THREE.MeshStandardMaterial({
      color: 0xb91c1c,
      metalness: 0.06,
      roughness: 0.68,
    }),
  );

  const cableBlack = track(
    new THREE.MeshStandardMaterial({
      color: 0x14161a,
      metalness: 0.06,
      roughness: 0.74,
    }),
  );

  // Dynamic foamy water-jet shader material
  const waterJetShader = track(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFlowSpeed: { value: 1.0 },
        uIntensity: { value: 0.7 },
        uFoamTex: { value: textures.waterFoamMap },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uFlowSpeed;
        uniform float uIntensity;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec3 pos = position;
          // Subtle hydrodynamic turbulence ripples growing along the arc (vUv.x = 0 at mouth -> 1 at impact)
          float turb = sin(uv.x * 24.0 - uTime * (8.0 + uFlowSpeed * 14.0) + uv.y * 12.566) * 0.014 * (0.2 + uv.x) * uIntensity;
          float turb2 = cos(uv.x * 38.0 - uTime * (12.0 + uFlowSpeed * 18.0) - uv.y * 18.84) * 0.009 * uv.x * uIntensity;
          pos += normal * (turb + turb2);
          vec4 worldPos = modelMatrix * vec4(pos, 1.0);
          vWorldPos = worldPos.xyz;
          vNormalWorld = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uFlowSpeed;
        uniform float uIntensity;
        uniform sampler2D uFoamTex;
        varying vec2 vUv;
        varying vec3 vNormalWorld;
        varying vec3 vWorldPos;
        void main() {
          vec2 uv1 = vec2(vUv.x * 2.4 - uTime * (1.2 + uFlowSpeed * 3.0), vUv.y * 2.0);
          vec2 uv2 = vec2(vUv.x * 4.0 - uTime * (1.8 + uFlowSpeed * 4.4), vUv.y * 3.0 + 0.35);
          vec3 tex1 = texture2D(uFoamTex, uv1).rgb;
          vec3 tex2 = texture2D(uFoamTex, uv2).rgb;
          float foamMask = smoothstep(0.52, 0.92, (tex1.r + tex2.r) * 0.55 + vUv.x * 0.22);

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - abs(dot(normalize(vNormalWorld), viewDir)), 2.0);

          vec3 deepWater = vec3(0.05, 0.48, 0.72);
          vec3 brightWater = vec3(0.35, 0.80, 0.96);
          vec3 foamWhite = vec3(0.94, 0.98, 1.0);

          vec3 col = mix(deepWater, brightWater, 0.4 + fresnel * 0.45);
          col = mix(col, foamWhite, clamp(foamMask * 0.88 + fresnel * 0.25, 0.0, 1.0));

          float endFade = 1.0 - smoothstep(0.84, 1.0, vUv.x);
          float alpha = clamp((0.56 + foamMask * 0.36 + fresnel * 0.16) * endFade * uIntensity, 0.0, 0.94);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  // Internal X-Ray axial helical water flow ribbon shader
  const internalFlowShader = track(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: 1.0 },
        uOpacity: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uSpeed;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          // Animated directional chevron pulses travelling from intake (+X, u=0) to discharge (-X, u=1)
          float pulse = fract(vUv.x * 9.0 - uTime * (0.9 + uSpeed * 2.8));
          float streak = smoothstep(0.0, 0.22, pulse) * (1.0 - smoothstep(0.55, 0.92, pulse));
          float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
          vec3 col = mix(vec3(0.12, 0.68, 0.96), vec3(0.85, 0.97, 1.0), streak);
          float alpha = streak * smoothstep(0.0, 0.35, edge) * uOpacity;
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );

  return {
    crimsonEnamel,
    crimsonCutawayGhost,
    castIronDark,
    castIronFlywheel,
    machinedSteel,
    pistonAlloy,
    copperLine,
    brassFitting,
    exhaustMatteBlack,
    nameplateMat,
    combustionGlow,
    chassisBlackSteel,
    tireRubber,
    wheelRimSteel,
    boltZinc,
    pumpPipeSolid,
    pumpPipeXray,
    clampSteel,
    kopelBlackSteel,
    pillowBlockBlueGrey,
    vbeltRubber,
    propellerCastBronze,
    dischargeHoseBlue,
    dischargeHoseSpiral,
    batteryCaseDark,
    batteryCapYellow,
    cableRed,
    cableBlack,
    waterJetShader,
    internalFlowShader,
    dispose: () => {
      disposables.forEach((m) => m.dispose());
    },
  };
}
