"""
Export: 01_Building03 — target 5k-10k triangles (max 12k), 2 materials (facade, glass),
no external textures. Reads SkyscraperPack01_REV_2_DAY.blend (never saved back), builds
the reduced mesh in memory, exports a standalone GLB. Source .blend untouched.

Run:
    tools/_bgtest/venv-blender/Scripts/python.exe tools/_bgtest/blender-scripts/export_building03.py -- [decimate_ratio]
"""
import bpy, bmesh, os, json, sys

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '3d', 'bg', 'SkyscraperPack01_REV_2_DAY.blend'))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'generated', 'building03-optimized.glb'))
TARGET_NAME = '01_Building03'
DECIMATE_RATIO = float(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv and len(sys.argv) > sys.argv.index('--') + 1 else 0.22

bpy.ops.wm.open_mainfile(filepath=SRC)
obj = bpy.data.objects[TARGET_NAME]

# recenter: drop pack rotation/xy location, keep Z so the height offset is preserved,
# then bake the (negative-X, non-uniform) pack scale into the mesh — same treatment as
# Skyscraper07/Residential_04's export.
obj.rotation_euler = (0.0, 0.0, 0.0)
obj.location = (0.0, 0.0, obj.location.z)
bpy.context.view_layer.objects.active = obj
for o in bpy.context.scene.objects:
    o.select_set(False)
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

mesh = obj.data

# 5 source slots -> 2 groups by SLOT INDEX (mirrors residential04's approach).
# Facade (opaque): Metal0100, Metal02, Wall01 (the only slot with UV textures — stripped
# below, replaced with a flat color, per "no external textures" requirement).
# Glass: Easy GlassC, Easy Glass.
FACADE_NAMES = {'Metal0100', 'Metal02', 'Wall01'}
slot_names = [s.material.name if s.material else None for s in obj.material_slots]
facade_slot_indices = {i for i, n in enumerate(slot_names) if n in FACADE_NAMES}
glass_slot_indices = {i for i, n in enumerate(slot_names) if n is not None and i not in facade_slot_indices}

first_glass_slot = min(glass_slot_indices) if glass_slot_indices else None
first_facade_slot = min(facade_slot_indices) if facade_slot_indices else 0
for poly in mesh.polygons:
    if poly.material_index in facade_slot_indices:
        poly.material_index = first_facade_slot
    elif first_glass_slot is not None and poly.material_index in glass_slot_indices:
        poly.material_index = first_glass_slot

keep = {first_facade_slot, first_glass_slot} - {None}
bpy.ops.object.mode_set(mode='OBJECT')
for i in sorted(range(len(obj.material_slots)), reverse=True):
    if i not in keep:
        obj.active_material_index = i
        bpy.ops.object.material_slot_remove()

remaining = [s.material.name if s.material else None for s in obj.material_slots]
facade_idx = remaining.index(slot_names[first_facade_slot])
glass_idx = 1 - facade_idx if len(remaining) == 2 else remaining.index(slot_names[first_glass_slot])

# clean + remove interior (never-visible) faces before decimating
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(mesh)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
bmesh.update_edit_mesh(mesh)
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.mesh.select_interior_faces()
bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')

def tri_count():
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)

pre_decimate_tris = tri_count()

mod = obj.modifiers.new(name='Decimate', type='DECIMATE')
mod.decimate_type = 'COLLAPSE'
mod.ratio = DECIMATE_RATIO
bpy.context.view_layer.objects.active = obj
bpy.ops.object.modifier_apply(modifier=mod.name)

# negative-X pack scale flips winding on apply; recompute consistent outward normals
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

post_decimate_tris = tri_count()

# Flat PBR colors, no image textures. Same cool grey-blue family as Skyscraper07/
# Residential_04 (FACADE_BASE), shifted slightly darker so Building03 reads as the
# nearest/darkest silhouette layer of the three (per brief: near layer should be
# distinguishable, not identical brightness to the two farther buildings).
FACADE_BASE = (0.14, 0.17, 0.21)
BRIGHTNESS_SHIFT = 0.94  # ~6% darker than Skyscraper07's baseline
facade_color = tuple(min(1.0, c * BRIGHTNESS_SHIFT) for c in FACADE_BASE) + (1.0,)
glass_color = tuple(min(1.0, c * BRIGHTNESS_SHIFT * 0.90) for c in FACADE_BASE[:2]) + (min(1.0, FACADE_BASE[2] * BRIGHTNESS_SHIFT * 0.90 + 0.015), 1.0)

for i, slot in enumerate(obj.material_slots):
    mat = slot.material
    if mat is None:
        continue
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    principled = nt.nodes.new('ShaderNodeBsdfPrincipled')
    output = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
    if i == facade_idx:
        mat.name = 'facade'
        principled.inputs['Base Color'].default_value = facade_color
        principled.inputs['Roughness'].default_value = 0.84
        principled.inputs['Metallic'].default_value = 0.0
    else:
        mat.name = 'glass'
        principled.inputs['Base Color'].default_value = glass_color
        principled.inputs['Roughness'].default_value = 0.60
        principled.inputs['Metallic'].default_value = 0.0

for o in bpy.context.scene.objects:
    o.select_set(False)
obj.select_set(True)
bpy.context.view_layer.objects.active = obj

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_materials='EXPORT',
    export_cameras=False,
    export_lights=False,
    export_extras=False,
    export_image_format='NONE',
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
)

final_tris = tri_count()
final_verts = len(mesh.vertices)
final_mats = [s.material.name for s in obj.material_slots if s.material]
mesh.calc_loop_triangles()
bbox_local = None
if mesh.vertices:
    xs = [v.co.x for v in mesh.vertices]; ys = [v.co.y for v in mesh.vertices]; zs = [v.co.z for v in mesh.vertices]
    bbox_local = {'min': [min(xs), min(ys), min(zs)], 'max': [max(xs), max(ys), max(zs)]}

report = {
    'output': OUT,
    'file_size_bytes': os.path.getsize(OUT),
    'decimate_ratio_used': DECIMATE_RATIO,
    'raw_triangle_count': 36066,
    'pre_decimate_triangle_count': pre_decimate_tris,
    'post_decimate_triangle_count': post_decimate_tris,
    'final_triangle_count': final_tris,
    'final_vertex_count': final_verts,
    'material_count': len(final_mats),
    'materials': final_mats,
    'local_bbox': bbox_local,
    'in_target_tri_range_5k_10k': 5000 <= final_tris <= 10000,
    'under_12k_hard_cap': final_tris <= 12000,
    'under_250kb': os.path.getsize(OUT) < 250_000,
    'draco_compressed': True,
    'facade_color': facade_color,
    'glass_color': glass_color,
}
with open(os.path.join(os.path.dirname(__file__), 'export_building03_report.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2)
print(json.dumps(report, indent=2))
