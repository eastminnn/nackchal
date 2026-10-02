import { useLoader } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Box3, Color, type Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { BakeryModel } from './assets';
import type { Point } from './primitives';

export function ModelAsset({
  name,
  at = [0, 0, 0],
  size = [1, 1, 1],
  rotation = [0, 0, 0],
  tint,
}: {
  readonly name: BakeryModel;
  readonly at?: Point;
  readonly size?: Point;
  readonly rotation?: Point;
  readonly tint?: string;
}) {
  const asset = useLoader(GLTFLoader, `/models/bakery/${name}.glb`);
  const model = useMemo(() => {
    const scene = clone(asset.scene);
    const box = new Box3().setFromObject(scene);
    const center = box.getCenter(new Vector3());
    const dimensions = box.getSize(new Vector3());
    const owned: Material[] = [];
    scene.position.set(-center.x, -box.min.y, -center.z);
    scene.traverse((object) => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        {
          const recolor = (material: Material) => {
            const copy =
              material instanceof MeshBasicMaterial
                ? new MeshStandardMaterial({
                    color: material.color,
                    map: material.map,
                    vertexColors: material.vertexColors,
                    roughness: 0.85,
                    side: material.side,
                  })
                : material.clone();
            if (tint && copy instanceof MeshStandardMaterial) copy.color.multiply(new Color(tint));
            owned.push(copy);
            return copy;
          };
          object.material = Array.isArray(object.material)
            ? object.material.map(recolor)
            : recolor(object.material);
        }
      }
    });
    return { scene, dimensions, owned };
  }, [asset, tint]);
  useEffect(
    () => () => {
      for (const material of model.owned) material.dispose();
    },
    [model],
  );
  return (
    <group
      position={at}
      rotation={rotation}
      scale={[size[0] / model.dimensions.x, size[1] / model.dimensions.y, size[2] / model.dimensions.z]}
      dispose={null}
    >
      <primitive object={model.scene} />
    </group>
  );
}
