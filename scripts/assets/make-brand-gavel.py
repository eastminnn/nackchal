# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
import json
import math
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

art = Path("public/art/brand").resolve()
models = Path("assets/brand").resolve()
art.mkdir(parents=True, exist_ok=True)
models.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, hex_color):
    color = tuple(int(hex_color[index:index + 2], 16) / 255 for index in (0, 2, 4))
    linear = tuple(value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4 for value in color)
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*linear, 1)
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*linear, 1)
    shader.inputs["Roughness"].default_value = 0.48
    return result


def cylinder(name, radius, depth, at, finish, rotation=(0, 0, 0), bevel=0.06):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=at, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(finish)
    modifier = obj.modifiers.new("Soft edges", "BEVEL")
    modifier.width = bevel
    modifier.segments = 5
    obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj


honey = material("Honey wood", "CF975E")
cream = material("Maple end grain", "F3D09B")
walnut = material("Cocoa handle", "916044")
rim = material("Warm wood rim", "B77E50")
body = [cylinder("Mallet head", 0.29, 1.04, (0, 0, 0.67), honey, (0, math.pi / 2, 0))]
for side in (-1, 1):
    body.append(cylinder("Mallet cap", 0.36, 0.19, (side * 0.57, 0, 0.67), cream, (0, math.pi / 2, 0)))
    body.append(cylinder("Inset end grain", 0.265, 0.012, (side * 0.671, 0, 0.67), honey, (0, math.pi / 2, 0), 0.005))
start = Vector((0, -0.15, 0.67))
end = Vector((0, -1.36, 0.39))
direction = end - start
handle = cylinder("Handle", 0.12, direction.length, (start + end) / 2, walnut, direction.to_track_quat("Z", "Y").to_euler(), 0.095)
body.append(handle)
bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.15, location=end)
grip = bpy.context.object
grip.name = "Rounded grip"
grip.data.materials.append(walnut)
for face in grip.data.polygons:
    face.use_smooth = True
body.append(grip)

base = [
    cylinder("Block lower", 0.7, 0.17, (0, 0, 0.1), walnut),
    cylinder("Block rim", 0.66, 0.13, (0, 0, 0.22), rim, bevel=0.05),
    cylinder("Block top", 0.56, 0.06, (0, 0, 0.29), cream, bevel=0.025),
]
bpy.ops.object.select_all(action="DESELECT")
for obj in body + base:
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(models / "brand-gavel.glb"), export_format="GLB", use_selection=True, export_apply=True)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 40
scene.cycles.use_denoising = True
scene.render.resolution_x = 512
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.73, 0.64, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
scene.view_settings.view_transform = "AgX"

bpy.ops.object.camera_add(location=(-3.8, -6, 3.3))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, -0.4, 0.65)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.type = "ORTHO"
camera.data.ortho_scale = 3.2
scene.camera = camera

for location, power, size in [((-3, -4, 6), 500, 4), ((4, -2, 3), 320, 4), ((1, 4, 4), 400, 3)]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.data.energy = power
    light.data.shape = "DISK"
    light.data.size = size
    light.rotation_euler = (Vector((0, 0, 0.5)) - light.location).to_track_quat("-Z", "Y").to_euler()

for name, visible, hidden in [("gavel-mallet", body, base), ("gavel-block", base, body)]:
    for obj in visible:
        obj.hide_render = False
    for obj in hidden:
        obj.hide_render = True
    scene.render.filepath = str(art / f"{name}.png")
    bpy.ops.render.render(write_still=True)

point = world_to_camera_view(scene, camera, end)
(models / "gavel-pivot.json").write_text(json.dumps({"x": round(point.x * 100, 3), "y": round((1 - point.y) * 100, 3)}))
