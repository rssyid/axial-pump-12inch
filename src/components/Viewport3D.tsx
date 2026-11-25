import { useEffect, useRef, useState } from 'react';
import {
  CameraPresetId,
  ProjectedDimension,
  ProjectedHotspot,
  ShowcaseConfig,
  TelemetryData,
} from '../types';
import { PumpSceneController } from '../three/PumpSceneController';

export interface Viewport3DHandle {
  flyToPreset: (preset: CameraPresetId) => void;
}

interface Viewport3DProps {
  config: ShowcaseConfig;
  controllerRef: React.MutableRefObject<PumpSceneController | null>;
  onTelemetry: (data: TelemetryData) => void;
  onHotspotsProjected: (points: ProjectedHotspot[]) => void;
  onDimensionsProjected: (dims: ProjectedDimension[]) => void;
}

export function Viewport3D({
  config,
  controllerRef,
  onTelemetry,
  onHotspotsProjected,
  onDimensionsProjected,
}: Viewport3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  // Keep latest callbacks in refs so WebGL scene initializes strictly once
  const callbacksRef = useRef({
    onTelemetry,
    onHotspotsProjected,
    onDimensionsProjected,
  });
  callbacksRef.current = {
    onTelemetry,
    onHotspotsProjected,
    onDimensionsProjected,
  };

  const initialConfigRef = useRef(config);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let ctrl: PumpSceneController | null = null;
    try {
      ctrl = new PumpSceneController(container, initialConfigRef.current, {
        onTelemetry: (data) => callbacksRef.current.onTelemetry(data),
        onHotspotsProjected: (pts) =>
          callbacksRef.current.onHotspotsProjected(pts),
        onDimensionsProjected: (dims) =>
          callbacksRef.current.onDimensionsProjected(dims),
        onContextLost: () => setContextLost(true),
        onContextRestored: () => setContextLost(false),
      });
      controllerRef.current = ctrl;
    } catch (err) {
      setInitError(
        err instanceof Error
          ? err.message
          : 'Unable to initialize WebGL 3D context.',
      );
    }

    return () => {
      controllerRef.current = null;
      ctrl?.dispose();
    };
  }, [controllerRef]);

  // Push config changes imperatively into the live WebGL controller
  useEffect(() => {
    controllerRef.current?.updateConfig(config);
  }, [config, controllerRef]);

  return (
    <div className="relative w-full h-full">
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        aria-label="Interactive 3D viewport of Dongfeng ZH1130 diesel engine and 12-inch axial flow water pump"
      />

      {(contextLost || initError) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b0e13]/95 p-6">
          <div className="max-w-md border border-white/15 bg-[#121720] p-6 text-center">
            <h2 className="font-[var(--font-display)] text-2xl font-bold tracking-wide text-slate-100">
              {initError ? 'WebGL Unavailable' : '3D Context Paused'}
            </h2>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              {initError ??
                'The graphics context was temporarily interrupted. Reload or resume to restore the interactive 3D engineering showcase.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#c81d25] hover:bg-[#dc2626] rounded transition-colors cursor-pointer"
            >
              Reload Viewport
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
