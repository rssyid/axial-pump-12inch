import { Language, LocalizedText } from './i18n';

export type { Language, LocalizedText };

export type StageMode = 'tanggul' | 'studio' | 'field';

export type TimeOfDay = 'day' | 'dusk' | 'night';

export type CavitationState = 'safe' | 'warning' | 'critical';

export type RightDrawerMode = 'none' | 'bom' | 'calculator';

export type CameraPresetId =
  | 'overview'
  | 'flywheel'
  | 'kopel'
  | 'propeller'
  | 'discharge';

export type HotspotId =
  | 'engine'
  | 'vbelt'
  | 'kopel'
  | 'discharge'
  | 'propeller';

export type CadDimensionId =
  | 'horiz_1m'
  | 'inclined_5m'
  | 'slope_18deg'
  | 'gland_1m'
  | 'pipe_dia'
  | 'lift_height';

export interface ShowcaseConfig {
  language: Language;
  targetRpm: number;
  stageMode: StageMode;
  timeOfDay: TimeOfDay;
  canalWaterY: number; // -1.10 m (dry/critical) .. -0.20 m (high flood), default -0.58 m
  cadDimensionsVisible: boolean;
  beltGuardVisible: boolean;
  xrayEnabled: boolean;
  explodedAmount: number; // 0..1
  waterFlowEnabled: boolean;
  dischargeHoseAttached: boolean;
  calloutsVisible: boolean;
  audioMuted: boolean;
}

export interface TelemetryData {
  engineRpm: number;
  propellerRpm: number;
  flowLps: number;
  flowM3h: number;
  loadHp: number;
  torqueNm: number;
  fuelLph: number;
  staticHeadM: number;
  submergenceCm: number;
  cavitationState: CavitationState;
  cavitationEfficiency: number;
}

export interface HotspotDefinition {
  id: HotspotId;
  shortLabel: LocalizedText;
  title: LocalizedText;
  subtitle: LocalizedText;
  cameraPreset: CameraPresetId;
  specs: Array<{ label: LocalizedText; value: LocalizedText }>;
  description: LocalizedText;
}

export interface ProjectedHotspot {
  id: HotspotId;
  x: number;
  y: number;
  visible: boolean;
}

export interface ProjectedDimension {
  id: CadDimensionId;
  label: string;
  sublabel?: string;
  x: number;
  y: number;
  visible: boolean;
  accent: 'amber' | 'cyan';
}

export interface FloodCalcInput {
  areaValue: number;
  areaUnit: 'ha' | 'm2';
  depthCm: number;
  dieselPriceIdr: number;
  pumpUnits: number;
}

export interface FloodCalcResult {
  volumeM3: number;
  effectiveFlowM3h: number;
  hoursRequired: number | null;
  totalFuelLiters: number | null;
  tankRefills14L: number | null;
  totalFuelCostIdr: number | null;
  costPerM3Idr: number | null;
}

export interface CameraPresetConfig {
  id: CameraPresetId;
  label: LocalizedText;
  position: [number, number, number];
  target: [number, number, number];
  autoXray?: boolean;
}

export interface BomPartItem {
  id: string;
  code: string;
  name: LocalizedText;
  qty: number;
  note: LocalizedText;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  autoXray?: boolean;
  autoHose?: boolean;
}

export interface BomSection {
  code: string;
  title: LocalizedText;
  sectionQty?: number;
  items: BomPartItem[];
}

// Exact BOM match: Engine Pulley B3 x 5" -> Pump Pulley B3 x 5" (1:1 ratio)
export const PULLEY_RATIO = 1.0;

// Impeller center Y & discharge mouth Y matching src/three/dimensions.ts
const IMPELLER_CENTER_Y = -0.857;
const DISCHARGE_OUTLET_Y = 0.62;
const DEFAULT_CANAL_Y = -0.58;

