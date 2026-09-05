import struct, pickle, re

PATH = r'C:\Users\kiana\Desktop\portfolio\3d\pc\extracted\blend\BLACK PC ANIMATED BLEND.blend'
with open(PATH, 'rb') as f:
    data = f.read()
with open(r'C:\Users\kiana\Desktop\portfolio\build\pc_blend_dna.pkl', 'rb') as f:
    dna = pickle.load(f)

names = dna['names']; types = dna['types']; tlens = dna['tlens']; structs = dna['structs']; blocks = dna['blocks']
ptrsize = dna['ptrsize']

def struct_name(s): return types[s['type_idx']]
def find_struct(name):
    for s in structs:
        if struct_name(s) == name: return s
    return None

def parse_field_name(raw):
    n = raw; ptr_depth = 0
    while n.startswith('*'):
        ptr_depth += 1; n = n[1:]
    base = n; array_dims = []
    if '[' in n:
        base = n[:n.index('[')]
        for m in re.finditer(r'\[(\d+)\]', n[n.index('['):]):
            array_dims.append(int(m.group(1)))
    return base, ptr_depth, array_dims

def field_layout(s):
    layout = []; off = 0
    for ftype_idx, fname_idx in s['fields']:
        raw_name = names[fname_idx]; type_name = types[ftype_idx]
        base, ptr_depth, array_dims = parse_field_name(raw_name)
        elem_size = ptrsize if ptr_depth > 0 else tlens[ftype_idx]
        count = 1
        for d in array_dims: count *= d
        size = elem_size * count
        layout.append({'name': base, 'offset': off, 'size': size, 'ptr_depth': ptr_depth, 'array_dims': array_dims, 'type': type_name})
        off += size
    return layout

def foff(layout, name):
    for f in layout:
        if f['name'] == name: return f['offset'], f
    raise KeyError(name)

def rfloat(off): return struct.unpack_from('<f', data, off)[0]
def rint(off): return struct.unpack_from('<i', data, off)[0]
def rshort(off): return struct.unpack_from('<h', data, off)[0]
def rushort(off): return struct.unpack_from('<H', data, off)[0]
def rbyte(off): return struct.unpack_from('<B', data, off)[0]
def rptr(off):
    return struct.unpack_from('<Q' if ptrsize==8 else '<I', data, off)[0]
def rcstr(off, maxlen):
    raw = data[off:off+maxlen]
    e = raw.find(b'\x00')
    if e >= 0: raw = raw[:e]
    return raw.decode('utf-8','replace')

id_layout = field_layout(find_struct('ID'))
id_name_off, _ = foff(id_layout, 'name')

def block_name(b):
    off = b['start'] + id_name_off
    raw = rcstr(off, 66)
    return raw[2:]

addr_to_block = {b['old']: b for b in blocks if b['old'] != 0}

print('================ OBJECTS ================')
obj_layout = field_layout(find_struct('Object'))
type_off,_ = foff(obj_layout,'type')
data_off,_ = foff(obj_layout,'data')
parent_off,_ = foff(obj_layout,'parent')
loc_off,_ = foff(obj_layout,'loc')
obmat_off,_ = foff(obj_layout,'obmat')
adt_off,_ = foff(obj_layout,'adt')

ob_blocks = [b for b in blocks if b['code']==b'OB']
for b in ob_blocks:
    nm = block_name(b)
    base = b['start']
    otype = rshort(base+type_off)
    dptr = rptr(base+data_off)
    pptr = rptr(base+parent_off)
    parent_name = block_name(addr_to_block[pptr]) if pptr in addr_to_block else None
    data_name = block_name(addr_to_block[dptr]) if dptr in addr_to_block else None
    loc = tuple(rfloat(base+loc_off+i*4) for i in range(3))
    adt_ptr = rptr(base+adt_off)
    print(f'{nm!r:40s} type={otype} parent={parent_name!r} data={data_name!r} loc={[round(x,3) for x in loc]} hasAnimData={adt_ptr!=0}')
