"""Render eight review-only turntable frames from the canonical Hermes.blend."""

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--size", type=int, default=512)
    parser.add_argument("--views", type=int, default=8)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


def aim_at(obj: bpy.types.Object, point: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    args = parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = args.size
    scene.render.resolution_y = args.size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.004, 0.005, 0.006)

    armature = bpy.data.objects["Hermes_Root"]
    armature.animation_data.action = bpy.data.actions["Hermes_Idle"]
    scene.frame_set(48)
    camera = bpy.data.objects["Review_Camera"]
    camera.hide_render = False
    camera.hide_viewport = False
    scene.camera = camera
    camera.data.lens = 64
    for name in ("Review_Key", "Review_Cyan", "Review_Coral", "Review_Fill"):
        bpy.data.objects[name].hide_render = False

    for index in range(args.views):
        angle = index * math.tau / args.views
        camera.location = (math.sin(angle) * 5.8, -math.cos(angle) * 5.8, 2.35)
        aim_at(camera, (0, 0, 1.18))
        scene.render.filepath = str(output / f"turntable-{index:02d}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
