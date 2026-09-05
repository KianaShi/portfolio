exec(open(r'C:\Users\kiana\Desktop\portfolio\build\pc_blend_extract.py').read())

print()
print('================ ACTIONS ================')
ac_blocks = [b for b in blocks if b['code']==b'AC']
action_layout = field_layout(find_struct('bAction'))
# find frame_range or curves to estimate duration; bAction has 'curves' ListBase and sometimes 'frame_start'/'frame_end' not always present pre-4.0
for b in ac_blocks:
    nm = block_name(b)
    print(nm)

print()
print('================ MATERIALS ================')
ma_blocks = [b for b in blocks if b['code']==b'MA']
mat_layout = field_layout(find_struct('Material'))
r_off,_ = foff(mat_layout,'r')
g_off,_ = foff(mat_layout,'g')
b_off,_ = foff(mat_layout,'b')
a_off,_ = foff(mat_layout,'a')
roughness_off = None
for f in mat_layout:
    if f['name']=='roughness': roughness_off = f['offset']
metallic_off = None
for f in mat_layout:
    if f['name']=='metallic': metallic_off = f['offset']
use_nodes_off = None
for f in mat_layout:
    if f['name']=='use_nodes': use_nodes_off = f['offset']
nodetree_off = None
for f in mat_layout:
    if f['name']=='nodetree': nodetree_off = f['offset']

for b in ma_blocks:
    nm = block_name(b)
    base = b['start']
    rr = rfloat(base+r_off); gg=rfloat(base+g_off); bb=rfloat(base+b_off)
    rough = rfloat(base+roughness_off) if roughness_off is not None else None
    metal = rfloat(base+metallic_off) if metallic_off is not None else None
    use_nodes = rbyte(base+use_nodes_off) if use_nodes_off is not None else None
    nt_ptr = rptr(base+nodetree_off) if nodetree_off is not None else 0
    print(f'{nm!r:35s} rgb=({rr:.3f},{gg:.3f},{bb:.3f}) rough={rough} metal={metal} use_nodes={use_nodes} hasNodeTree={nt_ptr!=0}')

print()
print('================ IMAGES ================')
im_blocks = [b for b in blocks if b['code']==b'IM']
im_layout = field_layout(find_struct('Image'))
name_off,_ = foff(im_layout,'name')
for b in im_blocks:
    nm = block_name(b)
    base = b['start']
    fname = rcstr(base+name_off, 1024)
    print(f'{nm!r:30s} file={fname!r}')
