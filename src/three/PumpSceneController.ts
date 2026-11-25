import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BomPartItem,
  CAMERA_PRESETS,
  CameraPresetId,
  computeTelemetry,
  HotspotId,
  ProjectedDimension,
  ProjectedHotspot,
  ShowcaseConfig,
  StageMode,
  TelemetryData,
  TimeOfDay,
} from '../types';
import { buildCadDimensionsOverlay } from './cadDimensionsBuilder';
import { buildMobileChassis } from './chassisBuilder';
import { buildDongfengEngine } from './engineBuilder';
import { createFluidAndFxSystem } from './fluidAndFx';
import { createMaterialLibrary } from './materials';
import { buildAxialPump } from './pumpBuilder';
import { createStageManager } from './stageManager';
import { createProceduralTextures } from './textures';

export interface SceneCallbacks {
  onTelemetry: (data: TelemetryData) => void;
  onHotspotsProjected: (points: ProjectedHotspot[]) => void;
  onDimensionsProjected: (dims: ProjectedDimension[]) => void;
  onContextLost: () => void;
  onContextRestored: () => void;
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class PumpSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private callbacks: SceneCallbacks;

  private textures: ReturnType<typeof createProceduralTextures>;
  private materials: ReturnType<typeof createMaterialLibrary>;
  private engine: ReturnType<typeof buildDongfengEngine>;
  private pump: ReturnType<typeof buildAxialPump>;
  private fx: ReturnType<typeof createFluidAndFxSystem>;
  private stage: ReturnType<typeof createStageManager>;
  private cadDimensions: ReturnType<typeof buildCadDimensionsOverlay>;

  // Live config targets & damped state
  private config: ShowcaseConfig;
  private currentRpm: number;
  private currentCanalWaterY: number;
  private currentXray = 0;
  private currentExplode = 0;
  private crankAngle = 0;
  private elapsedTime = 0;

  // Camera transition state
  private camTransitionActive = false;
  private camTargetPos = new THREE.Vector3();
  private camTargetLook = new THREE.Vector3();

  // Loop & timing state
  private frameId = 0;
  private disposed = false;
  private lastNow = performance.now();
  private telemetryTimer = 0;

  // Reusable scratch objects (zero per-frame GC)
  private readonly _exhaustWorld = new THREE.Vector3();
  private readonly _projVec = new THREE.Vector3();
  private readonly _hotspotAnchors: Record<HotspotId, THREE.Object3D>;
  private readonly _projectedBuffer: ProjectedHotspot[];
  private readonly _projectedDimsBuffer: ProjectedDimension[];

  private resizeObserver: ResizeObserver;
  private onContextLostBound: (e: Event) => void;
  private onContextRestoredBound: () => void;

  constructor(
    container: HTMLElement,
    initialConfig: ShowcaseConfig,
    callbacks: SceneCallbacks,
  ) {
    this.container = container;
    this.config = { ...initialConfig };
    this.currentRpm = initialConfig.targetRpm;
    this.currentCanalWaterY = initialConfig.canalWaterY;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    // 1. WebGLRenderer with ACESFilmicToneMapping & software WebGL guard
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Studio PMREM Environment Map (on every device for true metallic highlights)
    this.scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3. Camera & Smooth Damped OrbitControls
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.08, 90);
    const overview = CAMERA_PRESETS.overview;
    this.camera.position.set(...overview.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...overview.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 0.75;
    this.controls.maxDistance = 18.5;
    this.controls.maxPolarAngle = Math.PI * 0.54;
    this.controls.update();

    // Cancel scripted camera presets immediately if the user drags or scrolls
    this.controls.addEventListener('start', () => {
      this.camTransitionActive = false;
    });

    // 4. Procedural Textures, PBR Materials & Custom Shaders
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.textures = createProceduralTextures(maxAniso);
    this.materials = createMaterialLibrary(this.textures, this.isSoftwareGl);

    // 5. Build Stage & Full Mechanical Rig
    this.stage = createStageManager(this.scene, this.textures, this.isSoftwareGl);
    this.stage.setAtmosphere(initialConfig.stageMode, initialConfig.timeOfDay);

    const rigRoot = new THREE.Group();
    rigRoot.name = 'DongfengAxialPumpRig';
    this.scene.add(rigRoot);

    const chassis = buildMobileChassis(this.materials);
    this.engine = buildDongfengEngine(this.materials);
    this.pump = buildAxialPump(this.materials);
    this.fx = createFluidAndFxSystem(this.materials, this.textures);
    this.cadDimensions = buildCadDimensionsOverlay();

    rigRoot.add(
      chassis.root,
      this.engine.root,
      this.pump.root,
      this.fx.root,
      this.cadDimensions.root,
    );

    // 6. Wire Hotspot & CAD Dimension Anchors
    const pumpAnchors = this.pump.getHotspotAnchors();
    this._hotspotAnchors = {
      engine: this.engine.hotspotAnchor,
      vbelt: pumpAnchors.vbelt,
      kopel: pumpAnchors.kopel,
      discharge: pumpAnchors.discharge,
      propeller: pumpAnchors.propeller,
    };

    const hotspotIds: HotspotId[] = [
      'engine',
      'vbelt',
      'kopel',
      'discharge',
      'propeller',
    ];
    this._projectedBuffer = hotspotIds.map((id) => ({
      id,
      x: 0,
      y: 0,
      visible: false,
    }));

    this._projectedDimsBuffer = this.cadDimensions.getAnchors().map((a) => ({
      id: a.id,
      label: '',
      sublabel: '',
      x: 0,
      y: 0,
      visible: false,
      accent: a.accent,
    }));

    // Pre-warm shaders once on hardware GPUs
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 7. Resize & WebGL Context Recovery Handlers
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.onContextLostBound = (e: Event) => {
      e.preventDefault();
      this.callbacks.onContextLost();
    };
    this.onContextRestoredBound = () => {
      this.callbacks.onContextRestored();
    };
    this.renderer.domElement.addEventListener(
      'webglcontextlost',
      this.onContextLostBound,
    );
    this.renderer.domElement.addEventListener(
      'webglcontextrestored',
      this.onContextRestoredBound,
    );

    // Start animation loop
    this.lastNow = performance.now();
    this.tick();
  }

