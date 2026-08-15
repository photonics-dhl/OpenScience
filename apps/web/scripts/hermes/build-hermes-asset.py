"""Build the original OpenScience Hermes scholar robot and its web GLB."""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector


FPS = 30
TAU = math.tau


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", required=True, type=Path)
    return parser.parse_args(argv)


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.fps = FPS
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Hermes Review World")
    scene.world.color = (0.0028, 0.0035, 0.0045)
    scene["asset_owner"] = "OpenScience"
    scene["asset_license"] = "Original OpenScience Hermes asset"
    scene["asset_role"] = "scholarly agent navigator"


def make_material(
    name: str,
    base: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = base
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    if emission:
        principled.inputs["Emission Color"].default_value = emission
        principled.inputs["Emission Strength"].default_value = emission_strength
    return material


def apply_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.append(material)


def rounded_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    bevel: float = 0.08,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Precision radius", "BEVEL")
    modifier.width = min(bevel, min(dimensions) * 0.42)
    modifier.segments = 4
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    apply_material(obj, material)
    return obj


def tapered_panel(
    name: str,
    outline: list[tuple[float, float]],
    center_y: float,
    depth: float,
    material: bpy.types.Material,
    bevel: float = 0.025,
) -> bpy.types.Object:
    """Extrude a restrained shell panel from an x/z outline."""
    front_y = center_y - depth / 2
    back_y = center_y + depth / 2
    vertices = [(x, front_y, z) for x, z in outline] + [(x, back_y, z) for x, z in outline]
    count = len(outline)
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    modifier = obj.modifiers.new("Integrated shell radius", "BEVEL")
    modifier.width = bevel
    modifier.segments = 4
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    apply_material(obj, material)
    return obj


def curved_mantle_panel(
    name: str,
    side: float,
    material: bpy.types.Material,
    columns: int = 8,
    rows: int = 9,
) -> bpy.types.Object:
    """Create one continuous mantle leaf that wraps from the binding to the shoulder."""
    vertices: list[tuple[float, float, float]] = []
    for row in range(rows):
        v = row / (rows - 1)
        z = 1.47 - 0.86 * v
        outer = 0.46 + 0.11 * math.sin(math.pi * v) + 0.010 * v
        inner = 0.105 + 0.010 * v
        for column in range(columns):
            u = column / (columns - 1)
            x_abs = inner + (outer - inner) * u
            x = side * x_abs
            front_curve = 0.385 - 0.145 * (u ** 1.35)
            lower_flare = 0.025 * (v ** 2) * u
            y = -front_curve + lower_flare
            vertices.append((x, y, z))
    faces: list[tuple[int, int, int, int]] = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            start = row * columns + column
            faces.append((start, start + 1, start + columns + 1, start + columns))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("Mantle shell depth", "SOLIDIFY")
    solidify.thickness = 0.055
    solidify.offset = 0.0
    bevel = obj.modifiers.new("Mantle continuous edge", "BEVEL")
    bevel.width = 0.022
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    apply_material(obj, material)
    return obj


def curved_back_mantle(
    name: str,
    material: bpy.types.Material,
    columns: int = 14,
    rows: int = 9,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for row in range(rows):
        v = row / (rows - 1)
        z = 1.45 - 0.90 * v
        radius_x = 0.57 + 0.03 * math.sin(math.pi * v)
        radius_y = 0.315 + 0.025 * v
        for column in range(columns):
            angle = -math.pi / 2 + math.pi * column / (columns - 1)
            vertices.append((radius_x * math.sin(angle), radius_y * math.cos(angle), z))
    faces: list[tuple[int, int, int, int]] = []
    for row in range(rows - 1):
        for column in range(columns - 1):
            start = row * columns + column
            faces.append((start, start + 1, start + columns + 1, start + columns))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("Mantle back shell", "SOLIDIFY")
    solidify.thickness = 0.050
    solidify.offset = 0.0
    bevel = obj.modifiers.new("Mantle back edge", "BEVEL")
    bevel.width = 0.020
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    apply_material(obj, material)
    return obj


def curve_trim(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"{name}_Curve", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 3
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.collection.objects.link(obj)
    apply_material(obj, material)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
    return obj


def ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 24,
    rings: int = 12,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    apply_material(obj, material)
    return obj


def lofted_body(
    name: str,
    rings: list[tuple[float, float, float]],
    material: bpy.types.Material,
    segments: int = 32,
) -> bpy.types.Object:
    """Create one continuous scholarly torso from super-elliptic cross sections."""
    vertices: list[tuple[float, float, float]] = []
    for z, radius_x, radius_y in rings:
        for index in range(segments):
            angle = TAU * index / segments
            cosine = math.cos(angle)
            sine = math.sin(angle)
            x = radius_x * math.copysign(abs(cosine) ** 0.72, cosine)
            y = radius_y * math.copysign(abs(sine) ** 0.78, sine)
            vertices.append((x, y, z))
    faces: list[tuple[int, ...]] = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * segments
        next_start = (ring_index + 1) * segments
        for index in range(segments):
            next_index = (index + 1) % segments
            faces.append((start + index, start + next_index, next_start + next_index, next_start + index))
    faces.append(tuple(reversed(range(segments))))
    top_start = (len(rings) - 1) * segments
    faces.append(tuple(top_start + index for index in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("Continuous shell edge", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    apply_material(obj, material)
    return obj


def cylinder_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    vertices: int = 20,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    delta = end_v - start_v
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=delta.length, location=(start_v + end_v) / 2)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel = obj.modifiers.new("Bound edge", "BEVEL")
    bevel.width = radius * 0.34
    bevel.segments = 3
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    apply_material(obj, material)
    return obj


def add_named_light(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    light = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(light)
    light.location = location
    return light


def aim_at(obj: bpy.types.Object, point: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def create_rig() -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("Hermes_Rig")
    armature = bpy.data.objects.new("Hermes_Root", armature_data)
    bpy.context.collection.objects.link(armature)
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    definitions = {
        "root": ((0, 0, 0.22), (0, 0, 0.48), None),
        "torso": ((0, 0, 0.55), (0, 0, 1.45), "root"),
        "spine": ((0, 0.22, 0.72), (0, 0.22, 1.48), "torso"),
        "core": ((0, 0, 0.28), (0, 0, 0.62), "root"),
        "neck": ((0, 0, 1.44), (0, 0, 1.66), "torso"),
        "head": ((0, 0, 1.62), (0, 0, 2.22), "neck"),
        "eye_l": ((-0.18, -0.43, 1.98), (-0.18, -0.43, 2.08), "head"),
        "eye_r": ((0.18, -0.43, 1.98), (0.18, -0.43, 2.08), "head"),
        "mantle_l": ((-0.22, 0, 1.34), (-0.22, 0, 1.58), "torso"),
        "mantle_r": ((0.22, 0, 1.34), (0.22, 0, 1.58), "torso"),
        "page_l_01": ((-0.34, 0, 1.32), (-0.34, 0, 1.52), "mantle_l"),
        "page_l_02": ((-0.43, 0, 1.30), (-0.43, 0, 1.50), "mantle_l"),
        "page_r_01": ((0.34, 0, 1.32), (0.34, 0, 1.52), "mantle_r"),
        "page_r_02": ((0.43, 0, 1.30), (0.43, 0, 1.50), "mantle_r"),
        "upper_arm_l": ((-0.63, 0, 1.32), (-0.77, 0, 0.94), "torso"),
        "forearm_l": ((-0.77, 0, 0.94), (-0.80, -0.02, 0.60), "upper_arm_l"),
        "hand_l": ((-0.80, -0.02, 0.60), (-0.80, -0.04, 0.42), "forearm_l"),
        "upper_arm_r": ((0.63, 0, 1.32), (0.77, 0, 0.94), "torso"),
        "forearm_r": ((0.77, 0, 0.94), (0.80, -0.02, 0.60), "upper_arm_r"),
        "hand_r": ((0.80, -0.02, 0.60), (0.80, -0.04, 0.42), "forearm_r"),
    }
    bones = {}
    for name, (head, tail, parent_name) in definitions.items():
        bone = armature_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        if parent_name:
            bone.parent = bones[parent_name]
        bones[name] = bone
    bpy.ops.object.mode_set(mode="POSE")
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    armature["asset_owner"] = "OpenScience"
    armature["asset_license"] = "Original OpenScience Hermes asset"
    armature["asset_family"] = "Hermes Scholar Automaton"
    return armature


def parent_to_bone(obj: bpy.types.Object, armature: bpy.types.Object, bone: str) -> None:
    matrix_world = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = matrix_world


def skin_and_merge_parts(
    parts: list[tuple[bpy.types.Object, str]],
    armature: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Rigid-skin every part, then batch by material to keep the GLB at six draws."""
    original_parts = [(obj.name, bone_name) for obj, bone_name in parts]
    by_material: dict[str, list[bpy.types.Object]] = {}
    for obj, bone_name in parts:
        group = obj.vertex_groups.new(name=bone_name)
        group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
        modifier = obj.modifiers.new("Hermes skin", "ARMATURE")
        modifier.object = armature
        matrix_world = obj.matrix_world.copy()
        obj.parent = armature
        obj.parent_type = "OBJECT"
        obj.matrix_world = matrix_world
        material_name = obj.data.materials[0].name
        by_material.setdefault(material_name, []).append(obj)

    surfaces: list[bpy.types.Object] = []
    for material_name, objects in by_material.items():
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = f"Hermes_Surface_{material_name.removeprefix('Hermes_')}"
        active.data.name = f"{active.name}_Mesh"
        surfaces.append(active)

    # Semantic landmarks remain named nodes for inspection/debugging without
    # reintroducing a draw call for every modeled piece.
    landmarks: list[bpy.types.Object] = []
    for name, bone_name in original_parts:
        landmark = bpy.data.objects.new(name, None)
        bpy.context.collection.objects.link(landmark)
        parent_to_bone(landmark, armature, bone_name)
        landmarks.append(landmark)

    return surfaces + landmarks


def create_actions(armature: bpy.types.Object) -> None:
    armature.animation_data_create()
    neutral_bones = [bone.name for bone in armature.pose.bones]

    def pose(frame: int, values: dict[str, dict[str, tuple[float, float, float]]]) -> None:
        bpy.context.scene.frame_set(frame)
        for name in neutral_bones:
            bone = armature.pose.bones[name]
            bone.location = (0, 0, 0)
            bone.rotation_euler = (0, 0, 0)
            bone.scale = (1, 1, 1)
        for name, transforms in values.items():
            bone = armature.pose.bones[name]
            if "location" in transforms:
                bone.location = transforms["location"]
            if "rotation" in transforms:
                bone.rotation_euler = tuple(math.radians(value) for value in transforms["rotation"])
            if "scale" in transforms:
                bone.scale = transforms["scale"]
        for name in neutral_bones:
            bone = armature.pose.bones[name]
            bone.keyframe_insert("location", frame=frame, group=name)
            bone.keyframe_insert("rotation_euler", frame=frame, group=name)
            bone.keyframe_insert("scale", frame=frame, group=name)

    def action(name: str, end: int, frames: list[tuple[int, dict[str, dict[str, tuple[float, float, float]]]]]) -> None:
        clip = bpy.data.actions.new(name)
        clip.use_fake_user = True
        armature.animation_data.action = clip
        for frame, values in frames:
            pose(frame, values)
        clip.frame_range = (1, end)

    action("Hermes_Idle", 192, [
        (1, {"root": {"location": (0, 0, 0)}, "head": {"rotation": (0, 0, -1.2)}, "mantle_l": {"rotation": (0, 0, -1.5)}, "mantle_r": {"rotation": (0, 0, 1.0)}}),
        (48, {"root": {"location": (0, 0, 0.025)}, "torso": {"rotation": (0.7, 0, 0)}, "head": {"rotation": (-0.8, 1.4, 1.0)}, "mantle_l": {"rotation": (0.4, 0, -0.5)}, "mantle_r": {"rotation": (-0.4, 0, 1.8)}}),
        (82, {"root": {"location": (0, 0, 0.012)}, "head": {"rotation": (0, -1.2, 0.5)}, "eye_l": {"scale": (1, 1, 0.12)}, "eye_r": {"scale": (1, 1, 0.12)}}),
        (86, {"root": {"location": (0, 0, 0.010)}, "head": {"rotation": (0, -1.0, 0.4)}}),
        (96, {"root": {"location": (0, 0, 0)}, "head": {"rotation": (0.6, -1.4, -0.8)}, "mantle_l": {"rotation": (-0.3, 0, -1.7)}, "mantle_r": {"rotation": (0.3, 0, 0.2)}}),
        (144, {"root": {"location": (0, 0, -0.015)}, "torso": {"rotation": (-0.5, 0, 0)}, "head": {"rotation": (0.3, 0.8, -0.4)}, "mantle_l": {"rotation": (0.2, 0, -0.7)}, "mantle_r": {"rotation": (-0.2, 0, 1.4)}}),
        (192, {"root": {"location": (0, 0, 0)}, "head": {"rotation": (0, 0, -1.2)}, "mantle_l": {"rotation": (0, 0, -1.5)}, "mantle_r": {"rotation": (0, 0, 1.0)}}),
    ])

    action("Hermes_Guiding", 84, [
        (1, {}),
        (20, {"head": {"rotation": (-2, -5, 3)}, "upper_arm_r": {"rotation": (-18, 8, -22)}, "forearm_r": {"rotation": (-22, -4, -28)}, "hand_r": {"rotation": (0, 18, -12)}, "mantle_r": {"rotation": (0, 8, 8)}}),
        (48, {"head": {"rotation": (-1, -7, 4)}, "upper_arm_r": {"rotation": (-22, 10, -30)}, "forearm_r": {"rotation": (-28, -3, -38)}, "hand_r": {"rotation": (0, 24, -16)}, "mantle_r": {"rotation": (0, 10, 11)}, "page_r_01": {"rotation": (0, 7, 4)}}),
        (70, {"head": {"rotation": (-2, -5, 3)}, "upper_arm_r": {"rotation": (-18, 8, -22)}, "forearm_r": {"rotation": (-22, -4, -28)}, "hand_r": {"rotation": (0, 18, -12)}, "mantle_r": {"rotation": (0, 8, 8)}}),
        (84, {}),
    ])

    action("Hermes_Scanning", 96, [
        (1, {}),
        (20, {"head": {"rotation": (3, 0, 0)}, "mantle_l": {"rotation": (0, -10, -8)}, "mantle_r": {"rotation": (0, 10, 8)}, "page_l_01": {"rotation": (0, -12, -6)}, "page_r_01": {"rotation": (0, 12, 6)}}),
        (48, {"head": {"rotation": (-3, 7, 0)}, "mantle_l": {"rotation": (0, -15, -10)}, "mantle_r": {"rotation": (0, 15, 10)}, "page_l_01": {"rotation": (0, -18, -9)}, "page_l_02": {"rotation": (0, -10, -5)}, "page_r_01": {"rotation": (0, 18, 9)}, "page_r_02": {"rotation": (0, 10, 5)}}),
        (72, {"head": {"rotation": (2, -7, 0)}, "mantle_l": {"rotation": (0, -12, -8)}, "mantle_r": {"rotation": (0, 12, 8)}, "page_l_01": {"rotation": (0, -14, -7)}, "page_r_01": {"rotation": (0, 14, 7)}}),
        (96, {}),
    ])

    action("Hermes_Suggesting", 108, [
        (1, {}),
        (24, {"head": {"rotation": (-4, 0, 0)}, "upper_arm_l": {"rotation": (-18, -8, 22)}, "forearm_l": {"rotation": (-32, 4, 30)}, "hand_l": {"rotation": (0, -20, 8)}, "upper_arm_r": {"rotation": (-18, 8, -22)}, "forearm_r": {"rotation": (-32, -4, -30)}, "hand_r": {"rotation": (0, 20, -8)}}),
        (52, {"root": {"location": (0, 0, 0.02)}, "head": {"rotation": (-6, 0, 0)}, "upper_arm_l": {"rotation": (-22, -10, 26)}, "forearm_l": {"rotation": (-38, 5, 36)}, "hand_l": {"rotation": (0, -26, 10)}, "upper_arm_r": {"rotation": (-22, 10, -26)}, "forearm_r": {"rotation": (-38, -5, -36)}, "hand_r": {"rotation": (0, 26, -10)}, "page_l_01": {"rotation": (0, -8, -4)}, "page_r_01": {"rotation": (0, 8, 4)}}),
        (82, {"head": {"rotation": (-4, 0, 0)}, "upper_arm_l": {"rotation": (-18, -8, 22)}, "forearm_l": {"rotation": (-32, 4, 30)}, "hand_l": {"rotation": (0, -20, 8)}, "upper_arm_r": {"rotation": (-18, 8, -22)}, "forearm_r": {"rotation": (-32, -4, -30)}, "hand_r": {"rotation": (0, 20, -8)}}),
        (108, {}),
    ])

    action("Hermes_AwaitingApproval", 2, [(1, {}), (2, {})])

    action("Hermes_Failed", 72, [
        (1, {}),
        (8, {"root": {"location": (0, 0, -0.035)}, "torso": {"rotation": (3, 0, 0)}, "head": {"rotation": (7, 0, 0)}, "mantle_l": {"rotation": (0, 0, 5)}, "mantle_r": {"rotation": (0, 0, -5)}}),
        (16, {"root": {"location": (0, 0, -0.015)}, "head": {"rotation": (5, 0, 2)}, "eye_l": {"scale": (1, 1, 0.55)}, "eye_r": {"scale": (1, 1, 0.55)}}),
        (30, {"root": {"location": (0, 0, -0.025)}, "torso": {"rotation": (2, 0, 0)}, "head": {"rotation": (6, 0, 0)}, "eye_l": {"scale": (1, 1, 0.45)}, "eye_r": {"scale": (1, 1, 0.45)}, "upper_arm_l": {"rotation": (4, 0, 4)}, "upper_arm_r": {"rotation": (4, 0, -4)}}),
        (72, {"root": {"location": (0, 0, -0.025)}, "torso": {"rotation": (2, 0, 0)}, "head": {"rotation": (6, 0, 0)}, "eye_l": {"scale": (1, 1, 0.45)}, "eye_r": {"scale": (1, 1, 0.45)}, "upper_arm_l": {"rotation": (4, 0, 4)}, "upper_arm_r": {"rotation": (4, 0, -4)}}),
    ])

    armature.animation_data.action = bpy.data.actions["Hermes_Idle"]
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 192
    bpy.context.scene.frame_set(1)


def stamp_glb(path: Path) -> None:
    data = path.read_bytes()
    magic, version, _length = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise RuntimeError("export did not produce GLB 2.0")
    offset = 12
    chunks: list[tuple[int, bytes]] = []
    document = None
    while offset < len(data):
        length, chunk_type = struct.unpack_from("<II", data, offset)
        payload = data[offset + 8 : offset + 8 + length]
        if chunk_type == 0x4E4F534A:
            document = json.loads(payload.decode("utf-8").rstrip(" \t\r\n\0"))
            document.setdefault("asset", {})["generator"] = "OpenScience Hermes / Blender 4.5 LTS"
            payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
        chunks.append((chunk_type, payload))
        offset += 8 + length
    if document is None:
        raise RuntimeError("exported GLB has no JSON chunk")
    rebuilt = bytearray(b"\0" * 12)
    for chunk_type, payload in chunks:
        pad_byte = b" " if chunk_type == 0x4E4F534A else b"\0"
        padded = payload + pad_byte * ((4 - len(payload) % 4) % 4)
        rebuilt.extend(struct.pack("<II", len(padded), chunk_type))
        rebuilt.extend(padded)
    struct.pack_into("<III", rebuilt, 0, magic, version, len(rebuilt))
    path.write_bytes(rebuilt)


def build(output_root: Path) -> None:
    reset_scene()
    bpy.context.preferences.filepaths.save_version = 0
    assets_dir = output_root / "assets" / "hermes"
    public_dir = output_root / "public" / "hermes"
    assets_dir.mkdir(parents=True, exist_ok=True)
    public_dir.mkdir(parents=True, exist_ok=True)

    bone = make_material("Hermes_BoneCeramic", (0.76, 0.72, 0.64, 1), 0.68)
    smoke = make_material("Hermes_SmokeGlass", (0.018, 0.024, 0.031, 1), 0.27, metallic=0.08)
    titanium = make_material("Hermes_Titanium", (0.045, 0.052, 0.061, 1), 0.31, metallic=0.88)
    eye = make_material("Hermes_EyeIvory", (0.82, 0.78, 0.68, 1), 0.32, emission=(0.42, 0.38, 0.28, 1), emission_strength=1.0)
    cyan = make_material("Hermes_IndexCyan", (0.04, 0.23, 0.28, 1), 0.28, metallic=0.24, emission=(0.05, 0.65, 0.78, 1), emission_strength=2.2)
    coral = make_material("Hermes_AnnotationCoral", (0.35, 0.09, 0.045, 1), 0.31, metallic=0.18, emission=(1.0, 0.20, 0.06, 1), emission_strength=1.65)

    armature = create_rig()
    parts: list[tuple[bpy.types.Object, str]] = []

    parts.extend([
        (lofted_body("Hermes_Torso", [
            (0.50, 0.34, 0.23),
            (0.68, 0.45, 0.28),
            (1.12, 0.52, 0.31),
            (1.38, 0.48, 0.29),
            (1.48, 0.38, 0.25),
        ], titanium), "torso"),
        (rounded_box("Hermes_Spine", (0, 0.305, 1.07), (0.14, 0.105, 0.92), titanium, 0.05), "spine"),
        (curved_back_mantle("Hermes_MantleBack", bone), "torso"),
        (ellipsoid("Hermes_Core", (0, 0.03, 0.43), (0.34, 0.26, 0.22), titanium), "core"),
        (ellipsoid("Hermes_CoreGlow", (0, -0.205, 0.405), (0.16, 0.038, 0.075), cyan, segments=20, rings=10), "core"),
        (cylinder_between("Hermes_Neck", (0, 0, 1.42), (0, 0, 1.62), 0.13, titanium), "neck"),
        (ellipsoid("Hermes_Head", (0, 0, 1.96), (0.53, 0.37, 0.31), bone, segments=32, rings=16), "head"),
        (ellipsoid("Hermes_VisorBezel", (0, -0.344, 1.96), (0.465, 0.069, 0.215), titanium, segments=32, rings=16), "head"),
        (ellipsoid("Hermes_Face", (0, -0.366, 1.96), (0.425, 0.052, 0.185), smoke, segments=32, rings=16), "head"),
        (rounded_box("Hermes_Eye_L", (-0.19, -0.402, 1.98), (0.18, 0.020, 0.032), eye, 0.014, rotation=(0, 0, math.radians(2))), "eye_l"),
        (rounded_box("Hermes_Eye_R", (0.19, -0.402, 1.98), (0.18, 0.020, 0.032), eye, 0.014, rotation=(0, 0, math.radians(-2))), "eye_r"),
        (rounded_box("Hermes_CrownSeam", (0, -0.022, 2.278), (0.035, 0.30, 0.018), titanium, 0.008), "head"),
        (curve_trim("Hermes_Collar", [(-0.30, -0.05, 1.48), (-0.18, -0.25, 1.50), (0, -0.30, 1.505), (0.18, -0.25, 1.50), (0.30, -0.05, 1.48)], 0.035, titanium), "torso"),
    ])

    parts.extend([
        (ellipsoid("Hermes_Mantle_L", (-0.40, -0.02, 1.40), (0.33, 0.27, 0.085), bone, rotation=(math.radians(4), math.radians(-7), math.radians(-7))), "mantle_l"),
        (ellipsoid("Hermes_Mantle_R", (0.40, -0.02, 1.40), (0.33, 0.27, 0.085), bone, rotation=(math.radians(4), math.radians(7), math.radians(7))), "mantle_r"),
        (curved_mantle_panel("Hermes_MantleFront_L", -1.0, bone), "mantle_l"),
        (curved_mantle_panel("Hermes_MantleFront_R", 1.0, bone), "mantle_r"),
        (tapered_panel("Hermes_PageEdge_L", [(-0.06, 0.55), (-0.53, 0.63), (-0.52, 0.53), (-0.06, 0.45)], -0.275, 0.050, titanium, 0.018), "page_l_01"),
        (tapered_panel("Hermes_PageEdge_R", [(0.06, 0.55), (0.53, 0.63), (0.52, 0.53), (0.06, 0.45)], -0.275, 0.050, titanium, 0.018), "page_r_01"),
        (tapered_panel("Hermes_Page_L_01", [(-0.07, 0.50), (-0.50, 0.57), (-0.48, 0.52), (-0.07, 0.45)], -0.305, 0.025, cyan, 0.010), "page_l_01"),
        (tapered_panel("Hermes_Page_L_02", [(-0.08, 0.47), (-0.46, 0.53), (-0.44, 0.50), (-0.08, 0.44)], -0.300, 0.020, titanium, 0.008), "page_l_02"),
        (tapered_panel("Hermes_Page_R_01", [(0.07, 0.50), (0.50, 0.57), (0.48, 0.52), (0.07, 0.45)], -0.305, 0.025, coral, 0.010), "page_r_01"),
        (tapered_panel("Hermes_Page_R_02", [(0.08, 0.47), (0.46, 0.53), (0.44, 0.50), (0.08, 0.44)], -0.300, 0.020, titanium, 0.008), "page_r_02"),
        (rounded_box("Hermes_BindingSpine", (0, -0.414, 0.99), (0.068, 0.032, 0.91), titanium, 0.018), "spine"),
        (rounded_box("Hermes_Bookmark", (0.015, -0.435, 0.69), (0.020, 0.012, 0.18), coral, 0.008), "spine"),
        (curve_trim("Hermes_MantleTrim_L", [(-0.065, -0.432, 1.46), (-0.065, -0.432, 1.12), (-0.070, -0.430, 0.78), (-0.072, -0.420, 0.52)], 0.012, titanium), "mantle_l"),
        (curve_trim("Hermes_MantleTrim_R", [(0.065, -0.432, 1.46), (0.065, -0.432, 1.12), (0.070, -0.430, 0.78), (0.072, -0.420, 0.52)], 0.012, titanium), "mantle_r"),
        (ellipsoid("Hermes_ShoulderJoint_L", (-0.64, 0, 1.25), (0.14, 0.15, 0.14), titanium, segments=20, rings=10), "upper_arm_l"),
        (ellipsoid("Hermes_ShoulderJoint_R", (0.64, 0, 1.25), (0.14, 0.15, 0.14), titanium, segments=20, rings=10), "upper_arm_r"),
    ])

    parts.extend([
        (ellipsoid("Hermes_Arm_L", (-0.75, 0, 1.03), (0.135, 0.15, 0.29), bone, rotation=(0, math.radians(-4), math.radians(-7))), "upper_arm_l"),
        (ellipsoid("Hermes_Elbow_L", (-0.80, 0, 0.79), (0.12, 0.13, 0.12), titanium, segments=20, rings=10), "forearm_l"),
        (ellipsoid("Hermes_Forearm_L", (-0.81, -0.01, 0.64), (0.115, 0.13, 0.23), bone, rotation=(0, math.radians(-2), math.radians(-3))), "forearm_l"),
        (ellipsoid("Hermes_Hand_L", (-0.81, -0.05, 0.42), (0.13, 0.105, 0.115), titanium, rotation=(0, 0, math.radians(3)), segments=20, rings=10), "hand_l"),
        (ellipsoid("Hermes_Finger_L_01", (-0.87, -0.09, 0.32), (0.042, 0.055, 0.12), bone, rotation=(math.radians(-8), 0, math.radians(8)), segments=16, rings=8), "hand_l"),
        (ellipsoid("Hermes_Finger_L_02", (-0.75, -0.09, 0.32), (0.042, 0.055, 0.115), bone, rotation=(math.radians(-8), 0, math.radians(-5)), segments=16, rings=8), "hand_l"),
        (ellipsoid("Hermes_Thumb_L", (-0.69, -0.10, 0.39), (0.040, 0.050, 0.090), titanium, rotation=(math.radians(-18), math.radians(-18), math.radians(-38)), segments=16, rings=8), "hand_l"),
        (ellipsoid("Hermes_Arm_R", (0.75, 0, 1.03), (0.135, 0.15, 0.29), bone, rotation=(0, math.radians(4), math.radians(7))), "upper_arm_r"),
        (ellipsoid("Hermes_Elbow_R", (0.80, 0, 0.79), (0.12, 0.13, 0.12), titanium, segments=20, rings=10), "forearm_r"),
        (ellipsoid("Hermes_Forearm_R", (0.81, -0.01, 0.64), (0.115, 0.13, 0.23), bone, rotation=(0, math.radians(2), math.radians(3))), "forearm_r"),
        (ellipsoid("Hermes_Hand_R", (0.81, -0.05, 0.42), (0.13, 0.105, 0.115), titanium, rotation=(0, 0, math.radians(-3)), segments=20, rings=10), "hand_r"),
        (ellipsoid("Hermes_Finger_R_01", (0.87, -0.09, 0.32), (0.042, 0.055, 0.12), bone, rotation=(math.radians(-8), 0, math.radians(-8)), segments=16, rings=8), "hand_r"),
        (ellipsoid("Hermes_Finger_R_02", (0.75, -0.09, 0.32), (0.042, 0.055, 0.115), bone, rotation=(math.radians(-8), 0, math.radians(5)), segments=16, rings=8), "hand_r"),
        (ellipsoid("Hermes_Thumb_R", (0.69, -0.10, 0.39), (0.040, 0.050, 0.090), titanium, rotation=(math.radians(-18), math.radians(18), math.radians(38)), segments=16, rings=8), "hand_r"),
    ])

    index_light = rounded_box("Hermes_IndexLight", (-0.47, -0.286, 1.34), (0.30, 0.020, 0.026), cyan, 0.010, rotation=(0, 0, math.radians(-12)))
    annotation_light = rounded_box("Hermes_AnnotationLight", (0.47, -0.286, 1.34), (0.30, 0.020, 0.026), coral, 0.010, rotation=(0, 0, math.radians(12)))
    parts.extend([(index_light, "mantle_l"), (annotation_light, "mantle_r")])

    export_objects = skin_and_merge_parts(parts, armature)

    create_actions(armature)

    ground = rounded_box("Review_Ground", (0, 0.55, -0.30), (5.8, 4.5, 0.06), titanium, 0.025)
    ground.hide_render = True

    camera_data = bpy.data.cameras.new("Review_Camera")
    camera = bpy.data.objects.new("Review_Camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (2.45, -5.8, 2.55)
    camera_data.lens = 66
    aim_at(camera, (0, 0, 1.22))
    bpy.context.scene.camera = camera

    key = add_named_light("Review_Key", (-3.2, -4.8, 5.5), 1050, (1.0, 0.86, 0.70), 4.2)
    aim_at(key, (0, 0, 1.2))
    rim_cyan = add_named_light("Review_Cyan", (-3.8, 1.5, 2.4), 760, (0.08, 0.60, 0.82), 3.0)
    aim_at(rim_cyan, (0, 0, 1.25))
    rim_coral = add_named_light("Review_Coral", (3.8, 1.0, 1.8), 620, (1.0, 0.19, 0.06), 2.7)
    aim_at(rim_coral, (0, 0, 1.1))
    fill = add_named_light("Review_Fill", (0, -2.2, 4.8), 420, (0.55, 0.65, 0.75), 3.2)
    aim_at(fill, (0, 0, 1.2))

    poster_path = public_dir / "hermes-scholar-poster.webp"
    bpy.context.scene.render.filepath = str(poster_path)
    bpy.context.scene.render.image_settings.file_format = "WEBP"
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.render.resolution_x = 1440
    bpy.context.scene.render.resolution_y = 900
    armature.animation_data.action = bpy.data.actions["Hermes_Suggesting"]
    bpy.context.scene.frame_set(52)
    bpy.ops.render.render(write_still=True)

    armature.animation_data.action = bpy.data.actions["Hermes_Idle"]
    bpy.context.scene.frame_set(1)

    for review_object in [ground, camera, key, rim_cyan, rim_coral, fill]:
        review_object.hide_render = True
        review_object.hide_viewport = True

    blend_path = assets_dir / "Hermes.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)

    glb_path = public_dir / "hermes-scholar.glb"
    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for model_object in export_objects:
        model_object.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_merge_animation="ACTION",
        export_extra_animations=True,
        export_extras=True,
        export_cameras=False,
        export_lights=False,
        export_yup=True,
    )
    stamp_glb(glb_path)
    print(json.dumps({
        "blend": str(blend_path),
        "glb": str(glb_path),
        "poster": str(poster_path),
    }, indent=2))


if __name__ == "__main__":
    build(parse_args().output_root.resolve())
