import { AudioLines } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { detectSoftwareWebGL, isWebGLSupported, scheduleAfterDraw } from '../utils/webgl';

interface AudioSpectrum3DProps {
  analyser: AnalyserNode | null;
  active: boolean;
  analyzing: boolean;
  emotion?: string | null;
  rejected?: boolean;
}

const _dummy = new THREE.Object3D();
const _capDummy = new THREE.Object3D();
const _barColor = new THREE.Color();

export function AudioSpectrum3D({
  analyser,
  active,
  analyzing,
  emotion,
  rejected = false,
}: AudioSpectrum3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webGlAvailable] = useState(() => isWebGLSupported());
  const [contextLost, setContextLost] = useState(false);

  const stateRef = useRef({ analyser, active, analyzing, emotion, rejected });
  stateRef.current = { analyser, active, analyzing, emotion, rejected };

  useEffect(() => {
    if (!webGlAvailable) return;
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = Math.max(container.clientWidth, 300);
    const height = Math.max(container.clientHeight, 210);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d16);
    scene.fog = new THREE.FogExp2(0x090d16, 0.065);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 40);
    camera.position.set(0, 2.35, 5.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmrem.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0x93c5fd, 0x0f172a, 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.7);
    keyLight.position.set(4, 6, 4.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x3b82f6, 1.0);
    rimLight.position.set(-4, 3, -3.5);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(24, 24),
      new THREE.MeshStandardMaterial({ color: 0x0a0f1c, roughness: 0.72, metalness: 0.2 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(12, 20, 0x2563eb, 0x1e293b);
    grid.position.y = 0.006;
    const gridMats = Array.isArray(grid.material) ? grid.material : [grid.material];
    gridMats.forEach((m) => {
      m.transparent = true;
      m.opacity = 0.45;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -1;
    });
    scene.add(grid);

    // Acoustic Plinth Base
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(5.3, 0.12, 1.4),
      new THREE.MeshPhysicalMaterial({
        color: 0x1e293b,
        metalness: 0.82,
        roughness: 0.28,
        clearcoat: 0.35,
      }),
    );
    plinth.position.set(0, 0.06, 0);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const BAR_COUNT = 32;
    const barGeo = new THREE.BoxGeometry(0.11, 1, 0.24);
    barGeo.translate(0, 0.5, 0);
    const barMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.22,
      metalness: 0.45,
      clearcoat: 0.6,
    });
    const barsMesh = new THREE.InstancedMesh(barGeo, barMat, BAR_COUNT);
    barsMesh.castShadow = true;
    barsMesh.receiveShadow = true;
    barsMesh.frustumCulled = false;
    scene.add(barsMesh);

    const capGeo = new THREE.BoxGeometry(0.115, 0.04, 0.25);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x93c5fd,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.65,
      roughness: 0.2,
      metalness: 0.3,
    });
    const capsMesh = new THREE.InstancedMesh(capGeo, capMat, BAR_COUNT);
    capsMesh.frustumCulled = false;
    scene.add(capsMesh);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 8.5;
    controls.maxPolarAngle = Math.PI / 2 - 0.08;
    controls.target.set(0, 0.75, 0);
    controls.update();

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => setContextLost(false);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const heights = new Float32Array(BAR_COUNT).fill(0.12);
    const peaks = new Float32Array(BAR_COUNT).fill(0.16);
    let freqData = new Uint8Array(128);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nw = Math.max(entry.contentRect.width, 240);
        const nh = Math.max(entry.contentRect.height, 180);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      }
    });
    resizeObserver.observe(container);

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const { analyser: curAnalyser, active: curActive, analyzing: curAnalyzing, rejected: curRejected } =
        stateRef.current;

      if (curAnalyser && curActive) {
        if (freqData.length !== curAnalyser.frequencyBinCount) {
          freqData = new Uint8Array(curAnalyser.frequencyBinCount);
        }
        curAnalyser.getByteFrequencyData(freqData);
      }

      const step = Math.max(1, Math.floor(freqData.length / BAR_COUNT));
      const spacing = 0.155;
      const startX = -((BAR_COUNT - 1) * spacing) / 2;

      for (let i = 0; i < BAR_COUNT; i++) {
        let targetH = 0.1 + 0.05 * Math.sin(t * 1.8 + i * 0.35);
        if (curAnalyser && curActive) {
          const val = freqData[i * step] / 255;
          targetH = 0.1 + val * 1.85;
        } else if (curAnalyzing) {
          targetH = 0.25 + Math.abs(Math.sin(t * 4.2 - i * 0.28)) * 0.95;
        }

        heights[i] = THREE.MathUtils.damp(heights[i], targetH, 14, delta);
        peaks[i] = Math.max(heights[i] + 0.05, peaks[i] - delta * 0.55);

        const x = startX + i * spacing;
        const curveZ = Math.cos(((i / (BAR_COUNT - 1)) - 0.5) * Math.PI) * -0.22 + 0.12;

        _dummy.position.set(x, 0.12, curveZ);
        _dummy.scale.set(1, heights[i], 1);
        _dummy.updateMatrix();
        barsMesh.setMatrixAt(i, _dummy.matrix);

        const intensity = THREE.MathUtils.clamp(heights[i] / 1.8, 0, 1);
        if (curRejected) {
          _barColor.setHSL(0.08, 0.85, 0.42 + intensity * 0.18);
        } else {
          _barColor.setHSL(0.6 - intensity * 0.07, 0.85, 0.4 + intensity * 0.22);
        }
        barsMesh.setColorAt(i, _barColor);

        _capDummy.position.set(x, 0.12 + peaks[i], curveZ);
        _capDummy.updateMatrix();
        capsMesh.setMatrixAt(i, _capDummy.matrix);
      }

      barsMesh.instanceMatrix.needsUpdate = true;
      if (barsMesh.instanceColor) barsMesh.instanceColor.needsUpdate = true;
      capsMesh.instanceMatrix.needsUpdate = true;

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        scheduleAfterDraw(renderer.getContext(), tick, (id) => {
          frameId = id;
        });
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      envTarget.dispose();
      controls.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    };
  }, [webGlAvailable]);

  if (!webGlAvailable || contextLost) {
    return (
      <div className="optical-stage-grid flex h-56 flex-col items-center justify-center rounded-md border border-slate-800 text-slate-400">
        <AudioLines className="h-6 w-6 text-blue-400" />
        <span className="mt-2 text-xs">3D Spectrum unavailable — switch to 2D Oscilloscope</span>
      </div>
    );
  }

  return (
    <div className="relative h-56 w-full overflow-hidden rounded-md border border-slate-800 bg-[#090d16]">
      <div ref={mountRef} className="h-full w-full" />
      <div className="pointer-events-none absolute top-2.5 left-3 z-10 flex items-center gap-2 rounded bg-slate-950/90 px-2 py-0.5 font-mono text-[10px] text-slate-300 border border-slate-800">
        <span>3D Acoustic Harmonic Stage</span>
        {emotion ? (
          <>
            <span className="text-slate-600">·</span>
            <span className="text-blue-300">{emotion}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
