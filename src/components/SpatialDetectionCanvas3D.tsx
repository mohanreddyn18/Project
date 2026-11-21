import { Box, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BoundingBoxItem } from '../types/vision';
import { detectSoftwareWebGL, isWebGLSupported, scheduleAfterDraw } from '../utils/webgl';

interface SpatialDetectionCanvas3DProps {
  imageUrl: string | null;
  boxes: BoundingBoxItem[];
  highlightedId?: string | null;
  onSelectBox?: (id: string) => void;
  onClearHighlight?: () => void;
  showLabels?: boolean;
  loading?: boolean;
  scanLabel?: string;
}

type CameraPreset = 'iso' | 'front' | 'side';

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  iso: { pos: [3.2, 2.25, 4.75], target: [0, 1.55, 0.25] },
  front: { pos: [0, 1.65, 5.5], target: [0, 1.55, 0.15] },
  side: { pos: [4.85, 1.85, 2.2], target: [0, 1.55, 0.35] },
};

const COLOR_HEX: Record<BoundingBoxItem['color'], { main: number; hex: string; text: string }> = {
  red: { main: 0xef4444, hex: '#dc2626', text: '#ffffff' },
  blue: { main: 0x3b82f6, hex: '#2563eb', text: '#ffffff' },
  emerald: { main: 0x10b981, hex: '#059669', text: '#ffffff' },
  amber: { main: 0xf59e0b, hex: '#f59e0b', text: '#0f172a' },
  slate: { main: 0x94a3b8, hex: '#334155', text: '#ffffff' },
};

// Reusable module-scope math temporaries (zero GC in render loop)
const _tmpCamPos = new THREE.Vector3();
const _tmpTargetPos = new THREE.Vector3();
const _rayMouse = new THREE.Vector2();

