import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  HEADING_LERP_FACTOR,
  MODEL_ROTATION_OFFSET_DEG,
  angleNeedsRedraw,
  lerpAngleRad,
  modelYawFromHeadingDeg,
  startHybridOrientation,
  type HybridOrientationHandle,
  type NavMapMode,
} from '../lib/driverOrientation';

const MOTO_URL = '/models/moto.glb';
/** Escala en metros del mundo WebGLOverlayView. */
const MODEL_SCALE_M = 8.5;

type LatLng = { lat: number; lng: number };

export type MotoWebGLOverlayProps = {
  position: LatLng | null | undefined;
  gpsHeadingDeg?: number | null;
  speedMps?: number | null;
  navMode?: NavMapMode;
  calibrateSeq?: number;
  onHeadingChange?: (headingDeg: number) => void;
  /** true cuando el overlay WebGL está dibujando; false = usar fallback 2D. */
  onReadyChange?: (ready: boolean) => void;
};

/**
 * Moto 3D en WebGLOverlayView (Three.js). Sin punto azul nativo.
 * Posición vía transformer.fromLatLngAltitude; rumbo híbrido + lerp angular.
 */
export function MotoWebGLOverlay({
  position,
  gpsHeadingDeg = null,
  speedMps = null,
  navMode = 'free',
  calibrateSeq = 0,
  onHeadingChange,
  onReadyChange,
}: MotoWebGLOverlayProps) {
  const map = useMap();
  const positionRef = useRef(position);
  positionRef.current = position;
  const navModeRef = useRef(navMode);
  navModeRef.current = navMode;
  const onHeadingRef = useRef(onHeadingChange);
  onHeadingRef.current = onHeadingChange;
  const onReadyRef = useRef(onReadyChange);
  onReadyRef.current = onReadyChange;
  const gpsRef = useRef({ heading: gpsHeadingDeg, speed: speedMps });
  gpsRef.current = { heading: gpsHeadingDeg, speed: speedMps };
  const orientationRef = useRef<HybridOrientationHandle | null>(null);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.WebGLOverlayView) {
      onReadyRef.current?.(false);
      return;
    }

    let cancelled = false;
    let overlay: google.maps.WebGLOverlayView | null = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.Camera | null = null;
    let motoRoot: THREE.Group | null = null;
    let targetYaw = 0;
    let currentYaw = 0;
    let modelReady = false;
    let contextReady = false;

    const markReady = () => {
      if (cancelled) return;
      if (modelReady && contextReady) onReadyRef.current?.(true);
    };

    const orientation = startHybridOrientation({
      onHeading: (h) => {
        targetYaw = modelYawFromHeadingDeg(h, MODEL_ROTATION_OFFSET_DEG);
        onHeadingRef.current?.(h);
        overlay?.requestRedraw();
      },
    });
    orientationRef.current = orientation;
    orientation.setGps(gpsRef.current.heading ?? null, gpsRef.current.speed ?? null);

    const brighten = (root: THREE.Object3D) => {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const m = mat as THREE.MeshStandardMaterial;
          if (m.color) {
            m.color.offsetHSL(0, -0.04, 0.2);
            m.color.multiplyScalar(1.22);
          }
          if ('metalness' in m && typeof m.metalness === 'number') {
            m.metalness = Math.min(m.metalness, 0.25);
          }
          if ('roughness' in m && typeof m.roughness === 'number') {
            m.roughness = Math.max(m.roughness, 0.5);
          }
          m.needsUpdate = true;
        }
      });
    };

    const loadModel = () => {
      const draco = new DRACOLoader();
      draco.setDecoderPath('/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      loader.load(
        MOTO_URL,
        (gltf) => {
          if (cancelled || !scene) {
            draco.dispose();
            return;
          }
          const model = gltf.scene;
          brighten(model);
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          model.scale.setScalar(MODEL_SCALE_M / maxDim);
          model.updateMatrixWorld(true);
          const box2 = new THREE.Box3().setFromObject(model);
          model.position.y -= box2.min.y;
          motoRoot = new THREE.Group();
          motoRoot.add(model);
          scene.add(motoRoot);
          modelReady = true;
          draco.dispose();
          markReady();
          overlay?.requestRedraw();
        },
        undefined,
        () => {
          draco.dispose();
          if (!cancelled) onReadyRef.current?.(false);
        },
      );
    };

    // Si WebGL del mapa no restaura contexto a tiempo → fallback 2D.
    const failTimer = window.setTimeout(() => {
      if (!cancelled && !contextReady) onReadyRef.current?.(false);
    }, 3500);

    overlay = new google.maps.WebGLOverlayView();

    overlay.onAdd = () => {
      scene = new THREE.Scene();
      camera = new THREE.Camera();
      scene.add(new THREE.AmbientLight(0xffffff, 1.35));
      scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.15));
      const key = new THREE.DirectionalLight(0xffffff, 1.75);
      key.position.set(0.55, 1.15, 0.35);
      scene.add(key);
      loadModel();
    };

    overlay.onContextRestored = ({ gl }) => {
      const attrs = gl.getContextAttributes?.() || {};
      renderer = new THREE.WebGLRenderer({
        canvas: gl.canvas as HTMLCanvasElement,
        context: gl as unknown as WebGLRenderingContext,
        ...attrs,
      });
      renderer.autoClear = false;
      renderer.setPixelRatio(1);
      renderer.setSize(
        (gl.canvas as HTMLCanvasElement).width,
        (gl.canvas as HTMLCanvasElement).height,
        false,
      );
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      contextReady = true;
      markReady();
      overlay?.requestRedraw();
    };

    overlay.onContextLost = () => {
      contextReady = false;
      renderer?.dispose();
      renderer = null;
      onReadyRef.current?.(false);
    };

    overlay.onDraw = ({ transformer }) => {
      const pos = positionRef.current;
      if (!renderer || !scene || !camera || !pos || !motoRoot) return;

      orientation.setGps(gpsRef.current.heading ?? null, gpsRef.current.speed ?? null);

      // La matriz de Maps ya incluye heading/tilt del mapa:
      // rotation.y = rumbo geográfico (+ offset del GLB). En heading-up el mapa gira;
      // la moto queda apuntando “arriba” sin compensar de nuevo.
      currentYaw = lerpAngleRad(currentYaw, targetYaw, HEADING_LERP_FACTOR);
      motoRoot.rotation.set(0, currentYaw, 0);

      const matrixArr = transformer.fromLatLngAltitude({
        lat: pos.lat,
        lng: pos.lng,
        altitude: 0,
      });
      camera.projectionMatrix = new THREE.Matrix4().fromArray(matrixArr);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();

      if (angleNeedsRedraw(currentYaw, targetYaw)) {
        overlay?.requestRedraw();
      }
    };

    overlay.setMap(map);

    return () => {
      cancelled = true;
      window.clearTimeout(failTimer);
      orientation.stop();
      orientationRef.current = null;
      try {
        overlay?.setMap(null);
      } catch {
        /* ignore */
      }
      if (scene) {
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry?.dispose?.();
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) m?.dispose?.();
        });
      }
      renderer?.dispose();
      overlay = null;
      onReadyRef.current?.(false);
    };
    // map estable; GPS/nav se leen por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    gpsRef.current = { heading: gpsHeadingDeg, speed: speedMps };
    orientationRef.current?.setGps(gpsHeadingDeg ?? null, speedMps ?? null);
  }, [gpsHeadingDeg, speedMps]);

  useEffect(() => {
    if (calibrateSeq < 1) return;
    orientationRef.current?.recalibrate();
  }, [calibrateSeq]);

  return null;
}
