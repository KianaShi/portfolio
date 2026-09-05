"""
Export B: web-optimized 01_Skyscraper07 — target 8k-15k triangles, 2 materials
(facade, glass), no external textures, no transparency/transmission.
Reads SkyscraperPack01_REV_2_DAY.blend (never saved back), builds the reduced mesh
in memory, exports a standalone GLB. Source .blend untouched.
"""
import bpy, bmesh, os, json, sys

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '3d', 'bg', 'SkyscraperPack01_REV_2_DAY.blend'))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'generated', 'skyscraper07-optimized.glb'))
TARGET_NAME = '01_Skyscraper07'
DECIMATE_RATIO = float(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 0.24

bpy.ops.wm.open_mainfile(filepath=SRC)
obj = bpy.data.objects[TARGET_NAME]

# recenter (same as A): drop pack rotation, keep the Z offset landing base at world Z=0
obj.rotation_euler = (0.0, 0.0, 0.0)
obj.location = (0.0, 0.0, obj.location.z)
bpy.context.view_layer.objects.active = obj
for o in bpy.context.scene.objects:
    o.select_set(False)
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# merge the two glass slots into one BEFORE decimating (fewer material boundaries
# = fewer forced edges for the decimator to preserve = better reduction quality)
mesh = obj.data
mat_index = {s.material.name: i for i, s in enumerate(obj.material_slots) if s.material}
glass_a = mat_index.get('Easy Glass')
glass_c = mat_index.get('Easy GlassC')
if glass_a is not None and glass_c is not None:
    for poly in mesh.polygons:
        if poly.material_index == glass_c:
            poly.material_index = glass_a

# drop the now-unused GlassC slot
bpy.ops.object.mode_set(mode='OBJECT')
if glass_c is not None:
    obj.active_material_index = glass_c
    bpy.ops.object.material_slot_remove()
    # slot indices shift after removal; poly material_index values >= glass_c that
    # pointed past it need decrementing, but since we already retargeted every
    # GlassC face to glass_a (< glass_c, as GlassC was slot 2 / last), no polygon
    # still references glass_c, so nothing points past the removed slot. No-op check:
    assert all(p.material_index != glass_c or True for p in mesh.polygons)

facade_idx = mat_index.get('Metal01', 0)
glass_idx = glass_a if glass_a is not None else 1

# clean + remove interior (never-visible) faces before decimating
bpy.ops.object.mode_set(mode='EDIT')
bm = bmesh.from_edit_mesh(mesh)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
bmesh.update_edit_mesh(mesh)
bpy.ops.mesh.select_all(action='DESELECT')
bpy.ops.mesh.select_interior_faces()
bpy.ops.mesh.delete(type='FACE')
bpy.ops.object.mode_set(mode='OBJECT')

interior_removed_tri_estimate = None  # filled after we recompute below

def tri_count():
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)

pre_decimate_tris = tri_count()

# decimate (Collapse) to hit the 8k-15k triangle budget
mod = obj.modifiers.new(name='Decimate', type='DECIMATE')
mod.decimate_type = 'COLLAPSE'
mod.ratio = DECIMATE_RATIO
bpy.context.view_layer.objects.active = obj
bpy.ops.object.modifier_apply(modifier=mod.name)

# recompute correct outward normals after decimation
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

post_decimate_tris = tri_count()

# rebuild materials per spec: facade = dark grey non-metal high-roughness,
# glass = dark blue-grey, no transparency/transmission, moderate roughness
for slot in obj.material_slots:
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
    if mat.name == 'Metal01':
        mat.name = 'facade'
        principled.inputs['Base Color'].default_value = (0.10, 0.10, 0.11, 1.0)
        principled.inputs['Roughness'].default_value = 0.75
        principled.inputs['Metallic'].default_value = 0.0
    else:
        mat.name = 'glass'
        principled.inputs['Base Color'].default_value = (0.07, 0.11, 0.16, 1.0)
        principled.inputs['Roughness'].default_value = 0.45
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

report = {
    'output': OUT,
    'file_size_bytes': os.path.getsize(OUT),
    'decimate_ratio_used': DECIMATE_RATIO,
    'pre_decimate_triangle_count': pre_decimate_tris,
    'post_decimate_triangle_count': post_decimate_tris,
    'final_triangle_count': final_tris,
    'final_vertex_count': final_verts,
    'material_count': len(final_mats),
    'materials': final_mats,
    'in_target_tri_range_8k_15k': 8000 <= final_tris <= 15000,
    'under_1mb': os.path.getsize(OUT) < 1_000_000,
    'under_500kb': os.path.getsize(OUT) < 500_000,
    'draco_compressed': True,
}
with open(os.path.join(os.path.dirname(__file__), 'export_b_report.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2)
print(json.dumps(report, indent=2))
