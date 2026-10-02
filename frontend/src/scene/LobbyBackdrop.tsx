import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useCallback, useRef, useState, useSyncExternalStore } from 'react';
import type { RoomState } from '../game/types';
import { AuctionScene, SceneBoundary } from './AuctionRoom';

function subscribeMotion(callback: () => void) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', callback);
  document.addEventListener('visibilitychange', callback);
  return () => {
    media.removeEventListener('change', callback);
    document.removeEventListener('visibilitychange', callback);
  };
}

function CameraDrift({ active }: { readonly active: boolean }) {
  const elapsed = useRef(0);
  useFrame(({ camera }, delta) => {
    if (active) elapsed.current += Math.min(delta, 0.1);
    const phase = (elapsed.current / 36) * Math.PI * 2;
    camera.position.set(1.4 + Math.sin(phase) * 0.7, 4.1 + Math.sin(phase) * 0.1, 9.8);
    camera.lookAt(0, 1.7, -3.8);
  });
  return null;
}

export default function LobbyBackdrop({ state }: { readonly state: RoomState }) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const active = useSyncExternalStore(
    subscribeMotion,
    () => !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  return (
    <div className="lobby-backdrop" aria-hidden="true" data-ready={ready} data-moving={active}>
      <SceneBoundary silent>
        <Canvas
          frameloop={active ? 'always' : 'demand'}
          dpr={1}
          camera={{ position: [1.4, 4.1, 9.8], fov: 55, near: 0.1, far: 60 }}
          gl={{ antialias: false, alpha: false }}
          fallback={null}
        >
          <Suspense fallback={null}>
            <AuctionScene state={state} targeting={false} reducedMotion onReady={onReady} backdrop />
            <CameraDrift active={active} />
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
