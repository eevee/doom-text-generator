import struct
from pathlib import Path

def main():
    root = Path('/home/eevee/art/zdoom/doom2-lumps/graphics/')
    glyphs = {}
    for graphic in root.glob('STCFN*'):
        with open(graphic, 'rb') as f:
            data = f.read()

        # FIXME should respect offsets
        width, height, dx, dy = struct.unpack_from('<HHhh', data, 0)
        print(graphic.name, width, height, dx, dy)
        column_offsets = struct.unpack_from(f'<{width}I', data, 8)
        columns = [[None] * height for _ in range(width)]
        for c, offset in enumerate(column_offsets):
            while data[offset] != 255:
                y, length = struct.unpack_from('<BB', data, offset + 0)
                columns[c][y:y + length] = struct.unpack_from(f'<{length}B', data, offset + 3)
                offset += length + 4

        # Transpose to get normal row order
        rows = list(zip(*columns))

        ch = chr(int(graphic.name[5:]))
        if ch == 'y':
            # Doom hack: this is actually pipe!
            ch = '|'
        glyphs[ch] = dict(
            width=width,
            height=height,
            x0=-dx,
            y0=-dy,
            pixels=rows,
        )

    import json
    print(json.dumps(glyphs))


if __name__ == '__main__':
    main()