export function computeTelemetry(
  engineRpm: number,
  waterFlowEnabled: boolean,
  canalWaterY = DEFAULT_CANAL_Y,
  stageMode: StageMode = 'tanggul',
): TelemetryData {
  const clampedRpm = Math.max(0, Math.min(2200, engineRpm));
  const propellerRpm = clampedRpm / PULLEY_RATIO;

  // Hydraulic submergence & static head lift
  const effectiveCanalY = stageMode === 'tanggul' ? canalWaterY : DEFAULT_CANAL_Y;
  const staticHeadM = Math.max(0.45, DISCHARGE_OUTLET_Y - effectiveCanalY);
  const submergenceCm = (effectiveCanalY - IMPELLER_CENTER_Y) * 100;

  let cavitationState: CavitationState = 'safe';
  let cavitationEfficiency = 1.0;

  if (stageMode === 'tanggul') {
    if (submergenceCm < 5) {
      cavitationState = 'critical';
      // Below -0.92m intake loses prime completely (air-lock); slight sputtering between -0.92 and -0.81
      cavitationEfficiency = Math.max(0, (submergenceCm + 7) / 12) * 0.48;
    } else if (submergenceCm < 25) {
      cavitationState = 'warning';
      const t = (submergenceCm - 5) / 20;
      cavitationEfficiency = 0.56 + t * 0.40;
    }
  }

  if (clampedRpm < 10) {
    return {
      engineRpm: 0,
      propellerRpm: 0,
      flowLps: 0,
      flowM3h: 0,
      loadHp: 0,
      torqueNm: 0,
      fuelLph: 0,
      staticHeadM,
      submergenceCm,
      cavitationState,
      cavitationEfficiency,
    };
  }

  // Hydraulic affinity laws for fixed 6m (1m horiz + 5m @ 18 deg) 12-inch PVC axial flow pump
  const lengthEfficiency = 0.955;
  const lengthFrictionLoad = 1.04;
  // Higher static lift slightly reduces axial discharge; high flood water slightly boosts discharge
  const headFactor = Math.max(0.76, Math.min(1.09, 1.0 - (staticHeadM - 1.2) * 0.19));

  const normalizedRpm = clampedRpm / 2200;
  const effectiveFlowFactor =
    waterFlowEnabled && clampedRpm > 320
      ? Math.max(0, (clampedRpm - 320) / (2200 - 320))
      : 0;

  // Peak ~216 L/s (~777 m3/hr) at 2200 RPM at nominal levee lift & safe submergence
  const flowLps =
    226.0 * effectiveFlowFactor * lengthEfficiency * headFactor * cavitationEfficiency;
  const flowM3h = flowLps * 3.6;

  // Parasitic friction + cubic hydraulic load curve (unloads partially when cavitating / running dry)
  const idleFrictionHp = 1.15 * normalizedRpm;
  const waterLoadFactor = 0.22 + 0.78 * cavitationEfficiency;
  const hydraulicHp = waterFlowEnabled
    ? 28.2 * Math.pow(normalizedRpm, 3) * lengthFrictionLoad * waterLoadFactor
    : 2.2 * Math.pow(normalizedRpm, 2);
  const loadHp = Math.min(33.0, idleFrictionHp + hydraulicHp);

  // Torque (N*m) = (Power_kW * 9549) / RPM
  const powerKw = loadHp * 0.7457;
  const torqueNm = clampedRpm > 40 ? (powerKw * 9549) / clampedRpm : 0;

  // Dongfeng ZH1130 30 HP diesel fuel consumption (L/hr):
  // Idle burn (~0.42 L/hr at 800 RPM) + BSFC (~248 g/kW·h, diesel density 0.84 kg/L) -> ~6.4 L/hr at full load
  const idleBurnLph = 0.16 + 0.58 * normalizedRpm;
  const loadBurnLph = (powerKw * 0.248) / 0.84;
  const fuelLph = Math.min(7.2, idleBurnLph + loadBurnLph * 0.88);

  return {
    engineRpm: clampedRpm,
    propellerRpm,
    flowLps,
    flowM3h,
    loadHp,
    torqueNm,
    fuelLph,
    staticHeadM,
    submergenceCm,
    cavitationState,
    cavitationEfficiency,
  };
}

