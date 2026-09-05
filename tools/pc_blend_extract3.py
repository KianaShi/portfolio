exec(open(r'C:\Users\kiana\Desktop\portfolio\build\pc_blend_extract.py').read())

print()
print('================ AnimData -> action per object ================')
adt_layout = field_layout(find_struct('AnimData'))
action_off,_ = foff(adt_layout, 'action')

for b in ob_blocks:
    nm = block_name(b)
    base = b['start']
    adt_ptr = rptr(base+adt_off)
    if adt_ptr == 0:
        continue
    if adt_ptr not in addr_to_block:
        print(nm, '-> AnimData ptr not resolvable')
        continue
    adt_block = addr_to_block[adt_ptr]
    action_ptr = rptr(adt_block['start'] + action_off)
    action_name = block_name(addr_to_block[action_ptr]) if action_ptr in addr_to_block else None
    print(f'{nm!r:25s} -> action: {action_name!r}')
