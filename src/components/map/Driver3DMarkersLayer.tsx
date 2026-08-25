import { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MotorizadoDriver } from '../../types';

const MODEL_URL = '/models/motorizado.glb';
/** Tamaño objetivo de la moto en metros (escena del mapa). */
const MODEL_TARGET_SIZE_M = 2.4;
/** Rotación base del GLB si no apunta al norte (+Z). Ajustar según export. */
const MODEL_YAW_OFFSET_DEG = 90;

type Driver3DMarkersLayerProps = {
  drivers: MotorizadoDriver[];
  onModelReady?: (ready: boolean) => void;
};

/**
 * Capa WebGL (Three.js + GLB) sobre Google Maps para motorizados 3D.
 * Requiere mapId vectorial (ya configurado en GoogleMapRadar).
 */
export function Driver3DMarkersLayer({ drivers, onModelReady }: Driver3DMarkersLayerProps) {
  const map = useMap();
  const overlayRef = useRef<google.maps.WebGLOverlayView | null>(null);
  const driversRef = useRef(drivers);
  driversRef.current = drivers;

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps?.WebGLOverlayView) return;

    let disposed = false;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let renderer: THREE.WebGLRenderer | null = null;
    let modelTemplate: THREE.Object3D | null = null;
    const driverMeshes = new Map<string, THREE.Object3D>();

    const overlay = new google.maps.WebGLOverlayView();
    overlayRef.current = overlay;

    const approvedWithGps = () =>
      driversRef.current.filter(
        (d) =>
          d.status === 'approved' &&
          Number.isFinite(d.location?.lat) &&
          Number.isFinite(d.location?.lng)
      );

    const syncDriverMeshes = () => {
      if (!modelTemplate || !scene) return;
      const approved = approvedWithGps();
      const ids = new Set(approved.map((d) => d.id));

      for (const [id, mesh] of driverMeshes) {
        if (!ids.has(id)) {
          scene.remove(mesh);
          driverMeshes.delete(id);
        }
      }

      for (const d of approved) {
        if (driverMeshes.has(d.id)) continue;
        const clone = modelTemplate.clone(true);
        clone.userData.driverId = d.id;
        driverMeshes.set(d.id, clone);
        scene.add(clone);
      }
    };

    const placeMesh = (
      mesh: THREE.Object3D,
      transformer: google.maps.CoordinateTransformer,
      lat: number,
      lng: number,
      headingDeg: number
    ) => {
      const matrix = transformer.fromLatLngAltitude({
        lat,
        lng,
        altitude: 0.5,
      });
      const base = new THREE.Matrix4().fromArray(matrix);
      const yaw =
        -THREE.MathUtils.degToRad(headingDeg + MODEL_YAW_OFFSET_DEG);
      const rot = new THREE.Matrix4().makeRotationY(yaw);
      base.multiply(rot);
      mesh.matrix.copy(base);
      mesh.matrixAutoUpdate = false;
    };

    overlay.onAdd = () => {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera();

      scene.add(new THREE.AmbientLight(0xffffff, 1.35));
      const key = new THREE.DirectionalLight(0xffffff, 1.4);
      key.position.set(10, 18, 8);
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x00e5ff, 0.45);
      rim.position.set(-6, 4, -10);
      scene.add(rim);

      const loader = new GLTFLoader();
      loader.load(
        MODEL_URL,
        (gltf) => {
          if (disposed) return;
          modelTemplate = gltf.scene;

          const box = new THREE.Box3().setFromObject(modelTemplate);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 0.001);
          const scale = MODEL_TARGET_SIZE_M / maxDim;
          modelTemplate.scale.setScalar(scale);

          box.setFromObject(modelTemplate);
          const center = box.getCenter(new THREE.Vector3());
          modelTemplate.position.x -= center.x;
          modelTemplate.position.z -= center.z;
          modelTemplate.position.y -= box.min.y;

          syncDriverMeshes();
          onModelReady?.(true);
          overlay.requestRedraw();
        },
        undefined,
        (err) => {
          console.error('[Driver3D] No se pudo cargar motorizado.glb', err);
          onModelReady?.(false);
        }
      );
    };

    overlay.onContextRestored = ({ gl }) => {
      renderer = new THREE.WebGLRenderer({
        canvas: gl.canvas,
        context: gl,
        ...gl.getContextAttributes(),
        antialias: true,
      });
      renderer.autoClear = false;
    };

    overlay.onDraw = ({ gl, transformer }) => {
      if (!renderer || !scene || !camera || !modelTemplate) return;

      syncDriverMeshes();

      for (const d of approvedWithGps()) {
        const mesh = driverMeshes.get(d.id);
        if (!mesh) continue;
        const heading = Number.isFinite(d.location.heading)
          ? (d.location.heading as number)
          : 0;
        placeMesh(mesh, transformer, d.location.lat, d.location.lng, heading);
      }

      renderer.resetState();
      renderer.render(scene, camera);
      renderer.resetState();
    };

    overlay.onRemove = () => {
      for (const mesh of driverMeshes.values()) {
        scene?.remove(mesh);
      }
      driverMeshes.clear();
      renderer?.dispose();
      renderer = null;
      modelTemplate = null;
    };

    overlay.setMap(map);

    return () => {
      disposed = true;
      overlay.setMap(null);
      overlayRef.current = null;
      onModelReady?.(false);
    };
  }, [map, onModelReady]);

  useEffect(() => {
    overlayRef.current?.requestRedraw();
  }, [drivers]);

  return null;
}
