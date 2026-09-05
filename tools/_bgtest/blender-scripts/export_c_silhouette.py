"""
Export C: silhouette-only 01_Skyscraper07 — target 1k-4k triangles, 1 material,
no textures. Same source read (never saved back) as A/B.
"""
import bpy, bmesh, os, json, sys

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '3d', 'bg', 'SkyscraperPack01_REV_2_DAY.blend'))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'generated', 'skyscraper07-silhouette.glb'))
TARGET_NAME = '01_Skyscraper07'
DECIMATE_RATIO = float(sys.argv[sys.argv.index('--') + 1]) if '--' in sys.argv else 0.045

bpy.ops.wm.open_mainfile(filepath=SRC)
obj = bpy.data.objects[TARGET_NAME]

obj.rotation_euler = (0.0, 0.0, 0.0)
obj.location = (0.0, 0.0, obj.location.z)
bpy.context.view_layer.objects.active = obj
for o in bpy.context.scene.objects:
    o.select_set(False)
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

mesh = obj.data

# clean + strip interior faces first (same as B)
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

pre_tris = tri_count()

# planar pre-pass: dissolve near-coplanar facade/mullion subdivisions first (cheap,
# shape-preserving) before the more aggressive collapse pass, so the silhouette
# keeps its corners/roofline instead of the collapse algorithm spending its budget
# smoothing out flat wall detail
mod_planar = obj.modifiers.new(name='DecimatePlanar', type='DECIMATE')
mod_planar.decimate_type = 'DISSOLVE'
mod_planar.angle_limit = 0.0872665  # 5 degrees
bpy.context.view_layer.objects.active = obj
bpy.ops.object.modifier_apply(modifier=mod_planar.name)

post_planar_tris = tri_count()

mod = obj.modifiers.new(name='Decimate', type='DECIMATE')
mod.decimate_type = 'COLLAPSE'
mod.ratio = DECIMATE_RATIO
bpy.ops.object.modifier_apply(modifier=mod.name)

bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

post_decimate_tris = tri_count()

# collapse to a single material: reassign every face to slot 0, remove all other slots
for poly in mesh.polygons:
    poly.material_index = 0
while len(obj.material_slots) > 1:
    obj.active_material_index = 1
    bpy.ops.object.material_slot_remove()

mat = obj.material_slots[0].material
mat.use_nodes = True
mat.name = 'silhouette'
nt = mat.node_tree
for n in list(nt.nodes):
    nt.nodes.remove(n)
principled = nt.nodes.new('ShaderNodeBsdfPrincipled')
output = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
principled.inputs['Base Color'].default_value = (0.06, 0.08, 0.11, 1.0)
principled.inputs['Roughness'].default_value = 0.8
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

report = {
    'output': OUT,
    'file_size_bytes': os.path.getsize(OUT),
    'decimate_ratio_used': DECIMATE_RATIO,
    'pre_tris_after_interior_removal': pre_tris,
    'post_planar_dissolve_tris': post_planar_tris,
    'post_collapse_tris': post_decimate_tris,
    'final_triangle_count': final_tris,
    'final_vertex_count': final_verts,
    'material_count': 1,
    'in_target_tri_range_1k_4k': 1000 <= final_tris <= 4000,
    'under_150kb': os.path.getsize(OUT) < 150_000,
}
with open(os.path.join(os.path.dirname(__file__), 'export_c_report.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2)
print(json.dumps(report, indent=2))
