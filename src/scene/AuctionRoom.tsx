import { Canvas, useLoader, useThree } from '@react-three/fiber';
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { PerspectiveCamera } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CHARACTER_MODELS } from '../data/characters';
import type { RoomState } from '../game/types';
import { SELF } from '../game/types';
import { AuctionInterior } from './AuctionInterior';
import { BAKERY_MODELS } from './assets';
import { type CharacterLabelElements, CharacterLabelProjection, CharacterLabels } from './CharacterLabels';
import { LotModel } from './LotModel';
import type { SeatedModel } from './modelPose';
import { PrankEffect } from './PrankEffect';
import type { Point } from './primitives';
import { Resident } from './Resident';

function subscribeMotion(callback: () => void) {
  const query = matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
function CameraFit() {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (camera instanceof PerspectiveCamera) {
      const narrow = size.width < 600;
      camera.fov = narrow ? 68 : 55;
      camera.aspect = size.width / size.height;
      camera.position.set(narrow ? 0.4 : 0.5, narrow ? 3.6 : 3.55, narrow ? 9.8 : 8.4);
      camera.lookAt(0, 1.85, -3.8);
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, size.width, size.height, invalidate]);
  return null;
}
export function AuctionScene({
  state,
  targeting,
  reducedMotion,
  onReady,
  backdrop = false,
  labels,
}: {
  readonly state: RoomState;
  readonly targeting: boolean;
  readonly reducedMotion: boolean;
  readonly onReady: () => void;
  readonly backdrop?: boolean;
  readonly labels?: CharacterLabelElements;
}) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  const residents = useMemo(() => new Map<string, SeatedModel>(), []);
  const lotPosition: Point = [0, 1.76, -4.3];
  return (
    <>
      <color attach="background" args={['#111916']} />
      <fog attach="fog" args={['#111916', 15, 31]} />
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#eadfc6', '#51422f', 0.7]} />
      <directionalLight
        position={[-2, 5.5, 3]}
        intensity={1.3}
        color="#ffe0ae"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.001}
        shadow-normalBias={0.04}
      >
        <orthographicCamera attach="shadow-camera" args={[-8, 8, 8, -8, 0.5, 25]} />
      </directionalLight>
      {!backdrop && <CameraFit />}
      <AuctionInterior />
      <spotLight
        position={[0, 5.7, -2]}
        intensity={55}
        angle={0.52}
        penumbra={0.8}
        distance={14}
        color="#ffe0ae"
      />
      <group position={lotPosition} rotation={[0, 0.18, 0]} scale={1.4}>
        <LotModel kind={state.lot.kind} />
      </group>
      {state.players.map((player, index) => (
        <Resident
          key={player.id}
          player={player}
          index={index}
          amount={state.bids.find((bid) => bid.playerId === player.id)?.amount ?? 0}
          leading={state.leader === player.id}
          reducedMotion={reducedMotion}
          effects={state.effects}
          residents={residents}
          targetable={targeting && player.id !== SELF}
        />
      ))}
      {state.effects.map((effect) => (
        <PrankEffect
          key={`${effect.source}-${effect.target}-${effect.id}`}
          effect={effect}
          residents={residents}
          reducedMotion={reducedMotion}
        />
      ))}
      {labels && <CharacterLabelProjection residents={residents} elements={labels} />}
    </>
  );
}
function Unavailable({ onRetry }: { readonly onRetry?: () => void }) {
  return (
    <div className="scene-unavailable">
      <strong>3D 경매장을 표시할 수 없어요.</strong>
      <span>연결 상태를 확인하고 다시 불러와 주세요.</span>
      {onRetry && (
        <button type="button" className="button button-secondary" onClick={onRetry}>
          모델 다시 불러오기
        </button>
      )}
    </div>
  );
}
export class SceneBoundary extends Component<
  { readonly children: ReactNode; readonly silent?: boolean },
  { readonly failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null;
    return (
      <Unavailable
        onRetry={() => {
          for (const name of CHARACTER_MODELS) useLoader.clear(GLTFLoader, `/models/animals/${name}.glb`);
          for (const name of BAKERY_MODELS) useLoader.clear(GLTFLoader, `/models/bakery/${name}.glb`);
          useLoader.clear(GLTFLoader, '/models/props/auction-paddle.glb');
          this.setState({ failed: false });
        }}
      />
    );
  }
}
export default function AuctionRoom({
  state,
  targeting,
  onReady,
}: {
  readonly state: RoomState;
  readonly targeting: boolean;
  readonly onReady: () => void;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
  const leader = state.players.find((p) => p.id === state.leader);
  const labels = useMemo<CharacterLabelElements>(() => new Map(), []);
  const renderLabels = useRef<(() => void) | null>(null);
  const invalidateLabels = useCallback(() => renderLabels.current?.(), []);
  return (
    <div className={`room-scene ${targeting ? 'room-targeting' : ''}`}>
      <div className="room-caption">
        <span>나의 자리에서 바라보는 경매장</span>
        <span>THE NIGHT AUCTION</span>
      </div>
      <div
        className="room-canvas"
        role="img"
        aria-label={`내 캐릭터 뒷모습 너머로 다른 참가자와 무대가 보이는 어두운 경매장. ${leader ? `${leader.name}의 ${state.price}달러 팻말이 올라가 있어요.` : '입찰을 기다리고 있어요.'}`}
      >
        <SceneBoundary>
          <Canvas
            onCreated={({ invalidate }) => {
              renderLabels.current = invalidate;
            }}
            shadows
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [0.5, 3.05, 7.7], fov: 55, near: 0.1, far: 60 }}
            gl={{ antialias: true, alpha: false }}
            fallback={<Unavailable />}
          >
            <AuctionScene
              state={state}
              targeting={targeting}
              reducedMotion={reducedMotion}
              onReady={onReady}
              labels={labels}
            />
          </Canvas>
        </SceneBoundary>
      </div>
      <CharacterLabels
        players={state.players}
        messages={state.chats}
        elements={labels}
        onResize={invalidateLabels}
      />
      <div
        className="room-status"
        aria-live="polite"
        data-paddle-player={state.leader ?? ''}
        data-paddle-amount={state.price}
      >
        <span className="room-status-dot" />
        {leader ? (
          <>
            <strong>{leader.name}</strong>
            <span>${state.price} 팻말을 들었어요</span>
          </>
        ) : (
          <span>가격을 부르면 내 캐릭터가 팻말을 들어요</span>
        )}
      </div>
      {state.phase === 'sold' && <span className="room-sold">{leader ? '낙찰!' : '유찰'}</span>}
    </div>
  );
}
