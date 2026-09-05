"""
Export A: raw extraction sanity check for 01_Skyscraper07.
- Opens SkyscraperPack01_REV_2_DAY.blend (never saved back — read then export only).
- Isolates ONLY 01_Skyscraper07 (no camera/lights/curves/other buildings/world env —
  guaranteed by exporting with use_selection=True and selecting only this object).
- Keeps original geometry untouched (no decimation).
- Keeps 3 separate material slots (not merged) — Metal01 kept as-is (already a
  Principled BSDF). "Easy Glass"/"Easy GlassC" used Blender's raw Glass BSDF node,
  which has no glTF/PBR equivalent and would otherwise export as an undefined/default
  gray material — replaced here with a Principled BSDF + KHR_materials_transmission
  approximation (light blue-grey, low roughness, transmission=1) purely so the export
  doesn't silently drop the glass look. This is a visual approximation, not a claim
  that it matches the original Blender-only Glass BSDF exactly.
- Zeroes object rotation and recenters to origin (base at world Z=0, transform applied
  via transform_apply) purely so the standalone QA file opens sanely in a generic glTF
  viewer — this does not touch the original .blend, only the in-memory duplicate before
  export.
"""
import bpy, os, sys, json, mathutils

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '3d', 'bg', 'SkyscraperPack01_REV_2_DAY.blend'))
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'generated', 'skyscraper07-original.glb'))
TARGET_NAME = '01_Skyscraper07'

bpy.ops.wm.open_mainfile(filepath=SRC)
obj = bpy.data.objects[TARGET_NAME]

# recenter: drop the pack's arbitrary Z rotation, keep the Z offset that already
# puts the base at world Z=0 (confirmed by the earlier bbox inspection: world_bbox_min.z == 0)
obj.rotation_euler = (0.0, 0.0, 0.0)
obj.location = (0.0, 0.0, obj.location.z)  # keep the 12.0 that lands the base at Z=0
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# patch the two non-Principled glass materials so export doesn't drop them to a
# default gray material (raw Glass BSDF has no glTF equivalent)
for mat_name in ('Easy Glass', 'Easy GlassC'):
    mat = bpy.data.materials.get(mat_name)
    if mat is None:
        continue
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    principled = nt.nodes.new('ShaderNodeBsdfPrincipled')
    principled.inputs['Base Color'].default_value = (0.62, 0.72, 0.78, 1.0)
    principled.inputs['Roughness'].default_value = 0.05
    principled.inputs['Metallic'].default_value = 0.0
    if 'Transmission Weight' in principled.inputs:
        principled.inputs['Transmission Weight'].default_value = 1.0
    elif 'Transmission' in principled.inputs:
        principled.inputs['Transmission'].default_value = 1.0
    output = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(principled.outputs['BSDF'], output.inputs['Surface'])
    mat.blend_method = 'BLEND' if hasattr(mat, 'blend_method') else mat.blend_method

# deselect everything else in the scene, select only target
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
)

print('=== EXPORTED A ===', OUT)
print('file size bytes:', os.path.getsize(OUT))

# report vertex/tri/material counts of exported object for the QA log
mesh = obj.data
tri_count = sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
report = {
    'output': OUT,
    'file_size_bytes': os.path.getsize(OUT),
    'vertex_count': len(mesh.vertices),
    'triangle_count': tri_count,
    'material_count': len(obj.material_slots),
    'materials': [s.material.name for s in obj.material_slots],
}
with open(os.path.join(os.path.dirname(__file__), 'export_a_report.json'), 'w', encoding='utf-8') as f:
    json.dump(report, f, indent=2)
print(json.dumps(report, indent=2))
