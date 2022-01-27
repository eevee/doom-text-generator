from pathlib import Path
import re
import struct
import subprocess
import shutil

import png


FONTDEFS = {
    'doom-small': dict(
        glob='_fonts/doom-small/STCFN*.png',
        format='composite',
    ),
    'chex-small': dict(
        glob='_fonts/chex/STCFN*.png',
        format='composite',
    ),
    'heretic-small': dict(
        glob='_fonts/heretic/FONTA*.png',
        ascii_offset=32,
        format='composite',
    ),
    'heretic-menu': dict(
        glob='_fonts/heretic/FONTB*.png',
        ascii_offset=32,
        format='composite',
    ),
    # hexen and heretic use the same small font, so hexen's isn't included here
    # TODO hexen yellow?  what's that for.  also it's FONTAY which overlays with FONTA, dammit
    'hexen-menu': dict(
        glob='_fonts/hexen/FONTB*.png',
        ascii_offset=32,
        format='composite',
    ),
    'strife-small': dict(
        glob='_fonts/strife/STBFN*.png',
        format='composite',
    ),
    'strife-small2': dict(
        glob='_fonts/strife/STCFN*.png',
        format='composite',
    ),
    'strife-menu-gzdoom': dict(
        glob='_fonts/gzdoom-strife-bigfont/*.png',
        format='composite',
        hex_numbering=True,
        global_kerning=-1,
    ),
    'zdoom-console': dict(
        glob='_fonts/confont.lmp',
        format='fon1',
    ),
    # TODO i do have gzdoom-bigfont which is its own thing too
    'gzdoom-doom-bigupper': dict(
        glob='_fonts/gzdoom-doom-bigupper/*.png',
        hex_numbering=True,
        global_kerning=-1,
        format='composite',
    ),
    'gzdoom-doom-bigfont': dict(
        glob='_fonts/gzdoom-doom-bigfont/*.png',
        hex_numbering=True,
        global_kerning=-1,
        height=16,
        format='composite',
    ),
    'custom-amuscaria-doom-nightmare': dict(
        path='custom-amuscaria-doom-nightmare.png',
        format='packed',
        global_kerning=-1,
        layout='_fonts/custom-amuscaria-doom-nightmare.txt',
    ),
}

def decode_rle(f):
    data = bytearray()
    while True:
        code = f.read(1)
        if not code:
            break
        code = code[0]

        if code < 128:
            count = code
            data.extend(f.read(count + 1))
        elif code > 128:
            count = 257 - code
            data.extend(f.read(1) * count)

    return data


def get_lightness(r, g, b):
    return r * 0.299 + g * 0.587 + b * 0.114


def extract_lightness_range(fn):
    # Get the lightness range, via some arcane ImageMagick invocation
    # (histogram: is a specific format that puts an entire color histogram in
    # the comment field, printed via %c)
    lightnesses = []
    res = subprocess.run(['convert', fn, '-format', '%c', 'histogram:info:'], capture_output=True, encoding='latin-1')
    for line in res.stdout.splitlines():
        r, g, b, a = map(int, re.search(r'[(]\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)[)]', line).groups())
        if a == 0:
            continue
        lightnesses.append(get_lightness(r, g, b))
    return [min(lightnesses), max(lightnesses)]


def determine_space_width_zdoom(glyphs):
    # This is what ZDoom does, don't look at me
    if "N" in glyphs:
        return int(glyphs["N"]['width'] / 2 + 0.5)
    else:
        return 4


