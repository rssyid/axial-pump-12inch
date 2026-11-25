import * as THREE from 'three';

export interface ProceduralTextureSet {
  castIronBump: THREE.CanvasTexture;
  castIronRoughness: THREE.CanvasTexture;
  brushedSteelMap: THREE.CanvasTexture;
  brushedSteelRoughness: THREE.CanvasTexture;
  pipeGalvanizedMap: THREE.CanvasTexture;
  pipeRoughness: THREE.CanvasTexture;
  tireTreadBump: THREE.CanvasTexture;
  vbeltMap: THREE.CanvasTexture;
  nameplateMap: THREE.CanvasTexture;
  waterFoamMap: THREE.CanvasTexture;
  particleSoftMap: THREE.CanvasTexture;
  studioFloorMap: THREE.CanvasTexture;
  fieldGroundMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

// Deterministic pseudo-random generator so procedural grain is crisp and consistent
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const created: THREE.CanvasTexture[] = [];

  const register = (
    canvas: HTMLCanvasElement,
    {
      isColor = false,
      repeatX = 1,
      repeatY = 1,
      wrap = THREE.RepeatWrapping,
    }: {
      isColor?: boolean;
      repeatX?: number;
      repeatY?: number;
      wrap?: THREE.Wrapping;
    } = {},
  ): THREE.CanvasTexture => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = wrap;
    tex.wrapT = wrap;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = Math.min(8, maxAnisotropy);
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    created.push(tex);
    return tex;
  };

  // 1. Cast Iron Sand-Cast Pebbled Bump & Roughness
  const [ciCanvas, ciCtx] = createCanvas(256, 256);
  const rand1 = mulberry32(1130);
  const imgData = ciCtx.createImageData(256, 256);
  for (let i = 0; i < imgData.data.length; i += 4) {
    const base = 115 + (rand1() - 0.5) * 65;
    imgData.data[i] = base;
    imgData.data[i + 1] = base;
    imgData.data[i + 2] = base;
    imgData.data[i + 3] = 255;
  }
  ciCtx.putImageData(imgData, 0, 0);
  // Subtle sand-casting pits
  for (let i = 0; i < 420; i++) {
    const x = rand1() * 256;
    const y = rand1() * 256;
    const r = 0.8 + rand1() * 2.2;
    const shade = Math.floor(85 + rand1() * 85);
    ciCtx.fillStyle = `rgba(${shade},${shade},${shade},0.35)`;
    ciCtx.beginPath();
    ciCtx.arc(x, y, r, 0, Math.PI * 2);
    ciCtx.fill();
  }
  const castIronBump = register(ciCanvas, { repeatX: 4, repeatY: 4 });

  const [ciRCanvas, ciRCtx] = createCanvas(256, 256);
  ciRCtx.fillStyle = '#9c9c9c';
  ciRCtx.fillRect(0, 0, 256, 256);
  ciRCtx.globalAlpha = 0.45;
  ciRCtx.drawImage(ciCanvas, 0, 0);
  const castIronRoughness = register(ciRCanvas, { repeatX: 4, repeatY: 4 });

  // 2. Brushed Machined Steel (Lathe-turned micro streaks)
  const [bsCanvas, bsCtx] = createCanvas(256, 256);
  const rand2 = mulberry32(2200);
  bsCtx.fillStyle = '#d4d8de';
  bsCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const v = Math.floor(190 + (rand2() - 0.5) * 44);
    bsCtx.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    bsCtx.fillRect(0, y, 256, 1);
  }
  for (let i = 0; i < 160; i++) {
    const y = rand2() * 256;
    bsCtx.fillStyle = rand2() > 0.5 ? 'rgba(255,255,255,0.22)' : 'rgba(90,98,108,0.22)';
    bsCtx.fillRect(0, y, 256, 1 + rand2() * 1.5);
  }
  const brushedSteelMap = register(bsCanvas, { isColor: true, repeatX: 2, repeatY: 4 });

  const [bsRCanvas, bsRCtx] = createCanvas(256, 256);
  bsRCtx.fillStyle = '#484848';
  bsRCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y++) {
    const v = Math.floor(55 + rand2() * 55);
    bsRCtx.fillStyle = `rgb(${v},${v},${v})`;
    bsRCtx.fillRect(0, y, 256, 1);
  }
  const brushedSteelRoughness = register(bsRCanvas, { repeatX: 2, repeatY: 4 });

  // 3. Authentic SNI PVC AW 12-Inch Grey Pipe Texture (medium-light industrial PVC grey)
  const [pCanvas, pCtx] = createCanvas(512, 256);
  const rand3 = mulberry32(300);
  pCtx.fillStyle = '#929ca6';
  pCtx.fillRect(0, 0, 512, 256);
  // Subtle longitudinal PVC extrusion sheen streaks
  for (let y = 0; y < 256; y += 2) {
    const delta = Math.floor((rand3() - 0.5) * 9);
    const r = 144 + delta;
    const g = 154 + delta;
    const b = 164 + delta;
    pCtx.fillStyle = `rgb(${r},${g},${b})`;
    pCtx.fillRect(0, y, 512, 2);
  }
  // Subtle field handling marks & dust variation (keeps grey PVC natural & realistic)
  for (let i = 0; i < 200; i++) {
    const x = rand3() * 512;
    const y = rand3() * 256;
    const w = 12 + rand3() * 48;
    const h = 1 + rand3() * 3;
    const light = rand3() > 0.45;
    pCtx.fillStyle = light
      ? `rgba(190, 198, 206, ${0.07 + rand3() * 0.09})`
      : `rgba(92, 100, 110, ${0.08 + rand3() * 0.10})`;
    pCtx.fillRect(x, y, w, h);
  }
  // Authentic faint dark-navy ink-jet SNI PVC AW specification stencil along pipe side
  pCtx.fillStyle = 'rgba(28, 44, 64, 0.42)';
  pCtx.font = 'bold 12px monospace';
  pCtx.fillText('PVC AW 12" · Ø300mm · SNI · PN10 · AXIAL PUMP', 18, 132);
  pCtx.fillText('PVC AW 12" · Ø300mm · SNI · PN10 · AXIAL PUMP', 330, 132);
  const pipeGalvanizedMap = register(pCanvas, { isColor: true, repeatX: 3, repeatY: 1 });

  // Smooth semi-gloss extruded polymer roughness map for SNI Grey PVC AW
  const [pRCanvas, pRCtx] = createCanvas(256, 256);
  pRCtx.fillStyle = '#565656';
  pRCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const v = Math.floor(72 + rand3() * 46);
    pRCtx.fillStyle = `rgba(${v},${v},${v},0.30)`;
    pRCtx.fillRect(rand3() * 256, rand3() * 256, 18 + rand3() * 36, 2 + rand3() * 4);
  }
  const pipeRoughness = register(pRCanvas, { repeatX: 3, repeatY: 2 });

  // 4. Pneumatic Rubber Tire Tread Bump Map
  const [tCanvas, tCtx] = createCanvas(256, 256);
  tCtx.fillStyle = '#202020';
  tCtx.fillRect(0, 0, 256, 256);
  tCtx.fillStyle = '#e5e5e5';
  const rows = 8;
  const rowH = 256 / rows;
  for (let i = 0; i < rows; i++) {
    const y = i * rowH;
    // Chevron agricultural lug bars
    tCtx.beginPath();
    tCtx.moveTo(16, y + 4);
    tCtx.lineTo(118, y + rowH * 0.52);
    tCtx.lineTo(118, y + rowH * 0.85);
    tCtx.lineTo(16, y + rowH * 0.36);
    tCtx.closePath();
    tCtx.fill();

    tCtx.beginPath();
    tCtx.moveTo(240, y + 4 + rowH * 0.5);
    tCtx.lineTo(138, y + rowH * 0.98);
    tCtx.lineTo(138, y + rowH * 0.65);
    tCtx.lineTo(240, y + rowH * 0.18);
    tCtx.closePath();
    tCtx.fill();
  }
  const tireTreadBump = register(tCanvas, { repeatX: 1, repeatY: 4 });

  // 5. Animated V-Belt Ribbed Rubber Texture (clearly reveals belt velocity!)
  const [vbCanvas, vbCtx] = createCanvas(256, 64);
  vbCtx.fillStyle = '#181a1f';
  vbCtx.fillRect(0, 0, 256, 64);
  for (let x = 0; x < 256; x += 16) {
    vbCtx.fillStyle = '#252930';
    vbCtx.fillRect(x, 0, 8, 64);
    vbCtx.fillStyle = '#101216';
    vbCtx.fillRect(x + 8, 0, 3, 64);
  }
  // Subtle industrial yellow stencil stripe on V-belt so motion is super legible
  vbCtx.fillStyle = '#d49a2a';
  vbCtx.fillRect(28, 22, 46, 5);
  vbCtx.fillStyle = '#cbd5e1';
  vbCtx.font = 'bold 11px monospace';
  vbCtx.fillText('B-78 IND', 86, 30);
  vbCtx.fillStyle = '#d49a2a';
  vbCtx.fillRect(168, 22, 24, 5);
  const vbeltMap = register(vbCanvas, { isColor: true, repeatX: 3, repeatY: 1 });

  // 6. Yellow/Black Industrial Dongfeng ZH1130 Nameplate Badge
  const [npCanvas, npCtx] = createCanvas(512, 256);
  npCtx.fillStyle = '#111317';
  npCtx.fillRect(0, 0, 512, 256);
  // Industrial amber border
  npCtx.strokeStyle = '#eab308';
  npCtx.lineWidth = 10;
  npCtx.strokeRect(10, 10, 492, 236);
  // Header banner
  npCtx.fillStyle = '#eab308';
  npCtx.fillRect(18, 18, 476, 70);
  npCtx.fillStyle = '#0f1115';
  npCtx.font = 'bold 42px sans-serif';
  npCtx.textAlign = 'center';
  npCtx.fillText('DONGFENG  ZH1130', 256, 68);
  // Spec grid
  npCtx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
  npCtx.lineWidth = 2;
  npCtx.strokeRect(24, 98, 464, 134);
  npCtx.beginPath();
  npCtx.moveTo(256, 98);
  npCtx.lineTo(256, 232);
  npCtx.moveTo(24, 144);
  npCtx.lineTo(488, 144);
  npCtx.moveTo(24, 188);
  npCtx.lineTo(488, 188);
  npCtx.stroke();

  npCtx.fillStyle = '#facc15';
  npCtx.font = 'bold 20px monospace';
  npCtx.textAlign = 'left';
  npCtx.fillText('POWER:  30 HP / 22 kW', 38, 128);
  npCtx.fillText('SPEED:  2200 RPM', 272, 128);
  npCtx.fillText('BORE×STR: 130×120 mm', 38, 173);
  npCtx.fillText('DISPL:  1.593 L', 272, 173);
  npCtx.fillStyle = '#e2e8f0';
  npCtx.font = 'bold 17px monospace';
  npCtx.fillText('TYPE: 1-CYL HORIZONTAL', 38, 216);
  npCtx.fillText('PUMP: 12" AXIAL KOPEL', 272, 216);

  // Corner rivet circles
  npCtx.fillStyle = '#94a3b8';
  for (const [rx, ry] of [
    [24, 24],
    [488, 24],
    [24, 232],
    [488, 232],
  ]) {
    npCtx.beginPath();
    npCtx.arc(rx, ry, 5, 0, Math.PI * 2);
    npCtx.fill();
  }
  const nameplateMap = register(npCanvas, {
    isColor: true,
    wrap: THREE.ClampToEdgeWrapping,
  });

  // 7. Animated Turbulent Water Foam Streak Texture
  const [wfCanvas, wfCtx] = createCanvas(256, 256);
  const rand4 = mulberry32(991);
  const grad = wfCtx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#0ea5e9');
  grad.addColorStop(0.5, '#38bdf8');
  grad.addColorStop(1, '#0284c7');
  wfCtx.fillStyle = grad;
  wfCtx.fillRect(0, 0, 256, 256);
  // Longitudinal white foam streaks
  for (let i = 0; i < 140; i++) {
    const x = rand4() * 256;
    const y = rand4() * 256;
    const len = 28 + rand4() * 90;
    const th = 2 + rand4() * 7;
    wfCtx.fillStyle = `rgba(240, 249, 255, ${0.15 + rand4() * 0.48})`;
    wfCtx.fillRect(x, y, len, th);
    if (x + len > 256) {
      wfCtx.fillRect(x - 256, y, len, th);
    }
  }
  const waterFoamMap = register(wfCanvas, { isColor: true, repeatX: 2, repeatY: 2 });

  // 8. Soft Radial Particle Texture (for spray droplets, splash foam & exhaust puffs)
  const [ptCanvas, ptCtx] = createCanvas(64, 64);
  const ptGrad = ptCtx.createRadialGradient(32, 32, 2, 32, 32, 30);
  ptGrad.addColorStop(0, 'rgba(255,255,255,1.0)');
  ptGrad.addColorStop(0.45, 'rgba(240,248,255,0.75)');
  ptGrad.addColorStop(1, 'rgba(255,255,255,0.0)');
  ptCtx.fillStyle = ptGrad;
  ptCtx.fillRect(0, 0, 64, 64);
  const particleSoftMap = register(ptCanvas, {
    isColor: true,
    wrap: THREE.ClampToEdgeWrapping,
  });

  // 9. Studio Polished Industrial Concrete Floor Texture
  const [sfCanvas, sfCtx] = createCanvas(512, 512);
  const rand5 = mulberry32(404);
  sfCtx.fillStyle = '#151921';
  sfCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1600; i++) {
    const shade = Math.floor(17 + rand5() * 14);
    sfCtx.fillStyle = `rgba(${shade},${shade + 3},${shade + 7},0.35)`;
    sfCtx.fillRect(rand5() * 512, rand5() * 512, 6 + rand5() * 24, 6 + rand5() * 24);
  }
  // Faint architectural expansion grid lines
  sfCtx.strokeStyle = 'rgba(255,255,255,0.045)';
  sfCtx.lineWidth = 1.5;
  sfCtx.strokeRect(1, 1, 510, 510);
  sfCtx.beginPath();
  sfCtx.moveTo(256, 0);
  sfCtx.lineTo(256, 512);
  sfCtx.moveTo(0, 256);
  sfCtx.lineTo(512, 256);
  sfCtx.stroke();
  const studioFloorMap = register(sfCanvas, { isColor: true, repeatX: 14, repeatY: 14 });

  // 10. Outdoor Field Test Compacted Earth & Gravel Texture
  const [fgCanvas, fgCtx] = createCanvas(512, 512);
  const rand6 = mulberry32(777);
  fgCtx.fillStyle = '#7e7463';
  fgCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3200; i++) {
    const x = rand6() * 512;
    const y = rand6() * 512;
    const s = 2 + rand6() * 9;
    const r = Math.floor(108 + (rand6() - 0.5) * 42);
    const g = Math.floor(100 + (rand6() - 0.5) * 38);
    const b = Math.floor(84 + (rand6() - 0.5) * 30);
    fgCtx.fillStyle = `rgba(${r},${g},${b},0.48)`;
    fgCtx.fillRect(x, y, s, s * (0.7 + rand6() * 0.6));
  }
  // Subtle dry grass/earth patches
  for (let i = 0; i < 350; i++) {
    fgCtx.fillStyle = `rgba(98, 108, 72, ${0.12 + rand6() * 0.16})`;
    fgCtx.beginPath();
    fgCtx.arc(rand6() * 512, rand6() * 512, 4 + rand6() * 14, 0, Math.PI * 2);
    fgCtx.fill();
  }
  const fieldGroundMap = register(fgCanvas, { isColor: true, repeatX: 18, repeatY: 18 });

  // 11. Soft Radial Contact Shadow Map
  const [csCanvas, csCtx] = createCanvas(256, 256);
  const csGrad = csCtx.createRadialGradient(128, 128, 16, 128, 128, 124);
  csGrad.addColorStop(0, 'rgba(0,0,0,0.78)');
  csGrad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
  csGrad.addColorStop(1, 'rgba(0,0,0,0.0)');
  csCtx.fillStyle = csGrad;
  csCtx.fillRect(0, 0, 256, 256);
  const contactShadowMap = register(csCanvas, {
    wrap: THREE.ClampToEdgeWrapping,
  });

  return {
    castIronBump,
    castIronRoughness,
    brushedSteelMap,
    brushedSteelRoughness,
    pipeGalvanizedMap,
    pipeRoughness,
    tireTreadBump,
    vbeltMap,
    nameplateMap,
    waterFoamMap,
    particleSoftMap,
    studioFloorMap,
    fieldGroundMap,
    contactShadowMap,
    dispose: () => {
      created.forEach((t) => t.dispose());
    },
  };
}