export function computeFloodDrainage(
  input: FloodCalcInput,
  telemetry: TelemetryData,
): FloodCalcResult {
  const areaM2 =
    input.areaUnit === 'ha'
      ? Math.max(0, input.areaValue) * 10000
      : Math.max(0, input.areaValue);
  const volumeM3 = areaM2 * (Math.max(0, input.depthCm) / 100);
  const units = Math.max(1, Math.min(10, Math.round(input.pumpUnits)));
  const effectiveFlowM3h = telemetry.flowM3h * units;

  if (effectiveFlowM3h < 5 || volumeM3 <= 0) {
    return {
      volumeM3,
      effectiveFlowM3h,
      hoursRequired: null,
      totalFuelLiters: null,
      tankRefills14L: null,
      totalFuelCostIdr: null,
      costPerM3Idr: null,
    };
  }

  const hoursRequired = volumeM3 / effectiveFlowM3h;
  const totalFuelLiters = hoursRequired * telemetry.fuelLph * units;
  const tankRefills14L = totalFuelLiters / 14.0; // Dongfeng ZH1130 14L diesel tank capacity
  const totalFuelCostIdr = totalFuelLiters * Math.max(0, input.dieselPriceIdr);
  const costPerM3Idr = totalFuelCostIdr / volumeM3;

  return {
    volumeM3,
    effectiveFlowM3h,
    hoursRequired,
    totalFuelLiters,
    tankRefills14L,
    totalFuelCostIdr,
    costPerM3Idr,
  };
}

export const CAMERA_PRESETS: Record<CameraPresetId, CameraPresetConfig> = {
  overview: {
    id: 'overview',
    label: { id: 'Utama', en: 'Overview' },
    position: [-4.55, 2.95, 6.45],
    target: [0.45, 0.18, 0.28],
  },
  flywheel: {
    id: 'flywheel',
    label: { id: 'Flywheel & Belt', en: 'Flywheel & Belt' },
    position: [-2.55, 1.05, 0.22],
    target: [-0.90, 0.91, 0.06],
  },
  kopel: {
    id: 'kopel',
    label: { id: 'Kopel / Siku 18°', en: 'Kopel / 18° Elbow' },
    position: [-0.20, 1.48, 1.95],
    target: [-0.05, 0.66, 0.38],
  },
  propeller: {
    id: 'propeller',
    label: { id: 'X-Ray Impeller', en: 'Impeller X-Ray' },
    position: [5.45, 0.45, 2.15],
    target: [4.08, -0.84, 0.38],
    autoXray: true,
  },
  discharge: {
    id: 'discharge',
    label: { id: 'Aliran Buang', en: 'Discharge' },
    position: [-6.15, 1.45, 4.15],
    target: [-3.15, -0.52, 0.38],
  },
};

