import { Float32BufferAttribute, MeshStandardMaterial, type Object3D, SkinnedMesh } from 'three';

export function plushBlush(scene: Object3D) {
  const strength = { value: 0 };
  const dispose: (() => void)[] = [];
  scene.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    const geometry = object.geometry.clone();
    const indices = geometry.getAttribute('skinIndex');
    const weights = geometry.getAttribute('skinWeight');
    const mask = new Float32Array(indices.count);
    for (let vertex = 0; vertex < indices.count; vertex++) {
      for (let slot = 0; slot < 4; slot++) {
        const bone = object.skeleton.bones[indices.getComponent(vertex, slot)];
        if (bone?.name === 'Head' || bone?.name === 'Neck')
          mask[vertex] = (mask[vertex] ?? 0) + weights.getComponent(vertex, slot);
      }
    }
    geometry.setAttribute('plushHeadWeight', new Float32BufferAttribute(mask, 1));
    object.geometry = geometry;
    dispose.push(() => geometry.dispose());
    const tint = (source: MeshStandardMaterial) => {
      const material = source.clone();
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, { plushBlush: strength });
        shader.vertexShader =
          `attribute float plushHeadWeight;\nvarying float vPlushHeadWeight;\n${shader.vertexShader}`.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\nvPlushHeadWeight = plushHeadWeight;',
          );
        shader.fragmentShader =
          `uniform float plushBlush;\nvarying float vPlushHeadWeight;\n${shader.fragmentShader}`.replace(
            '#include <color_fragment>',
            `#include <color_fragment>
diffuseColor.rgb *= mix(vec3(1.0), vec3(1.2, 0.36, 0.28), vPlushHeadWeight * plushBlush * 0.6);`,
          );
      };
      material.customProgramCacheKey = () => 'plush-blush-v1';
      dispose.push(() => material.dispose());
      return material;
    };
    object.material = Array.isArray(object.material)
      ? object.material.map((material) =>
          material instanceof MeshStandardMaterial ? tint(material) : material,
        )
      : object.material instanceof MeshStandardMaterial
        ? tint(object.material)
        : object.material;
  });
  return {
    strength,
    dispose: () => {
      for (const release of dispose) release();
    },
  };
}
