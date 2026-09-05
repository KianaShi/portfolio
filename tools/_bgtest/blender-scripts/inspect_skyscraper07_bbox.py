"""READ-ONLY: bounding box + material submesh geometry check for 01_Skyscraper07."""
import bpy, os, json
from mathutils import Vector

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '3d', 'bg', 'SkyscraperPack01_REV_2_DAY.blend'))
TARGET_NAME = '01_Skyscraper07'

bpy.ops.wm.open_mainfile(filepath=SRC)
obj = bpy.data.objects[TARGET_NAME]
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

# local bound_box (8 corners, object space)
local_corners = [Vector(c) for c in obj.bound_box]
lx = [c.x for c in local_corners]; ly = [c.y for c in local_corners]; lz = [c.z for c in local_corners]
local_dims = (max(lx)-min(lx), max(ly)-min(ly), max(lz)-min(lz))

# world-space corners
world_corners = [obj.matrix_world @ c for c in local_corners]
wx = [c.x for c in world_corners]; wy = [c.y for c in world_corners]; wz = [c.z for c in world_corners]

report = {
    'local_dimensions_xyz': list(local_dims),
    'blender_reported_dimensions': list(obj.dimensions),
    'world_bbox_min': [min(wx), min(wy), min(wz)],
    'world_bbox_max': [max(wx), max(wy), max(wz)],
    'world_bbox_size': [max(wx)-min(wx), max(wy)-min(wy), max(wz)-min(wz)],
}

# per-material bbox (which slot covers which geometric region — top/bottom/sides)
mesh = obj.data
mat_bbox = {}
for poly in mesh.polygons:
    idx = poly.material_index
    slot_name = obj.material_slots[idx].material.name if obj.material_slots[idx].material else str(idx)
    b = mat_bbox.setdefault(slot_name, {'min': [1e18,1e18,1e18], 'max': [-1e18,-1e18,-1e18], 'face_count': 0})
    b['face_count'] += 1
    for vi in poly.vertices:
        co = mesh.vertices[vi].co
        for k, val in enumerate((co.x, co.y, co.z)):
            b['min'][k] = min(b['min'][k], val)
            b['max'][k] = max(b['max'][k], val)
report['material_local_bbox'] = mat_bbox

out_path = os.path.join(os.path.dirname(__file__), 'inspect_skyscraper07_bbox_report.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2, ensure_ascii=False)
print(json.dumps(report, indent=2, ensure_ascii=False))