export const HOTSPOTS: Record<HotspotId, HotspotDefinition> = {
  engine: {
    id: 'engine',
    shortLabel: { id: 'Diesel ZH1130', en: 'ZH1130 Diesel' },
    title: {
      id: 'Mesin Diesel Dongfeng ZH1130',
      en: 'Dongfeng ZH1130 Diesel Engine',
    },
    subtitle: {
      id: '1-Silinder Horizontal · Starter Elektrik 12V',
      en: 'Single-Cylinder Horizontal · 12V Electric Start',
    },
    cameraPreset: 'overview',
    specs: [
      {
        label: { id: 'Daya Maks.', en: 'Rated Output' },
        value: { id: '30 HP (22 kW) @ 2200 RPM', en: '30 HP (22 kW) @ 2200 RPM' },
      },
      {
        label: { id: 'Diameter × Langkah', en: 'Bore × Stroke' },
        value: { id: '130 × 120 mm (1,593 L)', en: '130 × 120 mm (1.593 L)' },
      },
      {
        label: { id: 'Sistem Starter', en: 'Starter System' },
        value: { id: 'OTOR 12V + Aki 32Ah', en: '12V OTOR + 32Ah Battery' },
      },
      {
        label: { id: 'Pulley Mesin', en: 'Engine Pulley' },
        value: { id: 'B3 × 5" (3 Alur)', en: 'B3 × 5" (3-Groove)' },
      },
    ],
    description: {
      id: 'Mesin diesel 1-silinder 30 HP di atas rangka baja puncak tanggul. Dilengkapi dinamo starter OTOR 12V, ring gear flywheel, aki 32Ah, dan tangki solar 14 L.',
      en: '30 HP single-cylinder horizontal diesel mounted on the levee-crest steel frame. Fitted with a 12V OTOR starter, flywheel ring gear, 32Ah battery, and 14 L fuel tank.',
    },
  },
  vbelt: {
    id: 'vbelt',
    shortLabel: { id: 'V-Belt B-69 (×3)', en: 'Triple V-Belt B-69' },
    title: {
      id: 'Transmisi 3× V-Belt B-69',
      en: 'Triple V-Belt B-69 Drive',
    },
    subtitle: {
      id: 'Pulley Sejajar B3 × 5" · Rasio 1:1',
      en: 'Level Twin Pulleys B3 × 5" · 1:1 Ratio',
    },
    cameraPreset: 'flywheel',
    specs: [
      {
        label: { id: 'Tipe Belt', en: 'V-Belt Spec' },
        value: { id: '3 × V-Belt B-69', en: '3 × B-69 Rubber V-Belt' },
      },
      {
        label: { id: 'Pulley', en: 'Pulleys' },
        value: { id: 'B3 × 5" Mesin & Pompa (1:1)', en: 'B3 × 5" Engine & Pump (1:1)' },
      },
      {
        label: { id: 'Bearing', en: 'Bearings' },
        value: { id: '5 × Pillow Block UCP-205', en: '5 × UCP-205 Pillow Block' },
      },
      {
        label: { id: 'Kelurusan', en: 'Alignment' },
        value: { id: '0° Datar Sejajar', en: '0° Level Horizontal' },
      },
    ],
    description: {
      id: 'Tiga V-belt B-69 sejajar datar menghubungkan pulley B3 × 5" pada flywheel ke poros countershaft pompa 40 cm tanpa reduksi putaran.',
      en: 'Three parallel B-69 V-belts run level between matched B3 × 5" pulleys on the flywheel and 40 cm pump countershaft at a 1:1 speed ratio.',
    },
  },
  kopel: {
    id: 'kopel',
    shortLabel: { id: 'Kopel & Siku 18°', en: 'Kopel & 18° Elbow' },
    title: {
      id: 'Kopel 18° & Poros Masuk 1 m Impeller',
      en: '18° Kopel & 1 m Impeller Shaft Entry',
    },
    subtitle: {
      id: 'Poros Luar Sejajar 18° · Flens Siku 12-Baut',
      en: 'Parallel External 18° Shaft · 12-Bolt Steel Flange',
    },
    cameraPreset: 'kopel',
    specs: [
      {
        label: { id: 'Material Pipa', en: 'Pipe Material' },
        value: { id: 'PVC AW 12" Abu SNI (1m + 5m)', en: 'SNI Grey 12" PVC AW (1m + 5m)' },
      },
      {
        label: { id: 'Sambungan Siku', en: 'Elbow Joint' },
        value: { id: 'Flens Baja 12-Baut + Gasket', en: '12-Bolt Steel Flange + Gasket' },
      },
      {
        label: { id: 'Jalur Poros', en: 'Shaft Routing' },
        value: { id: 'Luar Pipa → Gland 1 m Impeller', en: 'External → 1 m Gland Entry' },
      },
      {
        label: { id: 'Bearing', en: 'Bearings' },
        value: { id: '5 × Pillow Block UCP-205', en: '5 × UCP-205 Pillow Block' },
      },
    ],
    description: {
      id: 'Poros stainless 400 cm berjalan sejajar di atas pipa PVC 12" melewati 3 pillow block UCP-205, lalu menukik masuk via gland seal 1 m sebelum impeller. Siku 18° diperkuat flens baja 12-baut.',
      en: 'A 400 cm stainless shaft runs above the 12" PVC column on three UCP-205 pillow blocks, entering through a gland seal 1 m ahead of the impeller. The 18° miter joint uses a 12-bolt steel backing flange.',
    },
  },
  discharge: {
    id: 'discharge',
    shortLabel: { id: 'Outlet 1 m & Selang', en: '1 m Outlet & Hose' },
    title: {
      id: 'Pipa Buang 100 cm & Selang Spiral',
      en: '100 cm PVC Outlet & Discharge Hose',
    },
    subtitle: {
      id: 'Mulut PVC AW Ø 300 mm · Sadel U-Bolt Depan',
      en: '300 mm SNI PVC AW Spout · Front U-Bolt Saddle',
    },
    cameraPreset: 'discharge',
    specs: [
      {
        label: { id: 'Pipa Datar', en: 'Horizontal Run' },
        value: { id: '100 cm (1,0 m) PVC AW Abu', en: '100 cm (1.0 m) Grey PVC AW' },
      },
      {
        label: { id: 'Diameter Nominal', en: 'Nominal Bore' },
        value: { id: '300 mm (12 Inci / 12 Dim)', en: '300 mm (12 Inch)' },
      },
      {
        label: { id: 'Debit Puncak', en: 'Peak Capacity' },
        value: { id: 'Hingga 216 L/s (777 m³/jam)', en: 'Up to 216 L/s (777 m³/hr)' },
      },
      {
        label: { id: 'Selang Buang', en: 'Discharge Hose' },
        value: { id: 'Spiral Biru Lepas-Pasang', en: 'Detachable Blue Spiral Hose' },
      },
    ],
    description: {
      id: 'Pipa datar 100 cm terjepit dua sadel U-bolt baja di rangka depan. Ujung outlet terhubung ke selang spiral biru menuju sungai.',
      en: 'The 100 cm horizontal PVC outlet clamps onto twin front steel U-bolt saddles and connects to a detachable blue spiral hose discharging down the levee.',
    },
  },
  propeller: {
    id: 'propeller',
    shortLabel: { id: 'Impeller & A-Frame', en: 'Impeller & A-Frame' },
    title: {
      id: 'Impeller, Saringan & A-Frame Kanal',
      en: 'Impeller, Strainer & Canal A-Frame',
    },
    subtitle: {
      id: 'Kolom 500 cm (18°) · Penyangga A-Frame Baja',
      en: '500 cm (18°) Column · Steel A-Frame Support',
    },
    cameraPreset: 'propeller',
    specs: [
      {
        label: { id: 'Panjang Kolom', en: 'Column Length' },
        value: { id: '500 cm PVC AW Abu @ 18,0°', en: '500 cm Grey PVC AW @ 18.0°' },
      },
      {
        label: { id: 'Penyangga Pipa', en: 'Pipe Support' },
        value: { id: 'Tiang A-Frame Baja Kanal', en: 'Steel Canal A-Frame Stand' },
      },
      {
        label: { id: 'Diameter Impeller', en: 'Impeller Dia.' },
        value: { id: '282 mm (3 Sudu Lebar)', en: '282 mm (3 Wide Blades)' },
      },
      {
        label: { id: 'Saringan Hisap', en: 'Intake Guard' },
        value: { id: 'Keranjang Jeruji Baja', en: 'Welded Steel Bar Strainer' },
      },
    ],
    description: {
      id: 'Pipa PVC 500 cm miring 18° ditopang A-frame baja di tepi kanal agar tidak melendut. Gland poros masuk 1 m di hulu impeller aksial 3-sudu berpelindung saringan baja.',
      en: 'The 500 cm PVC column plunges at 18°, braced mid-span by a steel A-frame stand. The shaft enters via a sealed gland 1 m above the 3-blade axial impeller and bar strainer.',
    },
  },
};

