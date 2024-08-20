# Convert a pile-of-lumps style font to a single packed image and some JSON.
import json
import math
import re
import sys
import zipfile

import PIL.Image
from PIL.PngImagePlugin import PngInfo

# Boy I should probably release this lib sometime or this code is useless huh
from idfkn.formats.doompatch import DoomPatch
from idfkn.formats.playpal import Playpal
from idfkn.formats.wad import WAD


DOOM2_PLAYPAL_BYTES = bytes.fromhex('''
0000 001f 170b 170f 074b 4b4b ffff ff1b 1b1b 1313 130b 0b0b 0707 072f 371f 232b
0f17 1f07 0f17 004f 3b2b 4733 233f 2b1b ffb7 b7f7 abab f3a3 a3eb 9797 e78f 8fdf
8787 db7b 7bd3 7373 cb6b 6bc7 6363 bf5b 5bbb 5757 b34f 4faf 4747 a73f 3fa3 3b3b
9b33 3397 2f2f 8f2b 2b8b 2323 831f 1f7f 1b1b 7717 1773 1313 6b0f 0f67 0b0b 5f07
075b 0707 5307 074f 0000 4700 0043 0000 ffeb dfff e3d3 ffdb c7ff d3bb ffcf b3ff
c7a7 ffbf 9bff bb93 ffb3 83f7 ab7b efa3 73e7 9b6b df93 63d7 8b5b cf83 53cb 7f4f
bf7b 4bb3 7347 ab6f 43a3 6b3f 9b63 3b8f 5f37 8757 337f 532f 774f 2b6b 4727 5f43
2353 3f1f 4b37 1b3f 2f17 332b 132b 230f efef efe7 e7e7 dfdf dfdb dbdb d3d3 d3cb
cbcb c7c7 c7bf bfbf b7b7 b7b3 b3b3 abab aba7 a7a7 9f9f 9f97 9797 9393 938b 8b8b
8383 837f 7f7f 7777 776f 6f6f 6b6b 6b63 6363 5b5b 5b57 5757 4f4f 4f47 4747 4343
433b 3b3b 3737 372f 2f2f 2727 2723 2323 77ff 6f6f ef67 67df 5f5f cf57 5bbf 4f53
af47 4b9f 3f43 9337 3f83 2f37 732b 2f63 2327 531b 1f43 1717 330f 1323 0b0b 1707
bfa7 8fb7 9f87 af97 7fa7 8f77 9f87 6f9b 7f6b 937b 638b 735b 836b 577b 634f 775f
4b6f 5743 6753 3f5f 4b37 5743 3353 3f2f 9f83 638f 7753 836b 4b77 5f3f 6753 335b
472b 4f3b 2343 331b 7b7f 636f 7357 676b 4f5b 6347 5357 3b47 4f33 3f47 2b37 3f27
ffff 73eb db57 d7bb 43c3 9b2f af7b 1f9b 5b13 8743 0773 2b00 ffff ffff dbdb ffbb
bbff 9b9b ff7b 7bff 5f5f ff3f 3fff 1f1f ff00 00ef 0000 e300 00d7 0000 cb00 00bf
0000 b300 00a7 0000 9b00 008b 0000 7f00 0073 0000 6700 005b 0000 4f00 0043 0000
e7e7 ffc7 c7ff abab ff8f 8fff 7373 ff53 53ff 3737 ff1b 1bff 0000 ff00 00e3 0000
cb00 00b3 0000 9b00 0083 0000 6b00 0053 ffff ffff ebdb ffd7 bbff c79b ffb3 7bff
a35b ff8f 3bff 7f1b f373 17eb 6f0f df67 0fd7 5f0b cb57 07c3 4f00 b747 00af 4300
ffff ffff ffd7 ffff b3ff ff8f ffff 6bff ff47 ffff 23ff ff00 a73f 009f 3700 932f
0087 2300 4f3b 2743 2f1b 3723 132f 1b0b 0000 5300 0047 0000 3b00 002f 0000 2300
0017 0000 0b00 0000 ff9f 43ff e74b ff7b ffff 00ff cf00 cf9f 009b 6f00 6ba7 6b6b
1c00 0037 150a 300e 075f 4343 ffe3 e334 1818 2d11 1126 0a0a 2207 0746 311c 3b27
0e30 1c07 2915 0062 3527 5b2e 2054 2718 ffa3 a3f7 9898 f491 91ed 8787 e980 80e2
7878 df6e 6ed7 6767 d060 60cd 5858 c651 51c2 4e4e bb47 47b7 4040 b038 38ad 3535
a62e 2ea2 2a2a 9b27 2797 2020 901c 1c8d 1818 8615 1582 1111 7b0e 0e77 0a0a 7007
076d 0707 6607 0762 0000 5b00 0057 0000 ffd1 c7ff cabc ffc3 b1ff bca7 ffb8 a0ff
b195 ffaa 8aff a783 ffa0 75f7 986e f091 67e9 8a60 e283 58db 7c51 d475 4ad0 7147
c66e 43bb 6740 b463 3cad 6038 a658 359b 5531 944e 2e8d 4a2a 8647 277b 4023 703c
2066 381c 5f31 1854 2a15 4927 1142 200e f0d5 d5e9 cece e2c7 c7df c3c3 d7bc bcd0
b5b5 cdb1 b1c6 aaaa bfa3 a3bb a0a0 b498 98b0 9595 a98e 8ea2 8787 9f83 8397 7c7c
9075 758d 7171 866a 6a7f 6363 7b60 6074 5858 6d51 5169 4e4e 6247 475b 4040 573c
3c50 3535 4d31 3146 2a2a 3f23 233b 2020 86e3 637f d55c 77c7 5570 b84e 6daa 4766
9c40 5f8e 3857 8331 5475 2a4d 6727 4658 203f 4a18 373c 1530 2e0e 2d20 0a26 1507
c695 80bf 8e78 b787 71b0 806a a978 63a6 7160 9f6e 5897 6751 9060 4e89 5847 8655
437f 4e3c 774a 3870 4331 693c 2e66 382a a975 589b 6a4a 9060 4386 5538 774a 2e6d
4027 6235 2057 2e18 8971 587f 674e 7760 476d 5840 664e 355b 472e 5440 274d 3823
ffe3 67ed c34e dba7 3cc9 8a2a b76e 1ca6 5111 943c 0782 2700 ffe3 e3ff c3c3 ffa7
a7ff 8a8a ff6e 6eff 5555 ff38 38ff 1c1c ff00 00f0 0000 e600 00db 0000 d000 00c6
0000 bb00 00b0 0000 a600 0097 0000 8d00 0082 0000 7700 006d 0000 6200 0057 0000
e9ce e3cd b1e3 b498 e39b 80e3 8267 e366 4ae3 4d31 e334 18e3 1c00 e31c 00ca 1c00
b51c 00a0 1c00 8a1c 0075 1c00 601c 004a ffe3 e3ff d1c3 ffc0 a7ff b18a ffa0 6eff
9151 ff80 35ff 7118 f467 15ed 630e e25c 0edb 550a d04e 07c9 4700 bf40 00b7 3c00
ffe3 e3ff e3c0 ffe3 a0ff e380 ffe3 60ff e340 ffe3 20ff e300 b038 00a9 3100 9f2a
0094 2000 6235 2357 2a18 4d20 1146 180a 1c00 4a1c 0040 1c00 351c 002a 1c00 201c
0015 1c00 0a1c 0000 ff8e 3cff ce43 ff6e e3ff 00e3 d400 b8a9 008a 7f00 60b0 6060
''')