def main():
    root = Path('.')
    fonts = {}

    for fontname, fontdef in FONTDEFS.items():
        import sys; print(fontname, file=sys.stderr)
        fontfile = fontname + '.png'
        glyphs = {}

        if fontdef['format'] == 'fon1':
            with open(fontdef['glob'], 'rb') as f:
                header = f.read(8)
                magic, cell_width, cell_height = struct.unpack('<4sHH', header)
                pixels = decode_rle(f)
                assert len(pixels) == cell_width * cell_height * 256

            writer = png.Writer(cell_width, cell_height * 256, greyscale=True, transparent=0)
            with open(fontfile, 'wb') as f:
                writer.write_array(f, pixels)

            fonts[fontname] = dict(
                # TODO i wonder if this is, unnecessary, since it's a grid anyway.  but then, they're all grids?
                glyphs={
                    chr(n): dict(
                        width=cell_width,
                        height=cell_height,
                        x=0,
                        y=n * cell_height,
                    )
                    for n in range(256)
                },
                image=fontfile,
                space_width=cell_width,
                line_height=cell_height,
                lightness_range=[0, 255],
            )

            continue
        elif fontdef['format'] == 'fon2':
            # XXX does not appear to be used, and doesn't define space_width
            with open(fontdef['glob'], 'rb') as f:
                header = f.read(0xc)
                magic, cell_height, n0, n1, constant_width, _, palette_size, flags = struct.unpack('<4sHBBBBBB', header)
                if flags & 1:
                    # Kerning
                    kerning_info = struct.unpack('<H', f.read(2))
                else:
                    kerning_info = None

                nchars = n1 - n0 + 1
                if constant_width:
                    widths = [struct.unpack('<H', f.read(2))] * nchars
                else:
                    widths = struct.unpack(f"<{nchars}H", f.read(nchars * 2))

                palette = [tuple(f.read(3)) for _ in range(palette_size + 1)]

                pixels = decode_rle(f)
                assert len(pixels) == sum(widths) * cell_height

            # The pixel data is for every character in order, but they all have
            # different widths, so it can't be saved directly into an image.
            # Stick them together in one big column
            glyphs = {}
            p = 0
            png_rows = []
            cell_width = max(widths)
            for n in range(n0, n1 + 1):
                width = widths[n - n0]
                if width == 0:
                    continue

                glyphs[chr(n)] = dict(
                    width=width,
                    height=cell_height,
                    x=0,
                    y=len(png_rows),
                )

                for y in range(cell_height):
                    row = pixels[p : p + width]
                    p += width
                    row.extend([0] * (cell_width - width))
                    png_rows.append(row)

            # FIXME transparency is busted, and this just doesn't work in browser at all fsr
            writer = png.Writer(cell_width, len(png_rows), palette=palette)
            with open(fontfile, 'wb') as f:
                writer.write(f, png_rows)

            lightnesses = [get_lightness(r, g, b) for (r, g, b) in palette]

            fonts[fontname] = dict(
                glyphs=glyphs,
                image=fontfile,
                line_height=cell_height,
                lightness_range=[min(lightnesses), max(lightnesses)],
            )

            continue
        elif fontdef['format'] == 'packed':
            # A pox upon your house
            glyphs = dict()
            line_height = 0
            with open(fontdef['layout']) as f:
                for line in f:
                    m = re.fullmatch(r'(.)\s+(\d+)x(\d+)[+](\d+)[+](\d+)(?:@(\d+),(\d+))?\s*', line)
                    ch = m.group(1)
                    glyphs[ch] = glyph = dict(
                        width=int(m.group(2)),
                        height=int(m.group(3)),
                        x=int(m.group(4)),
                        y=int(m.group(5)),
                    )
                    if m.group(6):
                        glyph['dx'] = int(m.group(6))
                        glyph['dy'] = int(m.group(7))
                    line_height = max(line_height, glyph['height'] + glyph.get('dy', 0))

            fonts[fontname] = dict(
                glyphs=glyphs,
                image=fontdef['path'],
                space_width=determine_space_width_zdoom(glyphs),
                line_height=line_height,
                kerning=fontdef.get('global_kerning', 0),
                lightness_range=extract_lightness_range(fontdef['path']),
            )
            continue

        prefix, suffix = fontdef['glob'].rpartition('/')[2].split('*')
        rx = re.compile(re.escape(prefix) + '(.*)' + re.escape(suffix))

        png_paths = list(root.glob(fontdef['glob']))
        png_paths.sort()

        cell_width = 0
        cell_height = 0

        for png_path in png_paths:
            with open(png_path, 'rb') as f:
                reader = png.Reader(file=f)
                width, height = 0, 0
                dx, dy = 0, 0
                for name, value in reader.chunks():
                    if name == b'IHDR':
                        width, height = struct.unpack_from('>II', value)
                    elif name == b'grAb':
                        dx, dy = struct.unpack_from('>ii', value)

            nstr = rx.match(png_path.name).group(1)
            if fontdef.get('hex_numbering'):
                n = int(nstr, 16)
            else:
                n = int(nstr)
            n += fontdef.get('ascii_offset', 0)
            ch = chr(n)
            # Inexplicably, the Doom small font has a pipe character but
            # assigns it to lowercase y, where the rest of the font is
            # uppercase
            if ch == "y" and "x" not in glyphs:
                ch = "|"

            glyphs[ch] = dict(
                width=width,
                height=height,
            )
            if dx:
                glyphs[ch]['dx'] = -dx
            if dy:
                glyphs[ch]['dy'] = -dy

            cell_width = max(width - dx, cell_width)
            cell_height = max(height - dy, cell_height)

        # Now montage them together
        # TODO could probably do better than this but good enough whatever
        columns = int(len(png_paths) ** 0.5)
        subprocess.run(['montage', '-background', 'transparent', '-tile', f"{columns}x", '-gravity', 'NorthWest', '-geometry', f"{cell_width}x{cell_height}>+0+0", *png_paths, fontfile])

        # Optipng, and also strip the color profile since it fucks everything up real good
        subprocess.run(['optipng', '-strip', 'all', fontfile], stderr=subprocess.DEVNULL)

        # Save the position of each glyph in the montage
        x = 0
        y = 0
        for i, glyph in enumerate(glyphs.values()):
            if i > 0 and i % columns == 0:
                x = 0
                y += cell_height

            glyph['x'] = x
            glyph['y'] = y

            x += cell_width


        fonts[fontname] = dict(
            glyphs=glyphs,
            image=fontfile,
            space_width=determine_space_width_zdoom(glyphs),
            # FIXME i get 8, the tallest glyph in the font, but zdoom seems to render 9 and i'm not sure why
            line_height=fontdef.get('height', cell_height),
            kerning=fontdef.get('global_kerning', 0),
            lightness_range=extract_lightness_range(fontfile),
        )

    import json
    print('XXX_DOOM_FONTS =', json.dumps(fonts))


if __name__ == '__main__':
    main()