function createLabelTexture(label: string, sublabel: string | undefined, bgHex: string, textHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark outer pill-free technical tag frame
    ctx.fillStyle = bgHex;
    ctx.fillRect(4, 10, canvas.width - 8, canvas.height - 20);

    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 10, canvas.width - 8, canvas.height - 20);

    ctx.fillStyle = textHex;
    ctx.font = '700 32px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    const fullText = sublabel ? `${label} · ${sublabel}` : label;
    const clipped = fullText.length > 28 ? `${fullText.slice(0, 27)}…` : fullText;
    ctx.fillText(clipped, 24, canvas.height / 2 + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    grad.addColorStop(0, 'rgba(2, 6, 23, 0.72)');
    grad.addColorStop(0.55, 'rgba(2, 6, 23, 0.28)');
    grad.addColorStop(1, 'rgba(2, 6, 23, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

interface PrismRecord {
  id: string;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  fillMat: THREE.MeshPhysicalMaterial;
  edgeMat: THREE.LineBasicMaterial;
  strutMat: THREE.MeshStandardMaterial;
  labelMesh: THREE.Mesh;
  baseDepth: number;
  orderIndex: number;
  currentZ: number;
  currentScale: number;
}

export function SpatialDetectionCanvas3D({
  imageUrl,
  boxes,
  highlightedId,
  onSelectBox,
  onClearHighlight,
  showLabels = true,
  loading = false,
  scanLabel = 'Scanning 3D spatial volume...',
}: SpatialDetectionCanvas3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [depthRatio, setDepthRatio] = useState(0.62);
  const [preset, setPreset] = useState<CameraPreset>('iso');
  const [autoOrbit, setAutoOrbit] = useState(false);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [webGlAvailable] = useState(() => isWebGLSupported());

  // Mutable refs so scene stays mounted smoothly across React state changes
  const propsRef = useRef({
    boxes,
    highlightedId,
    showLabels,
    loading,
    depthRatio,
    autoOrbit,
    onSelectBox,
    onClearHighlight,
  });
  propsRef.current = {
    boxes,
    highlightedId,
    showLabels,
    loading,
    depthRatio,
    autoOrbit,
    onSelectBox,
    onClearHighlight,
  };

  const sceneActionsRef = useRef<{
    rebuildPrisms: () => void;
    loadImageTexture: (url: string | null) => void;
    triggerCameraPreset: (p: CameraPreset) => void;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    if (!webGlAvailable) return;
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 380);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.042);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 60);
    camera.position.set(...CAMERA_PRESETS.iso.pos);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Procedural Studio Environment Map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // 3-Point Warm / Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xbfdbfe, 0x0f172a, 0.95);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.85);
    keyLight.position.set(4.5, 6.5, 5.0);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -4.5;
    keyLight.shadow.camera.right = 4.5;
    keyLight.shadow.camera.top = 4.5;
    keyLight.shadow.camera.bottom = -4.5;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.95);
    rimLight.position.set(-4.5, 3.8, -3.5);
    scene.add(rimLight);

    // Calibrated Studio Floor & Grid
    const floorGeo = new THREE.PlaneGeometry(36, 36);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b101b,
      roughness: 0.78,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(18, 24, 0x3b82f6, 0x1e293b);
    grid.position.y = 0.008;
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMats.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.48;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -1;
    });
    scene.add(grid);

    const shadowTex = createContactShadowTexture();
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.8, 3.4),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
      }),
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.015;
    scene.add(contactShadow);

    // Composite Optical Calibration Rig (Group)
    const rigGroup = new THREE.Group();
    scene.add(rigGroup);

    const plateDimensions = { width: 3.8, height: 2.55 };
    const rigBaseY = 1.55;

    const frameMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.28,
      clearcoat: 0.4,
    });
    const backingMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.4,
      roughness: 0.65,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
      metalness: 0.05,
    });

    const plateMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMat);
    plateMesh.position.set(0, rigBaseY, 0.045);
    rigGroup.add(plateMesh);

    const backingMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.07), backingMat);
    backingMesh.position.set(0, rigBaseY, 0);
    backingMesh.castShadow = true;
    backingMesh.receiveShadow = true;
    rigGroup.add(backingMesh);

    // Frame rails + pedestal
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.12), frameMat);
    const botRail = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.12), frameMat);
    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.12), frameMat);
    const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.12), frameMat);
    [topRail, botRail, leftRail, rightRail].forEach((m) => {
      m.castShadow = true;
      rigGroup.add(m);
    });

    const pedestalStem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.35, 16), frameMat);
    pedestalStem.castShadow = true;
    rigGroup.add(pedestalStem);

    const pedestalFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.06, 32), frameMat);
    pedestalFoot.position.set(0, 0.03, 0);
    pedestalFoot.castShadow = true;
    pedestalFoot.receiveShadow = true;
    rigGroup.add(pedestalFoot);

    // 3D Laser Scan Plane
    const scanGroup = new THREE.Group();
    const scanSheetMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const scanBarMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
    const scanSheet = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), scanSheetMat);
    scanSheet.rotation.x = Math.PI / 2;
    const scanBar = new THREE.Mesh(new THREE.BoxGeometry(4.22, 0.025, 0.03), scanBarMat);
    scanBar.position.z = 0.45;
    scanGroup.add(scanSheet, scanBar);
    scanGroup.visible = false;
    rigGroup.add(scanGroup);

    const syncRigGeometry = (w: number, h: number) => {
      plateDimensions.width = w;
      plateDimensions.height = h;
      plateMesh.scale.set(w, h, 1);
      backingMesh.scale.set(w, h, 1);
      topRail.scale.set(w + 0.16, 1, 1);
      topRail.position.set(0, rigBaseY + h / 2 + 0.04, 0.01);
      botRail.scale.set(w + 0.16, 1, 1);
      botRail.position.set(0, rigBaseY - h / 2 - 0.04, 0.01);
      leftRail.scale.set(1, h, 1);
      leftRail.position.set(-w / 2 - 0.04, rigBaseY, 0.01);
      rightRail.scale.set(1, h, 1);
      rightRail.position.set(w / 2 + 0.04, rigBaseY, 0.01);
      const bottomY = rigBaseY - h / 2 - 0.08;
      const stemH = Math.max(0.12, bottomY - 0.05);
      pedestalStem.scale.set(1, stemH / 0.35, 1);
      pedestalStem.position.set(0, 0.05 + stemH / 2, 0);
      scanSheet.scale.set((w + 0.35) / 4.2, 1, 1);
      scanBar.scale.set((w + 0.35) / 4.22, 1, 1);
    };
    syncRigGeometry(3.8, 2.55);

    // Detection volumes container
    const detectionsGroup = new THREE.Group();
    rigGroup.add(detectionsGroup);
    let prismRecords: PrismRecord[] = [];
    const disposableTextures: THREE.Texture[] = [];

    const clearPrisms = () => {
      prismRecords.forEach((rec) => {
        detectionsGroup.remove(rec.group);
        rec.group.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
            obj.geometry.dispose();
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => m.dispose());
          }
        });
      });
      disposableTextures.forEach((t) => t.dispose());
      disposableTextures.length = 0;
      prismRecords = [];
    };

    const rebuildPrisms = () => {
      clearPrisms();
      const { boxes: curBoxes, showLabels: curShowLabels } = propsRef.current;
      const w = plateDimensions.width;
      const h = plateDimensions.height;

      curBoxes.forEach((item, idx) => {
        const [ymin, xmin, ymax, xmax] = item.box_2d;
        const bw = Math.max(0.08, ((xmax - xmin) / 1000) * w);
        const bh = Math.max(0.08, ((ymax - ymin) / 1000) * h);
        const cx = ((xmin + xmax) / 2000 - 0.5) * w;
        const cy = rigBaseY + (0.5 - (ymin + ymax) / 2000) * h;

        const palette = COLOR_HEX[item.color];
        const baseDepth = 0.24 + Math.min(0.28, (bw * bh) * 0.08);
        const prismGroup = new THREE.Group();
        prismGroup.position.set(cx, cy, 0.06);

        const boxGeo = new THREE.BoxGeometry(bw, bh, baseDepth);
        const fillMat = new THREE.MeshPhysicalMaterial({
          color: palette.main,
          emissive: palette.main,
          emissiveIntensity: 0.22,
          transparent: true,
          opacity: 0.2,
          roughness: 0.18,
          metalness: 0.1,
          depthWrite: false,
        });
        const hitMesh = new THREE.Mesh(boxGeo, fillMat);
        hitMesh.userData.boxId = item.id;
        hitMesh.position.z = baseDepth / 2;
        prismGroup.add(hitMesh);

        const edgesGeo = new THREE.EdgesGeometry(boxGeo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: palette.main,
          transparent: true,
          opacity: 0.95,
        });
        const edges = new THREE.LineSegments(edgesGeo, edgeMat);
        edges.position.z = baseDepth / 2;
        prismGroup.add(edges);

        // Corner depth struts tying volume to plate
        const strutGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 6);
        strutGeo.rotateX(Math.PI / 2);
        const strutMat = new THREE.MeshStandardMaterial({
          color: palette.main,
          emissive: palette.main,
          emissiveIntensity: 0.25,
          transparent: true,
          opacity: 0.48,
        });
        const cornerOffsets: [number, number][] = [
          [-bw / 2, bh / 2],
          [bw / 2, bh / 2],
          [-bw / 2, -bh / 2],
          [bw / 2, -bh / 2],
        ];
        cornerOffsets.forEach(([ox, oy]) => {
          const strut = new THREE.Mesh(strutGeo.clone(), strutMat);
          strut.position.set(ox, oy, -0.1);
          strut.scale.set(1, 1, 0.25);
          strut.name = 'depth-strut';
          prismGroup.add(strut);
        });
        strutGeo.dispose();

        // Floating crisp CanvasTexture plaque
        const labelTex = createLabelTexture(item.label, item.sublabel, palette.hex, palette.text);
        labelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        disposableTextures.push(labelTex);
        const labelMat = new THREE.MeshBasicMaterial({
          map: labelTex,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const labelW = Math.min(1.15, Math.max(0.55, bw * 1.15));
        const labelH = labelW * (96 / 512);
        const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(labelW, labelH), labelMat);
        labelMesh.position.set(0, bh / 2 + labelH / 2 + 0.04, baseDepth + 0.02);
        labelMesh.renderOrder = 6;
        labelMesh.visible = curShowLabels;
        prismGroup.add(labelMesh);

        detectionsGroup.add(prismGroup);
        prismRecords.push({
          id: item.id,
          group: prismGroup,
          hitMesh,
          fillMat,
          edgeMat,
          strutMat,
          labelMesh,
          baseDepth,
          orderIndex: idx,
          currentZ: 0.06,
          currentScale: 1,
        });
      });
    };

    let activePlateTex: THREE.Texture | null = null;
    const texLoader = new THREE.TextureLoader();

    const loadImageTexture = (url: string | null) => {
      if (!url) {
        if (activePlateTex) {
          activePlateTex.dispose();
          activePlateTex = null;
        }
        plateMat.map = null;
        plateMat.color.setHex(0x0f172a);
        plateMat.needsUpdate = true;
        requestRender();
        return;
      }

      texLoader.load(
        url,
        (tex) => {
          if (activePlateTex) activePlateTex.dispose();
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
          activePlateTex = tex;
          plateMat.map = tex;
          plateMat.color.setHex(0xffffff);
          plateMat.needsUpdate = true;

          const img = tex.image as { width?: number; height?: number } | undefined;
          if (img?.width && img?.height) {
            const aspect = THREE.MathUtils.clamp(img.width / img.height, 0.7, 2.2);
            const targetH = 2.6;
            const targetW = targetH * aspect;
            syncRigGeometry(Math.min(4.6, targetW), Math.min(4.6, targetW) / aspect);
            rebuildPrisms();
          }
          requestRender();
        },
        undefined,
        () => {
          requestRender();
        },
      );
    };

    // OrbitControls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.4;
    controls.maxDistance = 10.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minPolarAngle = 0.25;
    controls.target.set(...CAMERA_PRESETS.iso.target);
    controls.update();

    let activeCamPreset: CameraPreset | null = null;
    controls.addEventListener('start', () => {
      activeCamPreset = null;
    });
    controls.addEventListener('change', () => {
      requestRender();
    });

    // Raycasting for hover & click selection
    const raycaster = new THREE.Raycaster();
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheck = 0;

    const getHitBoxId = (clientX: number, clientY: number): string | null => {
      if (prismRecords.length === 0) return null;
      const rect = canvas.getBoundingClientRect();
      _rayMouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      _rayMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_rayMouse, camera);
      const targets = prismRecords.map((r) => r.hitMesh);
      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        return (hits[0].object.userData.boxId as string) ?? null;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
      if (dist > 5) return;
      const hitId = getHitBoxId(e.clientX, e.clientY);
      if (hitId) {
        propsRef.current.onSelectBox?.(hitId);
      } else {
        propsRef.current.onClearHighlight?.();
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 50) return;
      lastHoverCheck = now;
      const hitId = getHitBoxId(e.clientX, e.clientY);
      canvas.style.cursor = hitId ? 'pointer' : 'grab';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointermove', onPointerMove);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      requestRender();
    };
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    // Coalesced render-on-demand + transition loop
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    const clock = new THREE.Clock();

    function stepFrame(delta: number, elapsed: number): boolean {
      let needsAnotherFrame = false;
      const {
        highlightedId: curHighlight,
        showLabels: curShowLabels,
        loading: curLoading,
        depthRatio: curDepth,
        autoOrbit: curAutoOrbit,
      } = propsRef.current;

      // Camera preset damping
      if (activeCamPreset) {
        const goal = CAMERA_PRESETS[activeCamPreset];
        _tmpCamPos.set(...goal.pos);
        _tmpTargetPos.set(...goal.target);
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _tmpCamPos.x, 7, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _tmpCamPos.y, 7, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _tmpCamPos.z, 7, delta);
        controls.target.x = THREE.MathUtils.damp(controls.target.x, _tmpTargetPos.x, 7, delta);
        controls.target.y = THREE.MathUtils.damp(controls.target.y, _tmpTargetPos.y, 7, delta);
        controls.target.z = THREE.MathUtils.damp(controls.target.z, _tmpTargetPos.z, 7, delta);

        if (
          camera.position.distanceTo(_tmpCamPos) < 0.015 &&
          controls.target.distanceTo(_tmpTargetPos) < 0.015
        ) {
          camera.position.copy(_tmpCamPos);
          controls.target.copy(_tmpTargetPos);
          activeCamPreset = null;
        } else {
          needsAnotherFrame = true;
        }
      }

      // Auto-orbit (disabled automatically on software WebGL)
      controls.autoRotate = !isSoftwareGl && curAutoOrbit;
      controls.autoRotateSpeed = 1.25;
      if (controls.autoRotate) {
        needsAnotherFrame = true;
      }

      // Prism exploded Z-depth & selection highlight damping
      for (let i = 0; i < prismRecords.length; i++) {
        const rec = prismRecords[i];
        const isSel = curHighlight === rec.id;
        const isDimmed = Boolean(curHighlight) && !isSel;

        const targetZ =
          0.07 + curDepth * (0.38 + (rec.orderIndex % 4) * 0.14) + (isSel ? 0.34 : 0);
        const targetScale = isSel ? 1.04 : 1;
        const nextZ = THREE.MathUtils.damp(rec.currentZ, targetZ, 9, delta);
        const nextScale = THREE.MathUtils.damp(rec.currentScale, targetScale, 9, delta);

        if (Math.abs(nextZ - targetZ) > 0.002 || Math.abs(nextScale - targetScale) > 0.002) {
          needsAnotherFrame = true;
        }
        rec.currentZ = nextZ;
        rec.currentScale = nextScale;
        rec.group.position.z = nextZ;
        rec.group.scale.set(nextScale, nextScale, 1);

        rec.fillMat.opacity = isDimmed ? 0.06 : isSel ? 0.34 : 0.2;
        rec.fillMat.emissiveIntensity = isSel ? 0.55 : 0.22;
        rec.edgeMat.opacity = isDimmed ? 0.25 : 0.98;
        rec.strutMat.opacity = isDimmed ? 0.14 : isSel ? 0.8 : 0.45;
        rec.labelMesh.visible = curShowLabels && !isDimmed;

        // Stretch tether struts cleanly between prism back and calibration plate
        const gap = Math.max(0.02, nextZ - 0.045);
        rec.group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.name === 'depth-strut') {
            child.scale.z = gap;
            child.position.z = -gap / 2;
          }
        });
      }

      // Loading 3D laser scan sweep
      if (curLoading) {
        scanGroup.visible = true;
        const sweep = Math.sin(elapsed * 2.4);
        scanGroup.position.set(0, rigBaseY + sweep * (plateDimensions.height * 0.46), 0.35);
        needsAnotherFrame = true;
      } else {
        scanGroup.visible = false;
      }

      controls.update();
      return needsAnotherFrame;
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const delta = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.elapsedTime;
        const keepRunning = stepFrame(delta, elapsed);
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || keepRunning)) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          scheduleAfterDraw(renderer.getContext(), done, (id) => {
            frameId = id;
          });
        } else {
          done();
        }
      });
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nw = Math.max(entry.contentRect.width, 200);
        const nh = Math.max(entry.contentRect.height, 260);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
        requestRender();
      }
    });
    resizeObserver.observe(container);

    sceneActionsRef.current = {
      rebuildPrisms: () => {
        rebuildPrisms();
        requestRender();
      },
      loadImageTexture: (url: string | null) => {
        loadImageTexture(url);
      },
      triggerCameraPreset: (p: CameraPreset) => {
        activeCamPreset = p;
        requestRender();
      },
      requestRender,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    loadImageTexture(imageUrl);
    rebuildPrisms();
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      clearPrisms();
      if (activePlateTex) activePlateTex.dispose();
      shadowTex.dispose();
      envTarget.dispose();
      controls.dispose();

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
      sceneActionsRef.current = null;
    };
  }, [webGlAvailable]);

  // Sync reactive prop changes without tearing down WebGL scene
  useEffect(() => {
    sceneActionsRef.current?.loadImageTexture(imageUrl);
  }, [imageUrl]);

  useEffect(() => {
    sceneActionsRef.current?.rebuildPrisms();
  }, [boxes]);

  useEffect(() => {
    sceneActionsRef.current?.requestRender();
  }, [highlightedId, showLabels, loading, depthRatio, autoOrbit]);

  const handleSelectPreset = (nextPreset: CameraPreset) => {
    setPreset(nextPreset);
    sceneActionsRef.current?.triggerCameraPreset(nextPreset);
  };

  if (!webGlAvailable || contextLost) {
    return (
      <div className="optical-stage-grid flex min-h-[410px] flex-col items-center justify-center p-6 text-center text-slate-300">
        <Box className="h-8 w-8 text-blue-400" />
        <p className="mt-3 text-sm font-semibold text-white">3D WebGL Context Unavailable</p>
        <p className="mt-1 max-w-sm text-xs text-slate-400">
          Your browser or hardware session paused WebGL rendering. Switch to 2D Overlay mode above
          to continue inspecting detections.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-[430px] w-full overflow-hidden bg-[#090d16]">
      {/* Isolated WebGL Mount */}
      <div ref={mountRef} className="h-full w-full" />

      {/* Minimal Top-Left Spatial Telemetry Spec (Solid dark, no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 rounded-md border border-slate-700/80 bg-slate-950/90 px-2.5 py-1 text-[11px] text-slate-300">
        <span className="font-mono font-medium text-blue-300">3D Spatial Stage</span>
        <span className="text-slate-600" aria-hidden="true">
          ·
        </span>
        <span className="font-mono tabular-nums text-slate-300">
          {boxes.length} {boxes.length === 1 ? 'volume' : 'volumes'}
        </span>
        <span className="hidden text-slate-600 sm:inline" aria-hidden="true">
          ·
        </span>
        <span className="hidden text-slate-400 sm:inline">Drag to orbit · Scroll to zoom</span>
      </div>

      {loading ? (
        <div className="pointer-events-none absolute top-3 right-3 z-10 rounded-md border border-blue-400/40 bg-slate-950/92 px-3 py-1 font-mono text-[11px] text-blue-200">
          {scanLabel}
        </div>
      ) : null}

      {/* Unified Collapsible Bottom Dock (No backdrop-blur over WebGL) */}
      <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex w-max max-w-[94%] -translate-x-1/2 flex-col items-center">
        <button
          type="button"
          onClick={() => setHudCollapsed((c) => !c)}
          className="inline-flex items-center gap-1 rounded-t-md border border-b-0 border-slate-700/85 bg-slate-950/95 px-2.5 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:text-white whitespace-nowrap"
        >
          {hudCollapsed ? (
            <>
              <ChevronUp className="h-3 w-3" />
              <span>Show 3D Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              <span>Hide Controls</span>
            </>
          )}
        </button>

        {!hudCollapsed ? (
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-lg border border-slate-700/85 bg-slate-950/95 px-3 py-2 text-[11px] text-slate-200 shadow-2xl">
            {/* Camera View Presets */}
            <div className="flex items-center gap-1 rounded-md bg-slate-900 p-0.5">
              {(
                [
                  { id: 'iso', label: 'Iso 3D' },
                  { id: 'front', label: 'Front' },
                  { id: 'side', label: 'Side Depth' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectPreset(p.id)}
                  className={`rounded px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                    preset === p.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <span className="h-4 w-px bg-slate-800" aria-hidden="true" />

            {/* Exploded Depth Separation Slider */}
            <label className="flex items-center gap-2 whitespace-nowrap">
              <span className="text-slate-400">Depth</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(depthRatio * 100)}
                onChange={(e) => setDepthRatio(Number(e.target.value) / 100)}
                className="h-1.5 w-20 cursor-pointer accent-blue-500"
              />
              <span className="w-8 font-mono text-[10px] tabular-nums text-slate-300">
                {Math.round(depthRatio * 100)}%
              </span>
            </label>

            <span className="h-4 w-px bg-slate-800" aria-hidden="true" />

            {/* Auto-Orbit Toggle */}
            <button
              type="button"
              onClick={() => setAutoOrbit((o) => !o)}
              className={`inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                autoOrbit
                  ? 'bg-blue-600/25 text-blue-300 ring-1 ring-blue-500/40'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-white'
              }`}
            >
              <RotateCw className="h-3 w-3" />
              <span>Orbit</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
