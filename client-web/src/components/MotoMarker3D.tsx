import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const MOTO_URL = '/models/moto.glb';
const BAKE_SIZE = 256;
/** Versión del sprite: cenital con morro arriba = norte (estilo Uber/inDriver). */
const BAKE_VERSION = 'uber-v1';

type MotoMarker3DProps = {
  /** Rumbo del teléfono (brújula), 0 = norte. */
  headingDeg?: number | null;
  /** Rumbo actual del mapa (si el usuario lo giró con los dedos). */
  mapHeadingDeg?: number | null;
  sizePx?: number;
  /** Al cambiar, resetea el suavizado visual (calibración de brújula). */
  calibrateKey?: number;
};

let bakePromise: Promise<string> | null = null;
let bakeVersion: string | null = null;

export function motoSizeForZoom(zoom: number | null | undefined) {
  const z = zoom != null && Number.isFinite(zoom) ? zoom : 16;
  const t = Math.max(0, Math.min(1, (z - 12) / 6));
  return Math.round(40 + t * 52);
}

function brightenMaterials(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial;
      if (m.color) {
        m.color.offsetHSL(0, -0.05, 0.28);
        m.color.multiplyScalar(1.3);
      }
      if ('emissive' in m && m.emissive) {
        m.emissive.setHex(0x1a2430);
        m.emissiveIntensity = 0.25;
      }
      if ('metalness' in m && typeof m.metalness === 'number') {
        m.metalness = Math.min(m.metalness, 0.22);
      }
      if ('roughness' in m && typeof m.roughness === 'number') {
        m.roughness = Math.max(m.roughness, 0.52);
      }
      m.needsUpdate = true;
    }
  });
}

/**
 * Sprite cenital: la PUNTA de la moto queda arriba en el PNG.
 * Así rotate(0) = norte en el mapa, como el cono azul de Uber/Maps.
 */
function bakeMotoSprite(): Promise<string> {
  if (bakePromise && bakeVersion === BAKE_VERSION) return bakePromise;
  bakeVersion = BAKE_VERSION;

  bakePromise = new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = BAKE_SIZE;
    canvas.height = BAKE_SIZE;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'low-power',
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      bakePromise = null;
      bakeVersion = null;
      reject(err);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.setSize(BAKE_SIZE, BAKE_SIZE, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;

    const scene = new THREE.Scene();
    // Cámara casi arriba: “arriba del PNG” = −Z = morro.
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 40);
    camera.position.set(0, 3.6, 0.35);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0.2, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 1.3));
    scene.add(new THREE.HemisphereLight(0xffffff, 0x778899, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(1.5, 5, 2);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffe6cc, 0.9);
    fill.position.set(-2, 3, -1);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    loader.load(
      MOTO_URL,
      (gltf) => {
        try {
          const model = gltf.scene;
          brightenMaterials(model);
          const box0 = new THREE.Box3().setFromObject(model);
          const size0 = box0.getSize(new THREE.Vector3());
          const maxDim = Math.max(size0.x, size0.y, size0.z) || 1;
          model.scale.setScalar(1.45 / maxDim);
          // Morro hacia −Z (= arriba en el PNG con esta cámara).
          model.rotation.y = Math.PI;
          model.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(model);
          const c = box.getCenter(new THREE.Vector3());
          model.position.x -= c.x;
          model.position.z -= c.z;
          model.position.y -= box.min.y;
          root.add(model);

          renderer.render(scene, camera);
          const url = canvas.toDataURL('image/png');
          renderer.dispose();
          scene.clear();
          draco.dispose();
          resolve(url);
        } catch (err) {
          renderer.dispose();
          bakePromise = null;
          bakeVersion = null;
          reject(err);
        }
      },
      undefined,
      (err) => {
        renderer.dispose();
        bakePromise = null;
        bakeVersion = null;
        reject(err);
      },
    );
  });

  return bakePromise;
}

/**
 * Estilo Uber/inDriver: la punta del vehículo = dirección a la que apunta el teléfono.
 * El mapa NO se fuerza (gestos libres); solo gira el pin.
 */
export function MotoMarker3D({
  headingDeg = 0,
  mapHeadingDeg = 0,
  sizePx = 72,
  calibrateKey = 0,
}: MotoMarker3DProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const angleRef = useRef(0);
  const smoothRef = useRef<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const snapUntilRef = useRef(0);

  const mapH = mapHeadingDeg != null && Number.isFinite(mapHeadingDeg) ? mapHeadingDeg : 0;
  const bikeH = headingDeg != null && Number.isFinite(headingDeg) ? headingDeg : 0;
  // Rumbo Maps (norte=0) menos rotación del mapa. +180 = morro del PNG vs cono azul.
  angleRef.current = ((bikeH - mapH + 180) % 360 + 360) % 360;

  useEffect(() => {
    if (calibrateKey < 1) return;
    smoothRef.current = null;
    snapUntilRef.current = Date.now() + 5000;
  }, [calibrateKey]);

  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      void bakeMotoSprite()
        .then((url) => {
          if (alive) setSrc(url);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const target = angleRef.current;
      const snapping = Date.now() < snapUntilRef.current;
      if (smoothRef.current == null || snapping) {
        smoothRef.current = target;
      } else {
        let d = ((target - smoothRef.current + 540) % 360) - 180;
        // Teléfono quieto: no perseguir ruido de brújula (< ~6°).
        if (Math.abs(d) < 6) d = 0;
        const alpha = Math.abs(d) > 35 ? 0.28 : 0.1;
        smoothRef.current = (smoothRef.current + d * alpha + 360) % 360;
      }
      if (imgRef.current) {
        imgRef.current.style.transform = `rotate(${smoothRef.current.toFixed(2)}deg)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  if (failed) {
    return (
      <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-[#00E676] text-sm shadow-[0_0_12px_rgba(0,230,118,0.6)]">
        🛵
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none relative"
      style={{ width: sizePx, height: sizePx }}
      title="Transportista"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[10%] left-1/2 z-0 h-[10%] w-[48%] -translate-x-1/2 rounded-[50%] bg-black/35 blur-[2px]"
      />
      {src ? (
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          className="relative z-[1] block h-full w-full object-contain"
          style={{ transformOrigin: '50% 50%' }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-500">
          …
        </div>
      )}
    </div>
  );
}
