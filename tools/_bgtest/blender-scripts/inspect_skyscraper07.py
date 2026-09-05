"""
READ-ONLY inspection of 01_Skyscraper07 inside SkyscraperPack01_REV_2_DAY.blend.
Run with the bpy module (no GUI Blender needed):
    tools/_bgtest/venv-blender/Scripts/python.exe tools/_bgtest/blender-scripts/inspect_skyscraper07.py

Does NOT save/overwrite the source .blend. Opens it, inspects, prints a report, exits.
"""
import bpy
import os
import sys
import json

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '3d', 'bg', 'SkyscraperPack01_REV_2_DAY.blend'))
TARGET_NAME = '01_Skyscraper07'

def main():
    if not os.path.isfile(SRC):
        print('ERROR: source .blend not found at', SRC)
        sys.exit(1)

    bpy.ops.wm.open_mainfile(filepath=SRC)

    report = {'source': SRC, 'target': TARGET_NAME}

    obj = bpy.data.objects.get(TARGET_NAME)
    if obj is None:
        print('ERROR: object', TARGET_NAME, 'not found. Available objects containing "Skyscraper07":')
        for o in bpy.data.objects:
            if 'Skyscraper07' in o.name:
                print('  -', o.name, o.type)
        sys.exit(1)

    report['object_type'] = obj.type
    report['parent'] = obj.parent.name if obj.parent else None
    report['parent_type'] = obj.parent.type if obj.parent else None

    # transform (local, as stored) and world (evaluated with parent chain)
    report['local_location'] = list(obj.location)
    report['local_rotation_euler'] = list(obj.rotation_euler)
    report['local_scale'] = list(obj.scale)
    report['matrix_world'] = [list(row) for row in obj.matrix_world]

    # walk up parent chain
    chain = []
    p = obj.parent
    while p is not None:
        chain.append({
            'name': p.name, 'type': p.type,
            'location': list(p.location), 'rotation_euler': list(p.rotation_euler), 'scale': list(p.scale)
        })
        p = p.parent
    report['parent_chain'] = chain

    # children (direct)
    children = [c.name for c in obj.children]
    report['direct_children'] = children

    # hidden state
    report['hide_viewport'] = obj.hide_get()
    report['hide_render'] = obj.hide_render

    # modifiers on the object itself
    report['modifiers'] = [{'name': m.name, 'type': m.type} for m in obj.modifiers]

    # mesh data
    if obj.type == 'MESH':
        mesh = obj.data
        report['mesh_data_name'] = mesh.name
        report['mesh_users'] = mesh.users  # >1 means shared mesh data (instancing)
        report['vertex_count'] = len(mesh.vertices)
        report['polygon_count'] = len(mesh.polygons)
        # triangle count estimate (sum of (verts-2) per poly, ngon-safe)
        tri_count = sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
        report['triangle_count_estimate'] = tri_count

        report['material_slots'] = []
        for slot in obj.material_slots:
            mat = slot.material
            report['material_slots'].append({
                'slot_link': slot.link,
                'material_name': mat.name if mat else None,
                'use_nodes': mat.use_nodes if mat else None,
            })

        # per-material face count
        mat_face_counts = {}
        for poly in mesh.polygons:
            idx = poly.material_index
            mat_face_counts[idx] = mat_face_counts.get(idx, 0) + 1
        report['faces_per_material_index'] = mat_face_counts

        # material node graph summary (per material used by this object)
        mat_details = {}
        for slot in obj.material_slots:
            mat = slot.material
            if mat is None:
                continue
            detail = {'use_nodes': mat.use_nodes, 'nodes': []}
            if mat.use_nodes and mat.node_tree:
                for node in mat.node_tree.nodes:
                    node_info = {'type': node.type, 'name': node.name}
                    if node.type == 'TEX_IMAGE' and node.image:
                        node_info['image'] = node.image.name
                        node_info['image_filepath'] = node.image.filepath
                    if node.type == 'BSDF_PRINCIPLED':
                        try:
                            node_info['base_color'] = list(node.inputs['Base Color'].default_value)
                            node_info['roughness'] = node.inputs['Roughness'].default_value
                            node_info['metallic'] = node.inputs['Metallic'].default_value
                        except Exception as e:
                            node_info['error'] = str(e)
                    detail['nodes'].append(node_info)
            mat_details[mat.name] = detail
        report['material_details'] = mat_details

        # is mesh data shared with any other object in the file?
        users_of_this_mesh = [o.name for o in bpy.data.objects if o.type == 'MESH' and o.data == mesh]
        report['objects_sharing_this_mesh_data'] = users_of_this_mesh

    # check for any hidden mesh children (deep)
    def collect_descendants(o, acc):
        for c in o.children:
            acc.append({'name': c.name, 'type': c.type, 'hide_viewport': c.hide_get(), 'hide_render': c.hide_render})
            collect_descendants(c, acc)
    descendants = []
    collect_descendants(obj, descendants)
    report['all_descendants'] = descendants

    # world unit scale
    report['scene_unit_scale'] = bpy.context.scene.unit_settings.scale_length
    report['scene_unit_system'] = bpy.context.scene.unit_settings.system

    out_path = os.path.join(os.path.dirname(__file__), 'inspect_skyscraper07_report.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print('=== REPORT WRITTEN TO', out_path, '===')
    print(json.dumps(report, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    main()
