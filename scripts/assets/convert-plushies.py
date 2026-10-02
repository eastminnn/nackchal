# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
# Run: blender -b --factory-startup --python scripts/assets/convert-plushies.py -- <unpacked Animal Plushies folder>
import sys
import tarfile
from pathlib import Path
from tempfile import TemporaryDirectory

import bpy

source = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
output = Path("public/models/animals").resolve()
output.mkdir(parents=True, exist_ok=True)

with TemporaryDirectory(prefix="nackchal-textures-") as temporary:
    texture_dir = Path(temporary)
    with tarfile.open(source / "Animal_Plushies.unitypackage") as archive:
        for member in archive.getmembers():
            if not member.name.endswith("/pathname"):
                continue
            pathname = archive.extractfile(member)
            if pathname is None:
                continue
            filename = Path(pathname.read().decode()).name
            if not filename.endswith(".png"):
                continue
            image_data = archive.extractfile(member.name.rsplit("/", 1)[0] + "/asset")
            if image_data is not None:
                (texture_dir / filename).write_bytes(image_data.read())

    for name in ("Bear", "Bunny", "Cat", "Dog"):
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.delete(use_global=False)
        bpy.ops.import_scene.fbx(filepath=str(source / "FBX" / f"{name}.fbx"))
        material = bpy.data.materials.new(f"Plush_{name}")
        material.use_nodes = True
        shader = material.node_tree.nodes.get("Principled BSDF")
        shader.inputs["Roughness"].default_value = 0.92
        shader.inputs["Metallic"].default_value = 0.0
        texture = material.node_tree.nodes.new("ShaderNodeTexImage")
        texture.image = bpy.data.images.load(str(texture_dir / f"MAT_{name}_Base_color.png"))
        if max(texture.image.size) > 1024:
            texture.image.scale(1024, 1024)
        material.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
        for mesh in [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]:
            mesh.data.materials.clear()
            mesh.data.materials.append(material)
            for polygon in mesh.data.polygons:
                polygon.use_smooth = True
        armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
        for bone in armature.data.bones:
            bone.name = bone.name.removeprefix("Tedibear").removeprefix(name)
        bpy.ops.export_scene.gltf(
            filepath=str(output / f"plush-{name.lower()}.glb"),
            export_format="GLB",
            export_animations=False,
            export_image_format="JPEG",
            export_jpeg_quality=90,
            export_yup=True,
        )
        print(f"Exported plush-{name.lower()}.glb")
