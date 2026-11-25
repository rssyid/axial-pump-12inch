import * as THREE from 'three';

const PIPE_SLOPE_DEG = 18;
const PIPE_SLOPE_RAD = (PIPE_SLOPE_DEG * Math.PI) / 180; // 0.314159 rad (exact 18 deg)
const PIPE_HORIZ_LEN = 1.0; // 100 cm horizontal discharge spout
const PIPE_INCLINED_LEN = 5.0; // 500 cm inclined intake column
const PIPE_ELBOW_JOIN_X = -0.45;
const PIPE_ELBOW_JOIN_Y = 0.62;
const COS18 = Math.cos(PIPE_SLOPE_RAD);
const SIN18 = Math.sin(PIPE_SLOPE_RAD);

// Parallel external shaft perpendicular distance above 18 deg PVC pipe centerline
// Computed directly from Kopel (-0.42, 0.91) relative to elbow (-0.45, 0.62): ~0.285 m
const SHAFT_PERP_OFFSET = 0.03 * SIN18 + 0.29 * COS18; // ~0.2851 m (~12.7 cm above PVC outer wall)

// Lower entry joint position along the 500 cm PVC column:
// Starts diving at s = 3.18 m so the sealed gland stuffing box pierces the top wall of
// the 12" PVC pipe right around 1.0 m upstream of the impeller (s_prop = 4.78 m)!
const LOWER_JOINT_S = 3.18;

export const DIM = {
  // Belt plane (both pulleys lie strictly in this Y-Z plane)
  BELT_X: -0.90,

  // Engine (Dongfeng ZH1130) raised on welded steel mounting pedestal so V-belts are 0 deg level
  ENGINE_MOUNT_Y: 0.63,
  ENGINE_CRANK_X: -0.52,
  ENGINE_CRANK_Y: 0.91,
  ENGINE_CRANK_Z: -0.26,
  FLYWHEEL_X: -0.79,
  FLYWHEEL_RADIUS: 0.285,
  DRIVE_PULLEY_RADIUS: 0.088, // Pulley B3 x 5" (3-groove)

  // Crank & piston internal cutaway specs (authentic 130mm bore x 120mm stroke)
  PISTON_RADIUS: 0.065,
  CRANK_RADIUS: 0.06,
  CONROD_LENGTH: 0.22,

  // Mobile wheeled skid (13-inch rims & agricultural tires shifted beneath horizontal spout for 18 deg clearance)
  WHEEL_AXLE_X: -0.58,
  WHEEL_RADIUS: 0.28,
  SKID_DECK_Y: 0.44,

  // Elevated Concrete-Steel Display Podium height for Studio & Field modes (floor sits at -1.32 m!)
  PODIUM_FLOOR_Y: -1.32,

  // 12-Inch (300mm) White PVC Axial Flow Pump: EXACT 100 cm horizontal + 500 cm inclined at 18 deg
  PUMP_Z: 0.38,
  PIPE_INNER_R: 0.15,
  PIPE_OUTER_R: 0.158,
  PIPE_HORIZ_LEN,
  PIPE_INCLINED_LEN,
  PIPE_SLOPE_DEG,
  PIPE_SLOPE_RAD,
  PIPE_ELBOW_JOIN_X,
  PIPE_ELBOW_JOIN_Y,
  SHAFT_PERP_OFFSET,
  LOWER_JOINT_S,
  CANAL_AFRAME_S: 3.55, // Steel A-frame pipe support stand station along 500 cm inclined PVC column

  // 100 cm horizontal discharge mouth (mendatar along -X from -0.45 to -1.45)
  DISCHARGE_MOUTH_X: PIPE_ELBOW_JOIN_X - PIPE_HORIZ_LEN, // -1.45 m
  DISCHARGE_MOUTH_Y: PIPE_ELBOW_JOIN_Y, // 0.62 m
  DISCHARGE_DIR: new THREE.Vector3(-1, 0, 0),

  // Exact 500 cm inclined intake end along 18 deg downward slope
  INTAKE_END_X: PIPE_ELBOW_JOIN_X + PIPE_INCLINED_LEN * COS18, // +4.3053 m
  INTAKE_END_Y: PIPE_ELBOW_JOIN_Y - PIPE_INCLINED_LEN * SIN18, // -0.9251 m

  // 3-Blade axial impeller positioned 22 cm inside the intake bellmouth (s = 4.78 m)
  PROPELLER_S: PIPE_INCLINED_LEN - 0.22,
  PROPELLER_X: PIPE_ELBOW_JOIN_X + (PIPE_INCLINED_LEN - 0.22) * COS18, // +4.096 m
  PROPELLER_Y: PIPE_ELBOW_JOIN_Y - (PIPE_INCLINED_LEN - 0.22) * SIN18, // -0.857 m

  // Tanggul (Levee / Embankment) water & crest levels
  LEVEE_CREST_MIN_X: -1.78,
  LEVEE_CREST_MAX_X: 0.72,
  CANAL_WATER_Y: -0.58, // Submerges intake mouth (-0.925m) by ~34.5 cm
  RIVER_WATER_Y: -1.15, // Outfall river surface on the -X outer levee slope

  // Blue Corrugated Spiral Discharge Hose (Selang Buang) — Tanggul (strictly ON TOP of levee slope!)
  HOSE_TANGGUL_TIP_X: -4.65,
  HOSE_TANGGUL_TIP_Y: -0.84,
  HOSE_TANGGUL_EXIT_DIR: new THREE.Vector3(-0.89, -0.456, 0).normalize(),

  // Blue Corrugated Spiral Discharge Hose (Selang Buang) — Studio/Field Podium Drape (to floor Y = -1.32)
  HOSE_PODIUM_TIP_X: -2.85,
  HOSE_PODIUM_TIP_Y: -0.88,
  HOSE_PODIUM_EXIT_DIR: new THREE.Vector3(-0.76, -0.65, 0).normalize(),

  // Upper power transmission & Kopel (U-Joint) 100% level with engine flywheel pulley (Y=0.91)
  DRIVEN_PULLEY_Y: 0.91,
  DRIVEN_PULLEY_RADIUS: 0.088, // Matching Pulley B3 x 5" (1:1 ratio)
  KOPEL_X: -0.42,
  KOPEL_Y: 0.91,
};

