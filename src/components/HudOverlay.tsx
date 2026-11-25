import {
  AlertTriangle,
  Calculator,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Droplets,
  Eye,
  Info,
  Layers,
  MapPin,
  Moon,
  Mountain,
  Ruler,
  Shield,
  Sun,
  Sunset,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import {
  BOM_SECTIONS,
  BomPartItem,
  CAMERA_PRESETS,
  CameraPresetId,
  computeFloodDrainage,
  FloodCalcInput,
  HOTSPOTS,
  HotspotId,
  ProjectedDimension,
  ProjectedHotspot,
  RightDrawerMode,
  ShowcaseConfig,
  StageMode,
  TelemetryData,
  TimeOfDay,
} from '../types';

interface HudOverlayProps {
  config: ShowcaseConfig;
  telemetry: TelemetryData;
  projectedHotspots: ProjectedHotspot[];
  projectedDimensions: ProjectedDimension[];
  activePreset: CameraPresetId;
  activeHotspot: HotspotId | null;
  dockCollapsed: boolean;
  rightDrawer: RightDrawerMode;
  activeBomItemId: string | null;
  floodCalcInput: FloodCalcInput;
  onConfigChange: (patch: Partial<ShowcaseConfig>) => void;
  onFloodCalcChange: (patch: Partial<FloodCalcInput>) => void;
  onSelectPreset: (preset: CameraPresetId) => void;
  onSelectHotspot: (id: HotspotId | null) => void;
  onToggleDock: () => void;
  onToggleDrawer: (mode: Exclude<RightDrawerMode, 'none'>) => void;
  onCloseDrawer: () => void;
  onSelectBomItem: (item: BomPartItem) => void;
}

const HOTSPOT_ORDER: HotspotId[] = [
  'engine',
  'vbelt',
  'kopel',
  'discharge',
  'propeller',
];

const RPM_STOPS = [
  { label: 'Off', value: 0 },
  { label: '800', value: 800 },
  { label: '1400', value: 1400 },
  { label: '2200', value: 2200 },
];

const CANAL_LEVEL_PRESETS = [
  { label: 'Surut', value: -0.94 },
  { label: 'Vortex', value: -0.74 },
  { label: 'Normal', value: -0.58 },
  { label: 'Banjir', value: -0.26 },
];

const PRESET_LIST: CameraPresetId[] = [
  'overview',
  'flywheel',
  'kopel',
  'propeller',
  'discharge',
];

const TIME_OPTIONS: Array<{ id: TimeOfDay; label: string }> = [
  { id: 'day', label: 'Siang' },
  { id: 'dusk', label: 'Sore' },
  { id: 'night', label: 'Malam' },
];

function formatDuration(hours: number): string {
  const totalMinutes = Math.max(1, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} mnt`;
  if (m === 0) return `${h} jam`;
  return `${h} jam ${m} mnt`;
}

function formatRupiah(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString('id-ID')}`;
}

export function HudOverlay({
  config,
  telemetry,
  projectedHotspots,
  projectedDimensions,
  activePreset,
  activeHotspot,
  dockCollapsed,
  rightDrawer,
  activeBomItemId,
  floodCalcInput,
  onConfigChange,
  onFloodCalcChange,
  onSelectPreset,
  onSelectHotspot,
  onToggleDock,
  onToggleDrawer,
  onCloseDrawer,
  onSelectBomItem,
}: HudOverlayProps) {
  const isDaylight =
    config.stageMode !== 'studio' && config.timeOfDay !== 'night';
  const isTanggul = config.stageMode === 'tanggul';
  const selectedHotspotDef = activeHotspot ? HOTSPOTS[activeHotspot] : null;
  const floodResult = computeFloodDrainage(floodCalcInput, telemetry);

  // Solid high-contrast dark surface (no CSS backdrop-filter over active WebGL canvas)
  const panelBg = 'bg-[#0e131b]/92 border border-white/12 text-slate-100';

  const cavitationBannerStyle =
    telemetry.cavitationState === 'critical'
      ? 'bg-[#3b0f14]/95 border-[#ef4444]/65 text-red-100'
      : telemetry.cavitationState === 'warning'
        ? 'bg-[#2e210a]/95 border-[#f59e0b]/60 text-amber-100'
        : 'bg-[#0e131b]/90 border-white/12 text-slate-200';

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden">
      {/* =================================================================== */}
      {/* TOP BAR: MINIMAL TITLE LOCKUP (LEFT) + TELEMETRY STRIP (RIGHT)      */}
      {/* =================================================================== */}
      <header className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
        {/* Top-Left Brand / Model Designation (Zero-Pill Clean Typography) */}
        <div
          className={`pointer-events-auto rounded-lg px-4 py-2.5 shadow-lg ${
            isDaylight
              ? 'bg-[#0e131b]/92 border border-black/25 text-slate-100'
              : 'bg-[#0e131b]/85 border border-white/12 text-slate-100'
          }`}
        >
          <h1
            className="text-xl sm:text-2xl font-bold tracking-tight leading-none text-white whitespace-nowrap"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            DONGFENG ZH1130
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-300/90 whitespace-nowrap">
            <span>12&quot; PVC AW Axial Pump</span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span>1m + 5m (18°)</span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span>30 HP Diesel</span>
          </div>
        </div>

        {/* Top-Right Compact Engineering Telemetry Strip + Tanggul Submergence Status */}
        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          <div
            className={`flex items-center divide-x divide-white/10 rounded-lg shadow-lg ${panelBg}`}
            aria-label="Live Engineering Telemetry"
          >
            <div className="px-3.5 py-2">
              <div className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                Engine Speed
              </div>
              <div className="mt-0.5 flex items-baseline gap-1 font-[var(--font-mono)] tabular-nums">
                <span className="text-base sm:text-lg font-semibold text-white">
                  {Math.round(telemetry.engineRpm)}
                </span>
                <span className="text-[10px] text-slate-400">RPM</span>
              </div>
            </div>

            <div className="px-3.5 py-2">
              <div className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                Discharge Flow
              </div>
              <div className="mt-0.5 flex items-baseline gap-2 font-[var(--font-mono)] tabular-nums">
                <span
                  className={`text-base sm:text-lg font-semibold ${
                    telemetry.cavitationState === 'critical'
                      ? 'text-red-400'
                      : telemetry.cavitationState === 'warning'
                        ? 'text-amber-300'
                        : 'text-[#38bdf8]'
                  }`}
                >
                  {telemetry.flowLps.toFixed(0)}
                  <span className="ml-0.5 text-[10px] font-normal text-slate-400">
                    L/s
                  </span>
                </span>
                <span className="hidden sm:inline text-xs text-slate-300">
                  {telemetry.flowM3h.toFixed(0)} m³/hr
                </span>
              </div>
            </div>

            <div className="px-3.5 py-2">
              <div className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                Engine Load
              </div>
              <div className="mt-0.5 flex items-baseline gap-1 font-[var(--font-mono)] tabular-nums">
                <span className="text-base sm:text-lg font-semibold text-[#f59e0b]">
                  {telemetry.loadHp.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-400">HP</span>
              </div>
            </div>

            <div className="px-3.5 py-2">
              <div className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                Fuel Rate
              </div>
              <div className="mt-0.5 flex items-baseline gap-1 font-[var(--font-mono)] tabular-nums">
                <span className="text-base sm:text-lg font-semibold text-[#34d399]">
                  {telemetry.fuelLph.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-400">L/hr</span>
              </div>
            </div>

            <div className="hidden lg:block px-3.5 py-2">
              <div className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                Shaft Torque
              </div>
              <div className="mt-0.5 flex items-baseline gap-1 font-[var(--font-mono)] tabular-nums">
                <span className="text-base sm:text-lg font-semibold text-slate-100">
                  {telemetry.torqueNm.toFixed(1)}
                </span>
                <span className="text-[10px] text-slate-400">N·m</span>
              </div>
            </div>
          </div>

          {/* Tanggul Hydraulic Submergence & Cavitation Safety Indicator (Icon + Explicit Text) */}
          {isTanggul && (
            <div
              className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-medium shadow-md ${cavitationBannerStyle}`}
              role="status"
              aria-live="polite"
            >
              {telemetry.cavitationState === 'safe' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle
                  className={`h-3.5 w-3.5 shrink-0 ${
                    telemetry.cavitationState === 'critical'
                      ? 'text-red-400'
                      : 'text-amber-400'
                  }`}
                />
              )}
              <span className="whitespace-nowrap">
                {telemetry.cavitationState === 'safe' && 'Submergensi Aman'}
                {telemetry.cavitationState === 'warning' &&
                  'Peringatan Vortex — Debit Menurun'}
                {telemetry.cavitationState === 'critical' &&
                  'Kritis: Masuk Angin / Kering — Turunkan RPM'}
              </span>
              <span aria-hidden="true" className="text-white/30">
                ·
              </span>
              <span className="font-[var(--font-mono)] tabular-nums text-[11px] whitespace-nowrap">
                {telemetry.submergenceCm >= 0 ? '+' : ''}
                {Math.round(telemetry.submergenceCm)} cm
              </span>
              <span aria-hidden="true" className="hidden sm:inline text-white/30">
                ·
              </span>
              <span className="hidden sm:inline font-[var(--font-mono)] tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
                Head {telemetry.staticHeadM.toFixed(2)} m
              </span>
            </div>
          )}
        </div>
      </header>

      {/* =================================================================== */}
      {/* 3D-PROJECTED CAD DIMENSION LABELS (TOGGLEABLE)                      */}
      {/* =================================================================== */}
      {config.cadDimensionsVisible && (
        <div className="pointer-events-none absolute inset-0">
          {projectedDimensions.map((dim) => {
            if (!dim.visible) return null;
            const isAmber = dim.accent === 'amber';
            return (
              <div
                key={dim.id}
                style={{
                  transform: `translate3d(${dim.x}px, ${dim.y}px, 0) translate(-50%, -50%)`,
                }}
                className={`absolute left-0 top-0 rounded border px-2 py-0.5 shadow-md whitespace-nowrap ${
                  isAmber
                    ? 'bg-[#12161f]/94 border-[#f5b027]/70 text-[#fcd34d]'
                    : 'bg-[#0d1520]/94 border-[#38bdf8]/70 text-[#7dd3fc]'
                }`}
              >
                <div className="flex items-baseline gap-1.5 font-[var(--font-mono)] tabular-nums">
                  <span className="text-[11px] font-bold">{dim.label}</span>
                  {dim.sublabel && (
                    <span className="text-[10px] font-sans font-medium text-slate-300">
                      {dim.sublabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* 3D-PROJECTED INTERACTIVE ENGINEERING CALLOUT PINS                   */}
      {/* =================================================================== */}
      {config.calloutsVisible && (
        <div className="pointer-events-none absolute inset-0">
          {projectedHotspots.map((pt) => {
            if (!pt.visible) return null;
            const index = HOTSPOT_ORDER.indexOf(pt.id) + 1;
            const isSelected = activeHotspot === pt.id;
            const def = HOTSPOTS[pt.id];
            return (
              <button
                key={pt.id}
                type="button"
                onClick={() => onSelectHotspot(isSelected ? null : pt.id)}
                style={{
                  transform: `translate3d(${pt.x}px, ${pt.y}px, 0) translate(-50%, -50%)`,
                }}
                className={`pointer-events-auto absolute left-0 top-0 group flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium shadow-md transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e59a1a] ${
                  isSelected
                    ? 'bg-[#c81d25] border-white/40 text-white z-20'
                    : 'bg-[#0e131b]/90 border-white/20 text-slate-100 hover:border-[#e59a1a] hover:bg-[#161e2b]'
                }`}
                aria-label={`Inspect ${def.title}`}
              >
                <span className="font-[var(--font-mono)] text-[10px] font-semibold text-[#e59a1a] group-hover:text-amber-300">
                  0{index}
                </span>
                <span className="whitespace-nowrap text-[11px]">
                  {def.title.split(' ').slice(0, 3).join(' ')}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* ACTIVE CALLOUT INSPECTOR CARD (ANCHORED CLEANLY ABOVE DOCK)         */}
      {/* =================================================================== */}
      {selectedHotspotDef && (
        <aside
          className={`pointer-events-auto fixed left-4 sm:left-5 bottom-48 sm:bottom-44 z-20 w-[min(360px,calc(100vw-2rem))] rounded-lg p-4 shadow-2xl ${panelBg}`}
          aria-label="Component Technical Specification"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2
                className="text-lg font-bold tracking-wide text-white leading-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {selectedHotspotDef.title}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                {selectedHotspotDef.subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onSelectHotspot(null)}
              className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label="Close component specification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
            {selectedHotspotDef.description}
          </p>

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-white/10 pt-3">
            {selectedHotspotDef.specs.map((s) => (
              <div key={s.label}>
                <dt className="text-[10px] text-slate-400">{s.label}</dt>
                <dd className="text-xs font-medium text-slate-100 font-[var(--font-mono)] tabular-nums">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      )}

      {/* =================================================================== */}
      {/* MUTUALLY EXCLUSIVE RIGHT DRAWER: BOM OR FLOOD DRAINAGE CALCULATOR   */}
      {/* =================================================================== */}
      {rightDrawer === 'bom' && (
        <aside
          className="pointer-events-auto fixed top-28 right-4 sm:right-5 bottom-48 sm:bottom-44 z-20 flex w-[min(368px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-white/12 bg-[#0e131b]/95 text-slate-100 shadow-2xl"
          aria-label="Daftar Part Bill of Materials"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <h2
                className="text-base font-bold tracking-wide text-white leading-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                DAFTAR PART (BOM)
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Dongfeng ZH1130 + Pompa Aksial 12&quot; · 22 Item
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label="Tutup Daftar Part BOM"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-white/10">
            {BOM_SECTIONS.map((section) => (
              <div key={section.code}>
                <div className="sticky top-0 z-10 flex items-center justify-between bg-[#151c27] px-4 py-1.5 text-[11px] font-semibold tracking-wide text-slate-200 border-b border-white/8">
                  <span>
                    {section.code}. {section.title}
                  </span>
                  {section.sectionQty !== undefined && (
                    <span className="font-[var(--font-mono)] text-[10px] text-slate-400 tabular-nums">
                      Qty {section.sectionQty}
                    </span>
                  )}
                </div>

                <div className="divide-y divide-white/6">
                  {section.items.map((item) => {
                    const isActive = activeBomItemId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectBomItem(item)}
                        className={`w-full text-left px-4 py-2 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                          isActive
                            ? 'bg-[#c81d25]/24 ring-1 ring-inset ring-[#e59a1a]/45'
                            : 'hover:bg-white/6'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-1.5">
                            <span className="font-[var(--font-mono)] text-[10px] font-semibold text-[#e59a1a] shrink-0 tabular-nums">
                              {item.code}
                            </span>
                            <span className="text-xs font-medium text-slate-100 leading-snug">
                              {item.name}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
                            {item.note}
                          </p>
                        </div>
                        <span className="font-[var(--font-mono)] text-xs font-semibold text-slate-200 shrink-0 tabular-nums pt-0.5">
                          ×{item.qty}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 bg-[#0b1017] px-4 py-2 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Klik item untuk fokus kamera 3D</span>
            <span className="font-[var(--font-mono)] text-slate-500">
              ESC / B
            </span>
          </div>
        </aside>
      )}

      {rightDrawer === 'calculator' && (
        <aside
          className="pointer-events-auto fixed top-28 right-4 sm:right-5 bottom-48 sm:bottom-44 z-20 flex w-[min(372px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-white/12 bg-[#0e131b]/95 text-slate-100 shadow-2xl"
          aria-label="Kalkulator Pengurasan Banjir dan Biaya Solar"
        >
          <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <h2
                className="text-base font-bold tracking-wide text-white leading-tight"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                KALKULATOR BANJIR &amp; SOLAR
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Sinkron live dengan RPM ({Math.round(telemetry.engineRpm)}) &amp;
                debit aktual
              </p>
            </div>
            <button
              type="button"
              onClick={onCloseDrawer}
              className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label="Tutup Kalkulator Banjir"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4">
            {/* Area Input + Unit Switch */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <label htmlFor="calc-area" className="font-medium">
                  Luas Area Genangan
                </label>
                <div className="flex items-center rounded border border-white/12 bg-black/40 p-0.5">
                  {(['ha', 'm2'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() =>
                        onFloodCalcChange({
                          areaUnit: unit,
                          areaValue:
                            unit === 'ha'
                              ? Math.max(
                                  0.1,
                                  Number(
                                    (floodCalcInput.areaUnit === 'm2'
                                      ? floodCalcInput.areaValue / 10000
                                      : floodCalcInput.areaValue
                                    ).toFixed(2),
                                  ),
                                )
                              : Math.round(
                                  floodCalcInput.areaUnit === 'ha'
                                    ? floodCalcInput.areaValue * 10000
                                    : floodCalcInput.areaValue,
                                ),
                        })
                      }
                      className={`rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                        floodCalcInput.areaUnit === unit
                          ? 'bg-slate-200 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {unit === 'ha' ? 'Hektar' : 'm²'}
                    </button>
                  ))}
                </div>
              </div>
              <input
                id="calc-area"
                type="number"
                min={0.05}
                step={floodCalcInput.areaUnit === 'ha' ? 0.25 : 500}
                value={floodCalcInput.areaValue}
                onChange={(e) =>
                  onFloodCalcChange({
                    areaValue: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded-md border border-white/15 bg-black/45 px-3 py-1.5 text-sm font-[var(--font-mono)] tabular-nums text-white focus:border-[#38bdf8] focus:outline-none"
              />
            </div>

            {/* Depth & Units Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="calc-depth"
                  className="block text-xs font-medium text-slate-300"
                >
                  Tinggi Banjir (cm)
                </label>
                <input
                  id="calc-depth"
                  type="number"
                  min={5}
                  max={500}
                  step={5}
                  value={floodCalcInput.depthCm}
                  onChange={(e) =>
                    onFloodCalcChange({
                      depthCm: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full rounded-md border border-white/15 bg-black/45 px-3 py-1.5 text-sm font-[var(--font-mono)] tabular-nums text-white focus:border-[#38bdf8] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-300">
                  Jumlah Pompa
                </span>
                <div className="grid grid-cols-4 gap-1 rounded-md border border-white/12 bg-black/40 p-1">
                  {[1, 2, 3, 4].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => onFloodCalcChange({ pumpUnits: u })}
                      className={`rounded py-1 text-xs font-[var(--font-mono)] font-semibold cursor-pointer transition-colors ${
                        floodCalcInput.pumpUnits === u
                          ? 'bg-[#c81d25] text-white'
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {u}×
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Diesel Price Input + Indonesian Fuel Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label
                  htmlFor="calc-price"
                  className="font-medium text-slate-300"
                >
                  Harga Solar (Rp/Liter)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onFloodCalcChange({ dieselPriceIdr: 6800 })
                    }
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      floodCalcInput.dieselPriceIdr === 6800
                        ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50'
                        : 'bg-white/8 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    Bio Solar
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onFloodCalcChange({ dieselPriceIdr: 13900 })
                    }
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      floodCalcInput.dieselPriceIdr === 13900
                        ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50'
                        : 'bg-white/8 text-slate-300 hover:bg-white/15'
                    }`}
                  >
                    Dexlite
                  </button>
                </div>
              </div>
              <input
                id="calc-price"
                type="number"
                min={0}
                step={100}
                value={floodCalcInput.dieselPriceIdr}
                onChange={(e) =>
                  onFloodCalcChange({
                    dieselPriceIdr: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full rounded-md border border-white/15 bg-black/45 px-3 py-1.5 text-sm font-[var(--font-mono)] tabular-nums text-white focus:border-[#34d399] focus:outline-none"
              />
            </div>

            {/* Live Computed Operational Summary */}
            <div className="border-t border-white/12 pt-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Volume Air Target</span>
                <span className="font-[var(--font-mono)] text-sm font-semibold text-white tabular-nums">
                  {Math.round(floodResult.volumeM3).toLocaleString('id-ID')} m³
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Debit Gabungan ({floodCalcInput.pumpUnits}× unit)
                </span>
                <span className="font-[var(--font-mono)] text-sm font-semibold text-[#38bdf8] tabular-nums">
                  {Math.round(floodResult.effectiveFlowM3h).toLocaleString(
                    'id-ID',
                  )}{' '}
                  m³/jam
                </span>
              </div>

              {floodResult.hoursRequired === null ? (
                <div className="rounded-md border border-amber-400/40 bg-amber-950/40 p-3 text-xs text-amber-200 leading-relaxed">
                  Pompa tidak mengalirkan air (RPM terlalu rendah, Water Flow
                  nonaktif, atau kanal surut kritis). Naikkan RPM atau elevasi
                  air kanal untuk melihat estimasi durasi dan solar.
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-white/10 pt-3">
                  <div>
                    <dt className="text-[10px] text-slate-400">
                      Estimasi Durasi Kuras
                    </dt>
                    <dd className="mt-0.5 text-sm font-bold text-white font-[var(--font-mono)] tabular-nums">
                      {formatDuration(floodResult.hoursRequired)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-slate-400">
                      Total Kebutuhan Solar
                    </dt>
                    <dd className="mt-0.5 text-sm font-bold text-[#34d399] font-[var(--font-mono)] tabular-nums">
                      {floodResult.totalFuelLiters!.toFixed(1)} L
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-slate-400">
                      Estimasi Total Biaya BBM
                    </dt>
                    <dd className="mt-0.5 text-sm font-bold text-[#f59e0b] font-[var(--font-mono)] tabular-nums">
                      {formatRupiah(floodResult.totalFuelCostIdr!)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-slate-400">
                      Isi Ulang Tangki (14 L)
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-slate-200 font-[var(--font-mono)] tabular-nums">
                      ~{Math.ceil(floodResult.tankRefills14L!)}× isi
                    </dd>
                  </div>
                  <div className="col-span-2 flex items-center justify-between border-t border-white/8 pt-2 text-[11px]">
                    <span className="text-slate-400">
                      Biaya Pompa per m³ Air
                    </span>
                    <span className="font-[var(--font-mono)] font-semibold text-slate-200 tabular-nums">
                      {formatRupiah(floodResult.costPerM3Idr!)} / m³
                    </span>
                  </div>
                </dl>
              )}
            </div>
          </div>

          <div className="border-t border-white/10 bg-[#0b1017] px-4 py-2 text-[10px] text-slate-400 flex items-center justify-between">
            <span>Geser Throttle / Muka Air untuk simulasi</span>
            <span className="font-[var(--font-mono)] text-slate-500">
              ESC / K
            </span>
          </div>
        </aside>
      )}

      {/* =================================================================== */}
      {/* UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK (ZERO VIEWPORT OCCLUSION)   */}
      {/* =================================================================== */}
      <div
        className={`pointer-events-none fixed bottom-3.5 left-1/2 z-20 w-[min(1060px,96vw)] -translate-x-1/2 transition-transform duration-300 ease-out ${
          dockCollapsed ? 'translate-y-[calc(100%-28px)]' : 'translate-y-0'
        }`}
      >
        {/* Collapse / Expand Tab (Zen Mode) */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onToggleDock}
            className="pointer-events-auto flex items-center gap-1.5 rounded-t-md border border-b-0 border-white/12 bg-[#0e131b]/92 px-3.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Toggle controls (Press H)"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 text-[#e59a1a]" />
                <span>Show Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                <span>Hide Controls</span>
              </>
            )}
          </button>
        </div>

        {/* Main Consolidated Control Bar */}
        <div
          className={`pointer-events-auto rounded-xl p-3 sm:p-3.5 shadow-2xl ${panelBg}`}
        >
          {/* Row 1: RPM Throttle Slider | Canal Water Level (Tanggul) | Exploded View */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:items-center">
            {/* Throttle Control */}
            <div
              className={`${
                isTanggul ? 'md:col-span-5' : 'md:col-span-7'
              } flex flex-col gap-1.5`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium text-slate-200 whitespace-nowrap">
                  <span>Throttle</span>
                  <span className="font-[var(--font-mono)] text-xs font-semibold text-white tabular-nums">
                    {config.targetRpm} RPM
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {RPM_STOPS.map((stop) => {
                    const active = Math.abs(config.targetRpm - stop.value) < 35;
                    return (
                      <button
                        key={stop.label}
                        type="button"
                        onClick={() => onConfigChange({ targetRpm: stop.value })}
                        className={`rounded px-2 py-0.5 text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#c81d25] text-white'
                            : 'bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white'
                        }`}
                      >
                        {stop.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <input
                type="range"
                min={0}
                max={2200}
                step={20}
                value={config.targetRpm}
                onChange={(e) =>
                  onConfigChange({ targetRpm: Number(e.target.value) })
                }
                aria-label="Engine Throttle RPM"
                className="industrial-slider w-full"
              />
            </div>

            {/* Live Canal Water Level Slider (Tanggul Mode) */}
            {isTanggul && (
              <div className="md:col-span-4 flex flex-col gap-1.5 md:border-l md:border-white/10 md:pl-3.5">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200 whitespace-nowrap">
                    <Waves className="h-3.5 w-3.5 text-[#38bdf8]" />
                    <span>Air Kanal</span>
                    <span className="font-[var(--font-mono)] text-[11px] text-[#7dd3fc] tabular-nums">
                      {telemetry.submergenceCm >= 0 ? '+' : ''}
                      {Math.round(telemetry.submergenceCm)}cm
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {CANAL_LEVEL_PRESETS.map((lvl) => {
                      const active =
                        Math.abs(config.canalWaterY - lvl.value) < 0.06;
                      return (
                        <button
                          key={lvl.label}
                          type="button"
                          onClick={() =>
                            onConfigChange({ canalWaterY: lvl.value })
                          }
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                            active
                              ? lvl.label === 'Surut'
                                ? 'bg-red-600 text-white'
                                : lvl.label === 'Vortex'
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-[#0284c7] text-white'
                              : 'bg-white/6 text-slate-300 hover:bg-white/12 hover:text-white'
                          }`}
                        >
                          {lvl.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <input
                  type="range"
                  min={-110}
                  max={-20}
                  step={1}
                  value={Math.round(config.canalWaterY * 100)}
                  onChange={(e) =>
                    onConfigChange({
                      canalWaterY: Number(e.target.value) / 100,
                    })
                  }
                  aria-label="Elevasi Muka Air Kanal"
                  className="industrial-slider w-full"
                />
              </div>
            )}

            {/* Exploded View Slider */}
            <div
              className={`${
                isTanggul ? 'md:col-span-3' : 'md:col-span-5'
              } flex flex-col gap-1.5 md:border-l md:border-white/10 md:pl-3.5`}
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-200 whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-[#e59a1a]" />
                  <span>Exploded</span>
                </span>
                <span className="font-[var(--font-mono)] text-xs text-slate-300 tabular-nums">
                  {Math.round(config.explodedAmount * 100)}%
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(config.explodedAmount * 100)}
                onChange={(e) =>
                  onConfigChange({
                    explodedAmount: Number(e.target.value) / 100,
                  })
                }
                aria-label="Exploded View Percentage"
                className="industrial-slider amber-thumb w-full"
              />
            </div>
          </div>

          {/* Row 2: Inspection Toggles, Stage & Time-of-Day, Drawers & Camera Presets */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
            {/* Left Cluster: Technical & Operational Controls */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* X-Ray Cutaway */}
              <button
                type="button"
                onClick={() =>
                  onConfigChange({ xrayEnabled: !config.xrayEnabled })
                }
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  config.xrayEnabled
                    ? 'bg-[#0ea5e9]/20 border-[#38bdf8]/60 text-[#7dd3fc]'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Eye className="h-3.5 w-3.5" />
                <span>X-Ray</span>
              </button>

              {/* Water Discharge Flow */}
              <button
                type="button"
                onClick={() =>
                  onConfigChange({ waterFlowEnabled: !config.waterFlowEnabled })
                }
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  config.waterFlowEnabled
                    ? 'bg-[#0ea5e9]/20 border-[#38bdf8]/60 text-[#7dd3fc]'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Droplets className="h-3.5 w-3.5" />
                <span>Aliran Air</span>
              </button>

              {/* Blue Corrugated Discharge Hose */}
              <button
                type="button"
                onClick={() =>
                  onConfigChange({
                    dischargeHoseAttached: !config.dischargeHoseAttached,
                  })
                }
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  config.dischargeHoseAttached
                    ? 'bg-[#2563eb]/25 border-[#60a5fa]/65 text-blue-200'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                title="Pasang atau lepas Selang Buang spiral biru"
              >
                <Waves className="h-3.5 w-3.5" />
                <span>Selang</span>
              </button>

              {/* 3D CAD Engineering Dimensions Overlay */}
              <button
                type="button"
                onClick={() =>
                  onConfigChange({
                    cadDimensionsVisible: !config.cadDimensionsVisible,
                  })
                }
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  config.cadDimensionsVisible
                    ? 'bg-[#e59a1a]/22 border-[#f5b027]/70 text-amber-200'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                title="Tampilkan garis ukuran CAD 3D (Tekan D)"
              >
                <Ruler className="h-3.5 w-3.5" />
                <span>Dimensi CAD</span>
              </button>

              {/* K3 Safety V-Belt Mesh Guard */}
              <button
                type="button"
                onClick={() =>
                  onConfigChange({
                    beltGuardVisible: !config.beltGuardVisible,
                  })
                }
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  config.beltGuardVisible
                    ? 'bg-[#e59a1a]/22 border-[#f5b027]/70 text-amber-200'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                title="Tutup/buka pelindung K3 V-Belt (Tekan G)"
              >
                <Shield className="h-3.5 w-3.5" />
                <span>Belt Guard</span>
              </button>

              {/* Flood Drainage & Fuel Cost Calculator Drawer */}
              <button
                type="button"
                onClick={() => onToggleDrawer('calculator')}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  rightDrawer === 'calculator'
                    ? 'bg-emerald-500/22 border-emerald-400/65 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                title="Buka Kalkulator Banjir & Biaya Solar (Tekan K)"
              >
                <Calculator className="h-3.5 w-3.5" />
                <span>Kalkulator</span>
              </button>

              {/* Interactive BOM Parts List Drawer */}
              <button
                type="button"
                onClick={() => onToggleDrawer('bom')}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  rightDrawer === 'bom'
                    ? 'bg-[#c81d25]/28 border-[#e59a1a]/70 text-amber-200'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                title="Buka Daftar Part BOM (Tekan B)"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span>Daftar Part</span>
              </button>

              {/* 3D Engineering Callouts */}
              <button
                type="button"
                onClick={() =>
                  onConfigChange({ calloutsVisible: !config.calloutsVisible })
                }
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  config.calloutsVisible
                    ? 'bg-white/14 border-white/30 text-white'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
                title="Tampilkan pin info komponen"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>Pin</span>
              </button>

              {/* Procedural Diesel & Water Audio */}
              <button
                type="button"
                onClick={() =>
                  onConfigChange({ audioMuted: !config.audioMuted })
                }
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  !config.audioMuted
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-label={
                  config.audioMuted
                    ? 'Nyalakan suara mesin diesel dan air'
                    : 'Matikan suara'
                }
              >
                {config.audioMuted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
                <span className="hidden xl:inline">
                  {config.audioMuted ? 'Mute' : 'Audio'}
                </span>
              </button>
            </div>

            {/* Right Cluster: Stage Mode + Time of Day + Camera View Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Stage Mode: Tanggul | Studio | Field */}
              <div
                className="flex items-center rounded-md border border-white/10 bg-black/35 p-0.5"
                role="group"
                aria-label="Environment Stage Mode"
              >
                {(
                  [
                    { id: 'tanggul', label: 'Tanggul' },
                    { id: 'studio', label: 'Studio' },
                    { id: 'field', label: 'Field' },
                  ] as Array<{ id: StageMode; label: string }>
                ).map((st) => {
                  const active = config.stageMode === st.id;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => onConfigChange({ stageMode: st.id })}
                      className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? st.id === 'tanggul'
                            ? 'bg-[#c81d25] text-white'
                            : 'bg-slate-200 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {st.id === 'tanggul' && (
                        <Mountain className="h-3 w-3" />
                      )}
                      <span>{st.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Time of Day: Siang | Sore | Malam (Outdoor Lighting + Night Tripod Lamp) */}
              {config.stageMode !== 'studio' && (
                <div
                  className="flex items-center rounded-md border border-white/10 bg-black/35 p-0.5"
                  role="group"
                  aria-label="Waktu dan Pencahayaan Lapangan"
                >
                  {TIME_OPTIONS.map((t) => {
                    const active = config.timeOfDay === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => onConfigChange({ timeOfDay: t.id })}
                        className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          active
                            ? t.id === 'night'
                              ? 'bg-[#1d4ed8] text-white'
                              : t.id === 'dusk'
                                ? 'bg-[#d97706] text-white'
                                : 'bg-slate-200 text-slate-950'
                            : 'text-slate-400 hover:text-white'
                        }`}
                        title={
                          t.id === 'night'
                            ? 'Mode Malam dengan Menara Lampu Sorot LED'
                            : undefined
                        }
                      >
                        {t.id === 'day' && <Sun className="h-3 w-3" />}
                        {t.id === 'dusk' && <Sunset className="h-3 w-3" />}
                        {t.id === 'night' && <Moon className="h-3 w-3" />}
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Camera Presets */}
              <div className="flex flex-wrap items-center gap-1 border-l border-white/10 pl-1.5">
                <Camera className="mr-0.5 hidden sm:block h-3.5 w-3.5 text-slate-400" />
                {PRESET_LIST.map((presetId) => {
                  const preset = CAMERA_PRESETS[presetId];
                  const active = activePreset === presetId;
                  return (
                    <button
                      key={presetId}
                      type="button"
                      onClick={() => onSelectPreset(presetId)}
                      className={`rounded-md px-2 py-1 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        active
                          ? 'bg-white/18 text-white ring-1 ring-white/25'
                          : 'bg-white/4 text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Subtle keyboard / orbit micro-hint */}
          <div className="mt-2 hidden sm:flex items-center justify-between text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Info className="h-3 w-3" />
              <span>Drag orbit · Scroll zoom · Right-drag pan</span>
            </span>
            <span>
              H Kontrol · X X-Ray · D Dimensi CAD · G Belt Guard · K Kalkulator
              · B BOM
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