  private handleResize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public updateConfig(next: ShowcaseConfig) {
    const prevStage: StageMode = this.config.stageMode;
    const prevTimeOfDay: TimeOfDay = this.config.timeOfDay;
    const prevCad = this.config.cadDimensionsVisible;
    this.config = { ...next };

    if (next.stageMode !== prevStage || next.timeOfDay !== prevTimeOfDay) {
      this.stage.setAtmosphere(next.stageMode, next.timeOfDay);
    }

    if (prevCad && !next.cadDimensionsVisible) {
      this.callbacks.onDimensionsProjected([]);
    }
  }

  public flyToPreset(presetId: CameraPresetId) {
    const preset = CAMERA_PRESETS[presetId];
    if (!preset) return;

    if (presetId === 'discharge' && this.config.stageMode !== 'tanggul') {
      this.camTargetPos.set(-4.85, 0.85, 3.15);
      this.camTargetLook.set(-2.25, -0.22, 0.38);
    } else {
      this.camTargetPos.set(...preset.position);
      this.camTargetLook.set(...preset.target);
    }
    this.camTransitionActive = true;
  }

  public focusBomItem(item: BomPartItem) {
    if (item.id === 'c-selang' && this.config.stageMode !== 'tanggul') {
      this.camTargetPos.set(-4.65, 0.78, 2.95);
      this.camTargetLook.set(-2.20, -0.20, 0.38);
    } else {
      this.camTargetPos.set(...item.cameraPos);
      this.camTargetLook.set(...item.cameraTarget);
    }
    this.camTransitionActive = true;
  }

  public getCurrentRpm(): number {
    return this.currentRpm;
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private projectHotspots() {
    if (!this.config.calloutsVisible) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    let changed = false;

    for (let i = 0; i < this._projectedBuffer.length; i++) {
      const item = this._projectedBuffer[i];
      const anchor = this._hotspotAnchors[item.id];
      anchor.getWorldPosition(this._projVec);
      this._projVec.project(this.camera);

      const visible =
        this._projVec.z >= -1 &&
        this._projVec.z <= 1 &&
        this._projVec.x >= -1.05 &&
        this._projVec.x <= 1.05 &&
        this._projVec.y >= -1.05 &&
        this._projVec.y <= 1.05;

      const sx = Math.round((this._projVec.x * 0.5 + 0.5) * width);
      const sy = Math.round((-this._projVec.y * 0.5 + 0.5) * height);

      if (
        Math.abs(item.x - sx) >= 1 ||
        Math.abs(item.y - sy) >= 1 ||
        item.visible !== visible
      ) {
        item.x = sx;
        item.y = sy;
        item.visible = visible;
        changed = true;
      }
    }

    if (changed) {
      this.callbacks.onHotspotsProjected(
        this._projectedBuffer.map((p) => ({ ...p })),
      );
    }
  }

  private projectDimensions() {
    if (!this.config.cadDimensionsVisible) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const anchors = this.cadDimensions.getAnchors();
    let changed = false;

    for (let i = 0; i < anchors.length; i++) {
      const def = anchors[i];
      const item = this._projectedDimsBuffer[i];
      def.anchor.getWorldPosition(this._projVec);
      this._projVec.project(this.camera);

      const visible =
        this._projVec.z >= -1 &&
        this._projVec.z <= 1 &&
        this._projVec.x >= -1.04 &&
        this._projVec.x <= 1.04 &&
        this._projVec.y >= -1.04 &&
        this._projVec.y <= 1.04;

      const sx = Math.round((this._projVec.x * 0.5 + 0.5) * width);
      const sy = Math.round((-this._projVec.y * 0.5 + 0.5) * height);
      const text = def.getLabel(this.config.stageMode, this.currentCanalWaterY);

      if (
        Math.abs(item.x - sx) >= 1 ||
        Math.abs(item.y - sy) >= 1 ||
        item.visible !== visible ||
        item.label !== text.label ||
        item.sublabel !== text.sublabel
      ) {
        item.x = sx;
        item.y = sy;
        item.visible = visible;
        item.label = text.label;
        item.sublabel = text.sublabel;
        changed = true;
      }
    }

    if (changed) {
      this.callbacks.onDimensionsProjected(
        this._projectedDimsBuffer.map((d) => ({ ...d })),
      );
    }
  }

  private tick = () => {
    if (this.disposed) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastNow) / 1000, 0.08);
    this.lastNow = now;
    this.elapsedTime += dt;