def main(archive_path, lump_prefix, montage_filename):
    with open(archive_path, 'rb') as archive:
        magic = archive.read(4)
        archive.seek(0)
        glyph_opaques = {}
        playpal_bytes = DOOM2_PLAYPAL_BYTES
        if magic == b'IWAD' or magic == b'PWAD':
            wad = WAD.parse_file(archive)

            def open_lump(lump):
                return lump.as_file()

            for lump in wad.lumps:
                if lump.name.startswith(lump_prefix):
                    ch = chr(int(lump.name.removeprefix(lump_prefix)))
                    glyph_opaques[ch] = lump

            if 'PLAYPAL' in wad:
                playpal_bytes = wad['PLAYPAL'].getdata()
        else:
            z = zipfile.ZipFile(archive)

            def open_lump(info):
                return z.open(info.filename)

            for info in z.infolist():
                if info.filename.startswith(lump_prefix):
                    ch = chr(int(re.sub('[.][^/]*$', '', info.filename).removeprefix(lump_prefix)))
                    glyph_opaques[ch] = info
                if re.fullmatch('playpal([.][^/]*)?', info.filename, re.I):
                    playpal_bytes = z.open(info.filename).read()

        palette = Playpal.parse(playpal_bytes)

        characters = {}
        cellw = 0
        cellh = 0
        for ch, opaque in sorted(glyph_opaques.items()):
            lumpfile = open_lump(opaque)
            p = lumpfile.tell()
            magic = lumpfile.read(4)
            lumpfile.seek(p)
            offsetx, offsety = 0, 0
            if magic == b'\x89PNG':
                img = PIL.Image.open(lumpfile)
                img.load()
                for name, data in img.private_chunks:
                    if name == b'grAb':
                        offsetx = int.from_bytes(data[0:4], 'little', signed=True)
                        offsety = int.from_bytes(data[4:8], 'little', signed=True)
            else:
                patch = DoomPatch.parse_file(lumpfile)
                img = patch.to_pillow(palette)
                offsetx = patch.x0
                offsety = patch.y0

            w, h = img.size
            characters[ch] = dict(
                image=img,
                width=w,
                height=h,
                dx=-offsetx,
                dy=-offsety,
            )
            cellw = max(cellw, w)
            cellh = max(cellh, h)

        colct = max(1, int(math.sqrt(len(characters))))
        rowct = math.ceil(len(characters) / colct)
        montage = PIL.Image.new('RGBA', (colct * cellw, rowct * cellh))
        glyphs = {}
        minlight = 255
        maxlight = 0
        for i, (ch, glyph) in enumerate(characters.items()):
            x = i % colct * cellw
            y = i // colct * cellh
            montage.paste(glyph['image'], (x, y))
            glyphs[ch] = f"{glyph['width']}x{glyph['height']}+{x}+{y}"
            if glyph['dx'] != 0 or glyph['dy'] != 0:
                glyphs[ch] += f"@{glyph['dx']},{glyph['dy']}"

            im = glyph['image']
            if im.mode != 'RGBA':
                im = im.convert('RGBA')
            px = im.load()
            for y in range(glyph['height']):
                for x in range(glyph['width']):
                    r, g, b, a = px[x, y]
                    if a == 0:
                        continue

                    light = r * 0.299 + g * 0.587 + b * 0.114
                    minlight = min(minlight, light)
                    maxlight = max(maxlight, light)
        if maxlight < minlight:
            print("what", minlight, maxlight)
            # ?????
            minlight, maxlight = 0, 255

        montage.save(montage_filename)
        out = dict(
            glyphs=glyphs,
            type='montage',
            src=montage_filename,
            line_height=cellh,
            lightness_range=[minlight, maxlight],
        )
        print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main(*sys.argv[1:])
