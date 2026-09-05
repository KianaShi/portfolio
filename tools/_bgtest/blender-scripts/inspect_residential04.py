"""
READ-ONLY inspection of 001_Residential_04 inside SkyscraperPack01_REV_2_DAY.blend.
Run with the bpy module (no GUI Blender needed):
    tools/_bgtest/venv-blender/Scripts/python.exe tools/_bgtest/blender-scripts/inspect_residential04.py

Does NOT save/overwrite the source .blend. Opens it, inspects, prints a report, exits.
"""
import bpy
import os
import sys
import json

SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '3d', 'bg', 'SkyscraperPack01_REV_2_DAY.blend'))
CANDIDATES = ['001_Residential_04', 'Residential_04', '01_Residential_04']

def main():
    if not os.path.isfile(SRC):
        print('ERROR: source .blend not found at', SRC)
        sys.exit(1)

    bpy.ops.wm.open_mainfile(filepath=SRC)

    report = {'source': SRC}

    obj = None
    for name in CANDIDATES:
        obj = bpy.data.objects.get(name)
        if obj is not None:
            report['target'] = name
            break

    if obj is None:
        print('ERROR: none of', CANDIDATES, 'found. Objects containing "Residential":')
        matches = []
        for o in bpy.data.objects:
            if 'Residential' in o.name:
                print('  -', o.name, o.type)
                matches.append(o.name)
        report['available_matches'] = matches
        print(json.dumps(report, indent=2))
        sys.exit(1)

    report['type'] = obj.type
    report['location'] = list(obj.location)
    report['rotation_euler'] = list(obj.rotation_euler)
    report['scale'] = list(obj.scale)
    report['parent'] = obj.parent.name if obj.parent else None
    report['children'] = [c.name for c in obj.children]

    mesh = obj.data
    if mesh is not None:
        tri_count = sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)
        report['vertex_count'] = len(mesh.vertices)
        report['polygon_count'] = len(mesh.polygons)
        report['triangle_count_estimate'] = tri_count
        report['material_slots'] = [s.material.name if s.material else None for s in obj.material_slots]

        # per-material triangle breakdown
        mat_tris = {}
        for p in mesh.polygons:
            idx = p.material_index
            name = obj.material_slots[idx].material.name if idx < len(obj.material_slots) and obj.material_slots[idx].material else 'NONE'
            mat_tris[name] = mat_tris.get(name, 0) + max(0, len(p.vertices) - 2)
        report['triangles_per_material'] = mat_tris

        # UV / image texture check
        report['has_uv'] = len(mesh.uv_layers) > 0
        images_used = set()
        for slot in obj.material_slots:
            m = slot.material
            if m and m.use_nodes:
                for n in m.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image:
                        images_used.add(n.image.name)
        report['images_used'] = list(images_used)

    # bounding box in local space
    if mesh is not None:
        bbox = [tuple(v.co) for v in mesh.vertices]
        if bbox:
            xs = [v[0] for v in bbox]; ys = [v[1] for v in bbox]; zs = [v[2] for v in bbox]
            report['local_bbox'] = {'min': [min(xs), min(ys), min(zs)], 'max': [max(xs), max(ys), max(zs)]}

    print(json.dumps(report, indent=2))
    with open(os.path.join(os.path.dirname(__file__), 'inspect_residential04_report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

if __name__ == '__main__':
    main()
