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
  title: string;
  subtitle: string;
  cameraPreset: CameraPresetId;
  specs: Array<{ label: string; value: string }>;
  description: string;
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
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  autoXray?: boolean;
}

export interface BomPartItem {
  id: string;
  code: string;
  name: string;
  qty: number;
  note: string;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  autoXray?: boolean;
  autoHose?: boolean;
}

export interface BomSection {
  code: string;
  title: string;
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

  // Realistic Dongfeng ZH1130 30 HP diesel fuel consumption (L/hr):
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
    label: 'Overview',
    position: [-4.55, 2.95, 6.45],
    target: [0.45, 0.18, 0.28],
  },
  flywheel: {
    id: 'flywheel',
    label: 'Flywheel & V-Belt',
    position: [-2.55, 1.05, 0.22],
    target: [-0.90, 0.91, 0.06],
  },
  kopel: {
    id: 'kopel',
    label: 'Kopel / 18° Bend',
    position: [-0.20, 1.48, 1.95],
    target: [-0.05, 0.66, 0.38],
  },
  propeller: {
    id: 'propeller',
    label: 'Propeller X-Ray',
    position: [5.45, 0.45, 2.15],
    target: [4.08, -0.84, 0.38],
    autoXray: true,
  },
  discharge: {
    id: 'discharge',
    label: 'Discharge Flow',
    position: [-6.15, 1.45, 4.15],
    target: [-3.15, -0.52, 0.38],
  },
};

export const HOTSPOTS: Record<HotspotId, HotspotDefinition> = {
  engine: {
    id: 'engine',
    title: 'Dongfeng ZH1130 Diesel',
    subtitle: 'Horizontal Single-Cylinder · Electric Start 12V',
    cameraPreset: 'overview',
    specs: [
      { label: 'Rated Output', value: '30 HP (22 kW) @ 2200 RPM' },
      { label: 'Bore × Stroke', value: '130 × 120 mm (1.593 L)' },
      { label: 'Starter System', value: 'OTOR 12V + Accu 32Ah' },
      { label: 'Engine Pulley', value: 'B3 × 5" (3-Groove)' },
    ],
    description:
      'Heavy-duty cast-iron horizontal diesel engine on a raised steel pedestal atop the embankment crest, equipped with a 12V OTOR starter motor, flywheel ring gear, and 12V 32Ah flooded battery.',
  },
  vbelt: {
    id: 'vbelt',
    title: 'Triple V-Belt B-69 Drive',
    subtitle: 'Level Twin Pulleys B3 × 5" · 1:1 Direct Ratio',
    cameraPreset: 'flywheel',
    specs: [
      { label: 'V-Belt Spec', value: '3 × V-Belt B-69 Rubber' },
      { label: 'Pulleys', value: 'B3 × 5" Engine & Pump (1:1)' },
      { label: 'Bearings', value: '5 × Pillow Block UCP-205' },
      { label: 'Alignment', value: '0° Level Horizontal Span' },
    ],
    description:
      'Three parallel B-69 rubber V-belts running strictly level between identical 3-groove B3 × 5" pulleys on the flywheel hub and the 40 cm stainless pump countershaft.',
  },
  kopel: {
    id: 'kopel',
    title: 'Kopel 18° & Poros Masuk 1m Impeller',
    subtitle: 'Parallel 18° External Shaft · 12-Bolt Steel Elbow Flange',
    cameraPreset: 'kopel',
    specs: [
      { label: 'Pipe Material', value: 'PVC AW 12" Grey SNI (1m + 5m)' },
      { label: 'Elbow Joint', value: '12-Bolt Steel Backing Flange' },
      { label: 'Shaft Routing', value: 'Parallel External -> 1m Entry' },
      { label: 'Bearings', value: '5 × Pillow Block UCP-205' },
    ],
    description:
      'Upper kopel aligns the 400 cm stainless shaft parallel along the top of the SNI grey 12" PVC AW pipe through three UCP-205 pillow blocks, reinforced by a 12-bolt steel backing flange at the 18° elbow and entering the PVC column 1 meter upstream of the impeller.',
  },
  discharge: {
    id: 'discharge',
    title: '100 cm PVC Outlet & Selang Buang',
    subtitle: '300 mm SNI PVC AW Spout · Front U-Bolt Saddle & Hose',
    cameraPreset: 'discharge',
    specs: [
      { label: 'Horizontal Run', value: '100 cm (1.0 m) PVC AW Grey' },
      { label: 'Nominal Bore', value: '300 mm (12 Inch / 12 Dim)' },
      { label: 'Peak Capacity', value: 'Up to 216 L/s (777 m³/hr)' },
      { label: 'Discharge Hose', value: 'Toggleable Blue Spiral Hose' },
    ],
    description:
      '100 cm horizontal SNI grey PVC AW discharge section clamped directly onto twin front U-bolt steel saddles, fitted with a blue corrugated spiral discharge hose draped atop the levee slope into the river.',
  },
  propeller: {
    id: 'propeller',
    title: 'Impeller, Saringan & A-Frame Kanal',
    subtitle: 'Submerged 500 cm (18°) PVC AW · Steel A-Frame Support',
    cameraPreset: 'propeller',
    specs: [
      { label: 'Column Length', value: '500 cm PVC AW Grey @ 18.0°' },
      { label: 'Pipe Support', value: 'Steel A-Frame Stand (Canal)' },
      { label: 'Impeller Dia.', value: '282 mm (3 Wide Blades)' },
      { label: 'Intake Guard', value: 'Steel Bar Strainer Basket' },
    ],
    description:
      '500 cm SNI grey PVC AW column plunging at 18° into the canal, braced mid-span by a steel A-frame support stand with the sealed shaft entry gland positioned 1 meter upstream of the 3-blade axial impeller.',
  },
};