export function pipeCenterYAt(x: number): number {
  if (x <= DIM.PIPE_ELBOW_JOIN_X) {
    return DIM.PIPE_ELBOW_JOIN_Y;
  }
  const dx = x - DIM.PIPE_ELBOW_JOIN_X;
  return DIM.PIPE_ELBOW_JOIN_Y - dx * Math.tan(DIM.PIPE_SLOPE_RAD);
}

/**
 * Returns a point on the 18 deg inclined PVC pipe centerline at arc distance `s` (m)
 * measured downward from the elbow bend (-0.45, 0.62).
 */
export function pipePointAtS(s: number): THREE.Vector3 {
  return new THREE.Vector3(
    DIM.PIPE_ELBOW_JOIN_X + s * COS18,
    DIM.PIPE_ELBOW_JOIN_Y - s * SIN18,
    DIM.PUMP_Z,
  );
}

/**
 * Returns a point on the parallel 18 deg external stainless drive shaft line
 * (offset `SHAFT_PERP_OFFSET` perpendicularly above the PVC pipe centerline).
 */
export function externalShaftPointAtS(s: number): THREE.Vector3 {
  return new THREE.Vector3(
    DIM.PIPE_ELBOW_JOIN_X + s * COS18 + SIN18 * SHAFT_PERP_OFFSET,
    DIM.PIPE_ELBOW_JOIN_Y - s * SIN18 + COS18 * SHAFT_PERP_OFFSET,
    DIM.PUMP_Z,
  );
}

export function getKopelPos(): THREE.Vector3 {
  return new THREE.Vector3(DIM.KOPEL_X, DIM.KOPEL_Y, DIM.PUMP_Z);
}

/**
 * Lower entry Kopel/Joint along the parallel 18 deg shaft (~1.6m before impeller),
 * from which the final shaft segment dives into the white PVC top wall ~1.0m before the impeller!
 */
export function getLowerEntryKopelPos(): THREE.Vector3 {
  return externalShaftPointAtS(DIM.LOWER_JOINT_S);
}

export function getPropellerPos(): THREE.Vector3 {
  return new THREE.Vector3(DIM.PROPELLER_X, DIM.PROPELLER_Y, DIM.PUMP_Z);
}

/**
 * Continuous procedural elevation function for the Tanggul (Levee) terrain separating
 * the Canal (+X intake side) from the River (-X discharge side).
 * Returns Y = 0.00 cleanly across the levee crest where the wheeled pump chassis sits.
 */
export function leveeTerrainHeightAt(x: number, z: number): number {
  const padMask = THREE.MathUtils.smoothstep(Math.abs(z), 1.4, 3.6);
  const microWave =
    padMask * (Math.sin(z * 0.42 + x * 0.28) * 0.08 + Math.cos(z * 0.85 - x * 0.19) * 0.04);

  // 1. Flat compacted levee crest (wheels & stabilizer pads sit 100% flush at Y = 0.00)
  if (x >= DIM.LEVEE_CREST_MIN_X && x <= DIM.LEVEE_CREST_MAX_X) {
    return microWave * 0.45;
  }

  // 2. Canal-side inner slope (+X): smooth concave-up embankment dropping cleanly beneath the 18 deg PVC pipe
  if (x > DIM.LEVEE_CREST_MAX_X) {
    if (x <= 4.9) {
      const t = (x - DIM.LEVEE_CREST_MAX_X) / (4.9 - DIM.LEVEE_CREST_MAX_X);
      const s = t * (2 - t); // Smooth parabolic drop -> clears entire 5m PVC pipe + frames A-frame stand!
      return -1.68 * s + microWave * 0.65;
    }
    if (x <= 11.4) {
      return -1.68 + Math.sin(x * 0.6 + z * 0.3) * 0.06;
    }
    if (x <= 17.5) {
      const t = (x - 11.4) / (17.5 - 11.4);
      const s = t * t * (3 - 2 * t);
      return -1.68 + 2.02 * s + microWave;
    }
    return 0.34 + microWave * 1.4 + Math.sin(x * 0.14 + z * 0.12) * 0.12;
  }

  // 3. River-side outer slope (-X): slopes down beneath the draped blue Selang Buang into the river
  if (x >= -7.2) {
    const t = (DIM.LEVEE_CREST_MIN_X - x) / (DIM.LEVEE_CREST_MIN_X - -7.2);
    const s = t * t * (3 - 2 * t);
    return -1.96 * s + microWave * 0.65;
  }
  if (x >= -19.5) {
    return -1.96 + Math.sin(x * 0.45 + z * 0.25) * 0.08;
  }
  if (x >= -26.0) {
    const t = (-19.5 - x) / (-19.5 - -26.0);
    const s = t * t * (3 - 2 * t);
    return -1.96 + 2.25 * s + microWave;
  }
  return 0.29 + microWave * 1.3;
}
