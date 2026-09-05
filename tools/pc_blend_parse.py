import struct, sys, json
from collections import Counter

PATH = r'C:\Users\kiana\Desktop\portfolio\3d\pc\extracted\blend\BLACK PC ANIMATED BLEND.blend'

def read_cstr(buf, off):
    end = buf.index(b'\x00', off)
    return buf[off:end].decode('utf-8', 'replace'), end + 1

def align4(x):
    return (x + 3) & ~3

with open(PATH, 'rb') as f:
    data = f.read()

hdr = data[:12]
assert hdr[:7] == b'BLENDER'
ptr_char = chr(hdr[7])
endian_char = chr(hdr[8])
ptrsize = 8 if ptr_char == '-' else 4
version = hdr[9:12].decode()
print('header:', hdr, 'ptrsize:', ptrsize, 'version:', version)

pos = 12
blocks = []
while pos < len(data):
    code = data[pos:pos+4].rstrip(b'\x00')
    ln = struct.unpack_from('<i', data, pos+4)[0]
    old_ptr = struct.unpack_from('<Q' if ptrsize==8 else '<I', data, pos+8)[0]
    sdna_index = struct.unpack_from('<i', data, pos+8+ptrsize)[0]
    nr = struct.unpack_from('<i', data, pos+8+ptrsize+4)[0]
    header_len = 8 + ptrsize + 4 + 4
    data_start = pos + header_len
    blocks.append({'code': code, 'old': old_ptr, 'sdna': sdna_index, 'nr': nr, 'start': data_start, 'len': ln})
    pos = data_start + ln
    if code == b'ENDB':
        break

print('total blocks:', len(blocks))
c = Counter(b['code'] for b in blocks)
print('block code counts:', c.most_common(30))

dna_block = next(b for b in blocks if b['code'] == b'DNA1')
d = data[dna_block['start']:dna_block['start']+dna_block['len']]
p = 0
assert d[p:p+4] == b'SDNA'; p += 4
assert d[p:p+4] == b'NAME'; p += 4
nr_names = struct.unpack_from('<i', d, p)[0]; p += 4
names = []
for i in range(nr_names):
    s, p = read_cstr(d, p)
    names.append(s)
p = align4(p)

assert d[p:p+4] == b'TYPE'; p += 4
nr_types = struct.unpack_from('<i', d, p)[0]; p += 4
types = []
for i in range(nr_types):
    s, p = read_cstr(d, p)
    types.append(s)
p = align4(p)

assert d[p:p+4] == b'TLEN'; p += 4
tlens = []
for i in range(nr_types):
    tlens.append(struct.unpack_from('<h', d, p)[0]); p += 2
p = align4(p)

assert d[p:p+4] == b'STRC'; p += 4
nr_structs = struct.unpack_from('<i', d, p)[0]; p += 4
structs = []
for i in range(nr_structs):
    type_idx = struct.unpack_from('<h', d, p)[0]; p += 2
    nr_fields = struct.unpack_from('<h', d, p)[0]; p += 2
    fields = []
    for j in range(nr_fields):
        ftype_idx = struct.unpack_from('<h', d, p)[0]; p += 2
        fname_idx = struct.unpack_from('<h', d, p)[0]; p += 2
        fields.append((ftype_idx, fname_idx))
    structs.append({'type_idx': type_idx, 'fields': fields})

print('nr_names', nr_names, 'nr_types', nr_types, 'nr_structs', nr_structs)

import pickle
with open(r'C:\Users\kiana\Desktop\portfolio\build\pc_blend_dna.pkl', 'wb') as out:
    pickle.dump({'names': names, 'types': types, 'tlens': tlens, 'structs': structs, 'blocks': blocks, 'ptrsize': ptrsize, 'path': PATH}, out)
print('saved dna+blocks pickle')
