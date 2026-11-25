import { useCallback, useEffect, useRef, useState } from 'react';
import { DieselAudioEngine } from './audio/DieselAudioEngine';
import { HudOverlay } from './components/HudOverlay';
import { Viewport3D } from './components/Viewport3D';
import { PumpSceneController } from './three/PumpSceneController';
import {
  BomPartItem,
  CAMERA_PRESETS,
  CameraPresetId,
  computeTelemetry,
  FloodCalcInput,
  HOTSPOTS,
  HotspotId,
  ProjectedDimension,
  ProjectedHotspot,
  RightDrawerMode,
  ShowcaseConfig,
  TelemetryData,
} from './types';

const INITIAL_CONFIG: ShowcaseConfig = {
  targetRpm: 1400,
  stageMode: 'tanggul',
  timeOfDay: 'day',
  canalWaterY: -0.58,
  cadDimensionsVisible: false,
  beltGuardVisible: false,
  xrayEnabled: false,
  explodedAmount: 0,
  waterFlowEnabled: true,
  dischargeHoseAttached: true,
  calloutsVisible: true,
  audioMuted: true,
};

const INITIAL_FLOOD_CALC: FloodCalcInput = {
  areaValue: 1.5,
  areaUnit: 'ha',
  depthCm: 40,
  dieselPriceIdr: 6800,
  pumpUnits: 1,
};

export default function App() {
  const [config, setConfig] = useState<ShowcaseConfig>(INITIAL_CONFIG);
  const [telemetry, setTelemetry] = useState<TelemetryData>(() =>
    computeTelemetry(
      INITIAL_CONFIG.targetRpm,
      INITIAL_CONFIG.waterFlowEnabled,
      INITIAL_CONFIG.canalWaterY,
      INITIAL_CONFIG.stageMode,
    ),
  );
  const [projectedHotspots, setProjectedHotspots] = useState<ProjectedHotspot[]>(
    [],
  );
  const [projectedDimensions, setProjectedDimensions] = useState<
    ProjectedDimension[]
  >([]);
  const [activePreset, setActivePreset] = useState<CameraPresetId>('overview');
  const [activeHotspot, setActiveHotspot] = useState<HotspotId | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [rightDrawer, setRightDrawer] = useState<RightDrawerMode>('none');
  const [activeBomItemId, setActiveBomItemId] = useState<string | null>(null);
  const [floodCalcInput, setFloodCalcInput] =
    useState<FloodCalcInput>(INITIAL_FLOOD_CALC);

  const controllerRef = useRef<PumpSceneController | null>(null);
  const audioRef = useRef<DieselAudioEngine | null>(null);

  // Initialize procedural audio synthesizer lazily and dispose cleanly on unmount
  useEffect(() => {
    const audio = new DieselAudioEngine();
    audioRef.current = audio;
    return () => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  // Sync mute state to Web Audio engine
  useEffect(() => {
    audioRef.current?.setMuted(config.audioMuted);
  }, [config.audioMuted]);

  // Keep audio frequency/volume tracking live damped RPM & effective water flow
  const handleTelemetry = useCallback(
    (data: TelemetryData) => {
      setTelemetry(data);
      const effectiveFlow =
        config.waterFlowEnabled && data.cavitationEfficiency > 0.05;
      audioRef.current?.update(data.engineRpm, effectiveFlow);
    },
    [config.waterFlowEnabled],
  );

  const handleConfigChange = useCallback((patch: Partial<ShowcaseConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleFloodCalcChange = useCallback(
    (patch: Partial<FloodCalcInput>) => {
      setFloodCalcInput((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleToggleDrawer = useCallback((mode: Exclude<RightDrawerMode, 'none'>) => {
    setRightDrawer((prev) => (prev === mode ? 'none' : mode));
  }, []);

  const handleSelectPreset = useCallback((presetId: CameraPresetId) => {
    setActivePreset(presetId);
    setActiveBomItemId(null);
    const preset = CAMERA_PRESETS[presetId];
    if (preset?.autoXray) {
      setConfig((prev) => ({ ...prev, xrayEnabled: true }));
    }
    controllerRef.current?.flyToPreset(presetId);
  }, []);

  const handleSelectHotspot = useCallback((id: HotspotId | null) => {
    setActiveHotspot(id);
    if (!id) return;
    setActiveBomItemId(null);
    const def = HOTSPOTS[id];
    if (def) {
      setActivePreset(def.cameraPreset);
      if (def.cameraPreset === 'propeller') {
        setConfig((prev) => ({ ...prev, xrayEnabled: true }));
      }
      controllerRef.current?.flyToPreset(def.cameraPreset);
    }
  }, []);

  const handleSelectBomItem = useCallback((item: BomPartItem) => {
    setActiveBomItemId(item.id);
    setActiveHotspot(null);
    if (item.autoXray || item.autoHose) {
      setConfig((prev) => ({
        ...prev,
        ...(item.autoXray ? { xrayEnabled: true } : {}),
        ...(item.autoHose ? { dischargeHoseAttached: true } : {}),
      }));
    }
    controllerRef.current?.focusBomItem(item);
  }, []);

  // Keyboard shortcuts: H = dock, X = X-Ray, B = BOM, K = Calculator, D = CAD dims, G = Belt Guard, Esc = close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      ) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      } else if (e.key === 'x' || e.key === 'X') {
        setConfig((prev) => ({ ...prev, xrayEnabled: !prev.xrayEnabled }));
      } else if (e.key === 'b' || e.key === 'B') {
        setRightDrawer((prev) => (prev === 'bom' ? 'none' : 'bom'));
      } else if (e.key === 'k' || e.key === 'K') {
        setRightDrawer((prev) =>
          prev === 'calculator' ? 'none' : 'calculator',
        );
      } else if (e.key === 'd' || e.key === 'D') {
        setConfig((prev) => ({
          ...prev,
          cadDimensionsVisible: !prev.cadDimensionsVisible,
        }));
      } else if (e.key === 'g' || e.key === 'G') {
        setConfig((prev) => ({
          ...prev,
          beltGuardVisible: !prev.beltGuardVisible,
        }));
      } else if (e.key === 'Escape') {
        setActiveHotspot(null);
        setRightDrawer('none');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0b0e13]">
      <Viewport3D
        config={config}
        controllerRef={controllerRef}
        onTelemetry={handleTelemetry}
        onHotspotsProjected={setProjectedHotspots}
        onDimensionsProjected={setProjectedDimensions}
      />

      <HudOverlay
        config={config}
        telemetry={telemetry}
        projectedHotspots={projectedHotspots}
        projectedDimensions={projectedDimensions}
        activePreset={activePreset}
        activeHotspot={activeHotspot}
        dockCollapsed={dockCollapsed}
        rightDrawer={rightDrawer}
        activeBomItemId={activeBomItemId}
        floodCalcInput={floodCalcInput}
        onConfigChange={handleConfigChange}
        onFloodCalcChange={handleFloodCalcChange}
        onSelectPreset={handleSelectPreset}
        onSelectHotspot={handleSelectHotspot}
        onToggleDock={() => setDockCollapsed((c) => !c)}
        onToggleDrawer={handleToggleDrawer}
        onCloseDrawer={() => setRightDrawer('none')}
        onSelectBomItem={handleSelectBomItem}
      />
    </main>
  );
}