    // 1. Frame-rate independent exponential damping for RPM, Canal Water Level, X-Ray & Exploded View
    this.currentRpm = THREE.MathUtils.damp(
      this.currentRpm,
      this.config.targetRpm,
      4.5,
      dt,
    );
    if (Math.abs(this.currentRpm - this.config.targetRpm) < 0.5) {
      this.currentRpm = this.config.targetRpm;
    }

    this.currentCanalWaterY = THREE.MathUtils.damp(
      this.currentCanalWaterY,
      this.config.canalWaterY,
      6.0,
      dt,
    );

    this.currentXray = THREE.MathUtils.damp(
      this.currentXray,
      this.config.xrayEnabled ? 1 : 0,
      7.0,
      dt,
    );

    this.currentExplode = THREE.MathUtils.damp(
      this.currentExplode,
      this.config.explodedAmount,
      6.5,
      dt,
    );

    // Compute live hydraulic & cavitation state for synchronized 3D FX and HUD
    const liveTelemetry = computeTelemetry(
      this.currentRpm,
      this.config.waterFlowEnabled,
      this.currentCanalWaterY,
      this.config.stageMode,
    );

    // 2. Advance Crankshaft Angle (scaled cleanly so high RPM stays visually readable without strobing)
    const visualRadPerSec = (this.currentRpm / 2200) * 30.0;
    this.crankAngle += visualRadPerSec * dt;

    // 3. Update Engine, Pump, Stage Atmosphere/Water, CAD Dimensions & Fluid/Exhaust FX
    this.engine.updateKinematics(
      this.crankAngle,
      this.currentRpm,
      this.elapsedTime,
      this.currentXray,
      this.currentExplode,
    );

    this.pump.updateKinematics(
      this.crankAngle,
      this.currentRpm,
      this.currentXray,
      this.currentExplode,
      this.config.waterFlowEnabled,
      this.config.dischargeHoseAttached,
      this.config.beltGuardVisible,
      liveTelemetry.cavitationEfficiency,
      this.config.stageMode,
      this.elapsedTime,
    );

    this.stage.update(
      this.elapsedTime,
      this.currentRpm,
      this.config.waterFlowEnabled,
      this.currentCanalWaterY,
      liveTelemetry.cavitationState,
    );

    this.cadDimensions.update(
      this.config.cadDimensionsVisible,
      this.config.stageMode,
      this.currentCanalWaterY,
      this.currentExplode,
    );

    this.engine.exhaustTipWorldAnchor.getWorldPosition(this._exhaustWorld);
    this.fx.update(
      dt,
      this.elapsedTime,
      this.currentRpm,
      this.config.waterFlowEnabled,
      this.config.dischargeHoseAttached,
      this.config.stageMode,
      this.config.timeOfDay,
      this.currentCanalWaterY,
      liveTelemetry.cavitationState,
      liveTelemetry.cavitationEfficiency,
      liveTelemetry.loadHp,
      this.currentExplode,
      this._exhaustWorld,
    );

    // 4. Smooth Camera Preset Interpolation (auto-cancels upon arrival)
    if (this.camTransitionActive) {
      const camFactor = 1 - Math.exp(-5.5 * dt);
      this.camera.position.lerp(this.camTargetPos, camFactor);
      this.controls.target.lerp(this.camTargetLook, camFactor);

      if (
        this.camera.position.distanceToSquared(this.camTargetPos) < 0.0004 &&
        this.controls.target.distanceToSquared(this.camTargetLook) < 0.0004
      ) {
        this.camera.position.copy(this.camTargetPos);
        this.controls.target.copy(this.camTargetLook);
        this.camTransitionActive = false;
      }
    }

    this.controls.update();

    // 5. Render Scene
    this.renderer.render(this.scene, this.camera);

    // 6. Project 3D Callout Hotspots, CAD Dimensions & Throttle Telemetry Callback (~15 Hz)
    this.projectHotspots();
    this.projectDimensions();
    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.065) {
      this.telemetryTimer = 0;
      this.callbacks.onTelemetry(liveTelemetry);
    }

    // 7. Schedule Next Frame (GPU rAF vs Software WebGL afterDraw pacing)
    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onContextLostBound,
    );
    this.renderer.domElement.removeEventListener(
      'webglcontextrestored',
      this.onContextRestoredBound,
    );
    this.controls.dispose();
    this.pump.dispose();
    this.cadDimensions.dispose();
    this.fx.dispose();
    this.stage.dispose();
    this.materials.dispose();
    this.textures.dispose();
    if (this.scene.environment) {
      this.scene.environment.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