export const BOM_SECTIONS: BomSection[] = [
  {
    code: 'A',
    title: { id: 'RUMAH POMPA', en: 'PUMP HOUSING & FRAME' },
    sectionQty: 1,
    items: [
      {
        id: 'rumah-pompa',
        code: 'A',
        name: {
          id: 'Rumah Pompa (Rangka Atas & Klem Sadel)',
          en: 'Pump Housing (Upper Frame & Saddle Clamps)',
        },
        qty: 1,
        note: {
          id: 'Rangka dudukan bearing atas, klem siku 18°, dan bracing A-frame.',
          en: 'Upper bearing frame, 18° elbow clamps, and A-frame braces.',
        },
        cameraPos: [-0.35, 1.52, 2.05],
        cameraTarget: [-0.15, 0.72, 0.38],
      },
    ],
  },
  {
    code: 'B',
    title: { id: 'MESIN (Dongfeng ZH1130)', en: 'ENGINE (Dongfeng ZH1130)' },
    sectionQty: 1,
    items: [
      {
        id: 'b-accu',
        code: 'B.1',
        name: {
          id: 'Aki Basah 12V 32Ah (32B20R-NS4)',
          en: 'Flooded Battery 12V 32Ah (32B20R-NS4)',
        },
        qty: 1,
        note: {
          id: 'Aki starter 12V di rak samping lengkap dengan kabel massa & positif.',
          en: '12V starter battery on side tray with starter cables.',
        },
        cameraPos: [0.68, 1.15, -1.38],
        cameraTarget: [-0.04, 0.62, -0.44],
      },
      {
        id: 'b-starter',
        code: 'B.2',
        name: {
          id: 'Motor Starter OTOR 12 Volt',
          en: '12V OTOR Electric Starter Motor',
        },
        qty: 1,
        note: {
          id: 'Dinamo starter 12V + solenoid penggerak ring gear flywheel.',
          en: '12V starter motor and solenoid driving flywheel ring gear.',
        },
        cameraPos: [-1.45, 1.08, -1.28],
        cameraTarget: [-0.62, 0.80, -0.48],
      },
      {
        id: 'b-exhaust',
        code: 'B.3',
        name: {
          id: 'Pipa Knalpot Diesel',
          en: 'Diesel Exhaust Stack',
        },
        qty: 1,
        note: {
          id: 'Knalpot vertikal berperedam dengan tutup hujan engsel.',
          en: 'Vertical baffled muffler stack with hinged rain cap.',
        },
        cameraPos: [-1.55, 1.88, -1.68],
        cameraTarget: [-0.70, 1.48, -0.90],
      },
      {
        id: 'b-intake',
        code: 'B.4',
        name: {
          id: 'Pipa Siku & Filter Udara',
          en: 'Intake Elbow & Air Cleaner',
        },
        qty: 1,
        note: {
          id: 'Siku hisap udara dengan tabung saringan tipe oil-bath.',
          en: 'Intake elbow and oil-bath air cleaner canister.',
        },
        cameraPos: [0.35, 1.65, -1.75],
        cameraTarget: [-0.33, 1.32, -0.90],
      },
      {
        id: 'b-pulley',
        code: 'B.5',
        name: {
          id: 'Pulley Mesin B3 × 5"',
          en: 'Engine Pulley B3 × 5"',
        },
        qty: 1,
        note: {
          id: 'Pulley cor 3-alur diameter 5" terpasang di hub flywheel.',
          en: '3-groove 5" cast pulley bolted to flywheel hub.',
        },
        cameraPos: [-1.95, 1.02, -0.15],
        cameraTarget: [-0.90, 0.91, -0.26],
      },
      {
        id: 'b-bolt',
        code: 'B.6',
        name: {
          id: 'Baut & Mur (Mesin)',
          en: 'Bolts & Nuts (Engine)',
        },
        qty: 8,
        note: {
          id: 'Baut pengikat dudukan blok mesin dan kepala silinder.',
          en: 'Crankcase mounting and cylinder head hex fasteners.',
        },
        cameraPos: [-1.45, 1.10, -1.45],
        cameraTarget: [-0.52, 0.78, -0.46],
      },
      {
        id: 'b-bbm',
        code: 'B.7',
        name: {
          id: 'Tangki BBM (14 L)',
          en: 'Diesel Fuel Tank (14 L)',
        },
        qty: 1,
        note: {
          id: 'Tangki solar plat baja kapasitas 14 L dengan tutup kuningan.',
          en: '14 L steel diesel tank with brass filler cap.',
        },
        cameraPos: [0.42, 1.68, 0.65],
        cameraTarget: [-0.52, 1.20, -0.20],
      },
      {
        id: 'b-radiator',
        code: 'B.8',
        name: {
          id: 'Tangki Radiator',
          en: 'Radiator Hopper Tank',
        },
        qty: 1,
        note: {
          id: 'Hopper pendingin air atas dengan kisi ventilasi dan pelat spek.',
          en: 'Top evaporative cooling hopper with louver vents and nameplate.',
        },
        cameraPos: [-1.55, 1.72, -1.35],
        cameraTarget: [-0.52, 1.22, -0.56],
      },
    ],
  },
  {
    code: 'C',
    title: { id: 'POMPA 1 (1m + 5m · 18°)', en: 'PUMP ASSEMBLY (1m + 5m · 18°)' },
    items: [
      {
        id: 'c-pipa',
        code: 'C.1',
        name: {
          id: 'Pipa Pompa PVC AW 12" SNI (100 + 500 cm · 18°)',
          en: '12" SNI PVC AW Pump Pipe (100 + 500 cm · 18°)',
        },
        qty: 1,
        note: {
          id: 'Kolom PVC AW abu Ø 300 mm, flens siku 12-baut, dan A-frame kanal.',
          en: '300 mm grey PVC AW column with 12-bolt elbow flange and A-frame stand.',
        },
        cameraPos: [1.65, 1.65, 4.45],
        cameraTarget: [1.55, -0.12, 0.38],
      },
      {
        id: 'c-as-panjang',
        code: 'C.2',
        name: {
          id: 'As Stainless 1/2" Panjang (400 cm)',
          en: '1/2" Stainless Drive Shaft (400 cm)',
        },
        qty: 1,
        note: {
          id: 'Poros luar sejajar 18°, masuk pipa 1 m sebelum impeller.',
          en: 'External 18° parallel shaft entering pipe 1 m ahead of impeller.',
        },
        cameraPos: [2.45, 0.92, 2.75],
        cameraTarget: [2.25, -0.18, 0.38],
        autoXray: true,
      },
      {
        id: 'c-as-pendek',
        code: 'C.3',
        name: {
          id: 'As Stainless 1/2" Pendek (40 cm)',
          en: '1/2" Stainless Countershaft (40 cm)',
        },
        qty: 1,
        note: {
          id: 'Poros datar 40 cm pembawa pulley pompa B3 × 5".',
          en: '40 cm horizontal countershaft carrying B3 × 5" pump pulley.',
        },
        cameraPos: [-1.15, 1.32, 1.25],
        cameraTarget: [-0.68, 0.91, 0.38],
      },
      {
        id: 'c-kopel',
        code: 'C.4',
        name: {
          id: 'Shaft Assy Propeller (Kopel Atas & Gland 1 m)',
          en: 'Propeller Shaft Assy (Upper Kopel & 1 m Gland)',
        },
        qty: 1,
        note: {
          id: 'Kopel atas siku 18° + gland seal masuk 1 m di atas impeller.',
          en: 'Upper 18° kopel joint and lower entry gland 1 m above impeller.',
        },
        cameraPos: [3.25, 0.65, 2.15],
        cameraTarget: [3.05, -0.25, 0.38],
      },
      {
        id: 'c-ucp205',
        code: 'C.5',
        name: {
          id: 'Bearing Pillow Block UCP-205',
          en: 'UCP-205 Pillow Block Bearing',
        },
        qty: 5,
        note: {
          id: '2 unit di countershaft depan + 3 unit di klem atas pipa PVC.',
          en: '2 on front countershaft + 3 carrier bearings along PVC clamps.',
        },
        cameraPos: [1.25, 1.22, 2.55],
        cameraTarget: [1.15, 0.25, 0.38],
      },
      {
        id: 'c-pulley',
        code: 'C.6',
        name: {
          id: 'Pulley Pompa B3 × 5"',
          en: 'Pump Pulley B3 × 5"',
        },
        qty: 1,
        note: {
          id: 'Pulley 3-alur 5" segaris datar dengan flywheel (rasio 1:1).',
          en: '3-groove 5" driven pulley aligned level with flywheel (1:1).',
        },
        cameraPos: [-1.85, 1.04, 0.85],
        cameraTarget: [-0.90, 0.91, 0.38],
      },
      {
        id: 'c-saringan',
        code: 'C.7',
        name: {
          id: 'Saringan Pompa',
          en: 'Intake Bar Strainer',
        },
        qty: 1,
        note: {
          id: 'Keranjang jeruji baja las penahan sampah di ujung hisap kanal.',
          en: 'Welded steel bar basket guarding submerged canal intake.',
        },
        cameraPos: [5.55, 0.35, 1.85],
        cameraTarget: [4.38, -0.94, 0.38],
      },
      {
        id: 'c-impeller',
        code: 'C.8',
        name: {
          id: 'Impeller Aksial 3-Sudu',
          en: '3-Blade Axial Impeller',
        },
        qty: 1,
        note: {
          id: 'Baling-baling cor Ø 282 mm di dalam ujung pipa miring 18°.',
          en: '282 mm cast axial propeller inside the 18° intake column.',
        },
        cameraPos: [5.25, 0.42, 1.98],
        cameraTarget: [4.08, -0.84, 0.38],
        autoXray: true,
      },
      {
        id: 'c-vbelt',
        code: 'C.9',
        name: {
          id: 'V-Belt B-69',
          en: 'V-Belt B-69',
        },
        qty: 3,
        note: {
          id: 'Tiga sabuk karet profil B-69 sejajar datar 0°.',
          en: 'Three B-69 rubber V-belts running 0° level.',
        },
        cameraPos: [-2.42, 1.02, 0.16],
        cameraTarget: [-0.90, 0.91, 0.06],
      },
      {
        id: 'c-bolt',
        code: 'C.10',
        name: {
          id: 'Baut & Mur (Pompa)',
          en: 'Bolts & Nuts (Pump)',
        },
        qty: 20,
        note: {
          id: 'Baut klem pipa, flens siku 12-baut, UCP-205, dan gland seal.',
          en: 'Pipe clamp, 12-bolt elbow flange, UCP-205, and gland fasteners.',
        },
        cameraPos: [0.35, 1.15, 1.85],
        cameraTarget: [0.22, 0.45, 0.38],
      },
      {
        id: 'c-selang',
        code: 'C.11',
        name: {
          id: 'Selang Buang Spiral 12"',
          en: '12" Spiral Discharge Hose',
        },
        qty: 1,
        note: {
          id: 'Selang spiral biru fleksibel menyalurkan air menuruni lereng tanggul.',
          en: 'Blue corrugated spiral hose routing flow down the levee slope.',
        },
        cameraPos: [-5.65, 1.32, 3.45],
        cameraTarget: [-2.85, -0.35, 0.38],
        autoHose: true,
      },
    ],
  },
  {
    code: 'D',
    title: { id: 'SASIS (Drop-Throat 18°)', en: 'CHASSIS (18° Drop-Throat)' },
    items: [
      {
        id: 'd-rangka',
        code: 'D.1',
        name: {
          id: 'Rangka Sasis Bawah (Cradle 18° + U-Bolt Depan)',
          en: 'Lower Chassis Frame (18° Cradle + Front U-Bolts)',
        },
        qty: 1,
        note: {
          id: 'Cradle 18° tertutup, 2 sadel U-bolt depan, brace pulley, dan 4 kaki penstabil.',
          en: 'Closed 18° cradle, twin front U-bolt saddles, pulley braces, and 4 outriggers.',
        },
        cameraPos: [-1.45, 1.05, 2.55],
        cameraTarget: [-0.15, 0.38, 0.15],
      },
      {
        id: 'd-bolt',
        code: 'D.2',
        name: {
          id: 'Baut & Mur (Sasis)',
          en: 'Bolts & Nuts (Chassis)',
        },
        qty: 14,
        note: {
          id: 'Baut struktur rangka, gusset cradle 18°, as roda, dan mur roda.',
          en: 'Frame, 18° cradle gusset, axle, and wheel lug fasteners.',
        },
        cameraPos: [-1.65, 0.82, 1.95],
        cameraTarget: [-0.45, 0.36, 0.25],
      },
      {
        id: 'd-pelek',
        code: 'D.3',
        name: {
          id: 'Pelek Baja 13 Inci',
          en: '13-Inch Steel Rim',
        },
        qty: 2,
        note: {
          id: 'Pelek baja press 13 inci pola 5-baut.',
          en: 'Stamped 13-inch 5-lug steel wheel rims.',
        },
        cameraPos: [-0.58, 0.52, 1.98],
        cameraTarget: [-0.58, 0.28, 0.74],
      },
      {
        id: 'd-ban',
        code: 'D.4',
        name: {
          id: 'Ban 13 Inci',
          en: '13-Inch Tire',
        },
        qty: 2,
        note: {
          id: 'Ban angin 13 inci kembangan traktor untuk permukaan tanah tanggul.',
          en: '13-inch chevron-lug pneumatic tires for levee soil.',
        },
        cameraPos: [-1.35, 0.58, 1.92],
        cameraTarget: [-0.58, 0.28, 0.74],
      },
    ],
  },
];
