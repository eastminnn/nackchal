import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { CanvasTexture, Mesh, SRGBColorSpace } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function BidPaddle({ amount, seat }: { readonly amount: number; readonly seat: number }) {
  const asset = useLoader(GLTFLoader, '/models/props/auction-paddle.glb');
  const model = useMemo(() => {
    const copy = asset.scene.clone(true);
    copy.traverse((object) => {
      if (object instanceof Mesh) object.castShadow = true;
    });
    return copy;
  }, [asset]);
  const text = amount ? `$${amount}` : String(seat + 1).padStart(2, '0');
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#503c37';
      context.font = `bold ${text.length > 3 ? 170 : 210}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 256, 270, 470);
    }
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group>
      <primitive object={model} dispose={null} />
      {[0, Math.PI].map((rotation) => (
        <group key={rotation} position={[0, 0.989, rotation ? -0.03 : 0.03]} rotation={[0, rotation, 0]}>
          <mesh>
            <planeGeometry args={[0.56, 0.56]} />
            <meshBasicMaterial map={texture} transparent toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