export const BOM_SECTIONS: BomSection[] = [
  {
    code: 'A',
    title: 'RUMAH POMPA',
    sectionQty: 1,
    items: [
      {
        id: 'rumah-pompa',
        code: 'A',
        name: 'Rumah Pompa (Rangka Atas & Klem Sadel)',
        qty: 1,
        note: 'Upper bearing frame, 18° elbow clamps & A-frame braces',
        cameraPos: [-0.35, 1.52, 2.05],
        cameraTarget: [-0.15, 0.72, 0.38],
      },
    ],
  },
  {
    code: 'B',
    title: 'MESIN (Dongfeng ZH1130)',
    sectionQty: 1,
    items: [
      {
        id: 'b-accu',
        code: 'B.1',
        name: 'Batery/Accu, Flooded 12V 32AH 32B20R-NS4',
        qty: 1,
        note: '12V flooded battery on side tray with starter cables',
        cameraPos: [0.68, 1.15, -1.38],
        cameraTarget: [-0.04, 0.62, -0.44],
      },
      {
        id: 'b-starter',
        code: 'B.2',
        name: 'Motor Starter OTOR 12 Volt',
        qty: 1,
        note: '12V electric starter & solenoid engaging flywheel ring gear',
        cameraPos: [-1.45, 1.08, -1.28],
        cameraTarget: [-0.62, 0.80, -0.48],
      },
      {
        id: 'b-exhaust',
        code: 'B.3',
        name: 'Exhaust Pipe Disel',
        qty: 1,
        note: 'Vertical baffled muffler stack with hinged rain cap',
        cameraPos: [-1.55, 1.88, -1.68],
        cameraTarget: [-0.70, 1.48, -0.90],
      },
      {
        id: 'b-intake',
        code: 'B.4',
        name: 'Intake Pipe Elbo Filter Saringan Udara',
        qty: 1,
        note: 'Elbow intake pipe & oil-bath air cleaner canister',
        cameraPos: [0.35, 1.65, -1.75],
        cameraTarget: [-0.33, 1.32, -0.90],
      },
      {
        id: 'b-pulley',
        code: 'B.5',
        name: 'Pulley - B3 X 5"',
        qty: 1,
        note: '3-groove 5" cast pulley bolted to flywheel hub',
        cameraPos: [-1.95, 1.02, -0.15],
        cameraTarget: [-0.90, 0.91, -0.26],
      },
      {
        id: 'b-bolt',
        code: 'B.6',
        name: 'Bolt & Nut (Mesin)',
        qty: 8,
        note: 'Heavy hex crankcase mounting & cylinder head fasteners',
        cameraPos: [-1.45, 1.10, -1.45],
        cameraTarget: [-0.52, 0.78, -0.46],
      },
      {
        id: 'b-bbm',
        code: 'B.7',
        name: 'Tangki BBM',
        qty: 1,
        note: 'Rear-mounted crimson steel diesel tank with brass cap',
        cameraPos: [0.42, 1.68, 0.65],
        cameraTarget: [-0.52, 1.20, -0.20],
      },
      {
        id: 'b-radiator',
        code: 'B.8',
        name: 'Tangki Radiator',
        qty: 1,
        note: 'Evaporative top radiator hopper with louvers & nameplate',
        cameraPos: [-1.55, 1.72, -1.35],
        cameraTarget: [-0.52, 1.22, -0.56],
      },
    ],
  },
  {
    code: 'C',
    title: 'POMPA 1 (1m + 5m · 18°)',
    items: [
      {
        id: 'c-pipa',
        code: 'C.1',
        name: 'Pipa Pompa PVC AW 12" SNI (100 + 500 cm · 18°)',
        qty: 1,
        note: 'Grey SNI 300 mm PVC AW column with 12-bolt elbow flange & canal A-frame stand',
        cameraPos: [1.65, 1.65, 4.45],
        cameraTarget: [1.55, -0.12, 0.38],
      },
      {
        id: 'c-as-panjang',
        code: 'C.2',
        name: 'As Stainless 1/2 inch (400 cm) Panjang',
        qty: 1,
        note: 'External 18° parallel shaft entering PVC 1m before impeller',
        cameraPos: [2.45, 0.92, 2.75],
        cameraTarget: [2.25, -0.18, 0.38],
        autoXray: true,
      },
      {
        id: 'c-as-pendek',
        code: 'C.3',
        name: 'As Stainless 1/2 inch (40 cm) Pendek',
        qty: 1,
        note: 'Short 40 cm horizontal countershaft carrying pump B3 × 5" pulley',
        cameraPos: [-1.15, 1.32, 1.25],
        cameraTarget: [-0.68, 0.91, 0.38],
      },
      {
        id: 'c-kopel',
        code: 'C.4',
        name: 'Shaft Assy Propeller (Kopel Atas & Entry 1m)',
        qty: 1,
        note: 'Upper 18° elbow kopel + lower entry joint & gland 1m above impeller',
        cameraPos: [3.25, 0.65, 2.15],
        cameraTarget: [3.05, -0.25, 0.38],
      },
      {
        id: 'c-ucp205',
        code: 'C.5',
        name: 'Bearing Pillow Block UCP-205',
        qty: 5,
        note: '2 front countershaft + 3 parallel PVC-clamp carrier bearings',
        cameraPos: [1.25, 1.22, 2.55],
        cameraTarget: [1.15, 0.25, 0.38],
      },
      {
        id: 'c-pulley',
        code: 'C.6',
        name: 'Pully - B3 X 5"',
        qty: 1,
        note: '3-groove 5" driven pulley aligned level (1:1 ratio)',
        cameraPos: [-1.85, 1.04, 0.85],
        cameraTarget: [-0.90, 0.91, 0.38],
      },
      {
        id: 'c-saringan',
        code: 'C.7',
        name: 'Saringan Pompa',
        qty: 1,
        note: 'Welded steel-bar intake strainer submerged in canal water',
        cameraPos: [5.55, 0.35, 1.85],
        cameraTarget: [4.38, -0.94, 0.38],
      },
      {
        id: 'c-impeller',
        code: 'C.8',
        name: 'Impeller',
        qty: 1,
        note: '3-blade wide-chord cast axial propeller inside 18° intake',
        cameraPos: [5.25, 0.42, 1.98],
        cameraTarget: [4.08, -0.84, 0.38],
        autoXray: true,
      },
      {
        id: 'c-vbelt',
        code: 'C.9',
        name: 'V-Belt B-69',
        qty: 3,
        note: 'Triple B-69 industrial rubber V-belts running 0° level',
        cameraPos: [-2.42, 1.02, 0.16],
        cameraTarget: [-0.90, 0.91, 0.06],
      },
      {
        id: 'c-bolt',
        code: 'C.10',
        name: 'Bolt & Nut (Pompa)',
        qty: 20,
        note: 'Band clamp, pillow-block UCP-205 & gland stuffing-box bolts',
        cameraPos: [0.35, 1.15, 1.85],
        cameraTarget: [0.22, 0.45, 0.38],
      },
      {
        id: 'c-selang',
        code: 'C.11',
        name: 'Selang Buang',
        qty: 1,
        note: 'Blue corrugated spiral hose draping down levee slope to river',
        cameraPos: [-5.65, 1.32, 3.45],
        cameraTarget: [-2.85, -0.35, 0.38],
        autoHose: true,
      },
    ],
  },
  {
    code: 'D',
    title: 'SASIS (Drop-Throat 18°)',
    items: [
      {
        id: 'd-rangka',
        code: 'D.1',
        name: 'Rangka Frame Bawah (18° Cradle + U-Bolt Depan)',
        qty: 1,
        note: 'Closed drop-throat 18° cradle, twin front U-bolt saddles, dual pulley braces & 4 rear outriggers',
        cameraPos: [-1.45, 1.05, 2.55],
        cameraTarget: [-0.15, 0.38, 0.15],
      },
      {
        id: 'd-bolt',
        code: 'D.2',
        name: 'Bolt & Nut (Sasis)',
        qty: 14,
        note: 'Structural frame, 18° cradle gusset, axle & wheel lug fasteners',
        cameraPos: [-1.65, 0.82, 1.95],
        cameraTarget: [-0.45, 0.36, 0.25],
      },
      {
        id: 'd-pelek',
        code: 'D.3',
        name: 'Pelek 13 inch',
        qty: 2,
        note: 'Heavy stamped 13-inch 5-lug steel wheel rims',
        cameraPos: [-0.58, 0.52, 1.98],
        cameraTarget: [-0.58, 0.28, 0.74],
      },
      {
        id: 'd-ban',
        code: 'D.4',
        name: 'Ban 13 inch',
        qty: 2,
        note: 'Rugged 13-inch agricultural chevron-lug pneumatic tires',
        cameraPos: [-1.35, 0.58, 1.92],
        cameraTarget: [-0.58, 0.28, 0.74],
      },
    ],
  },
];
