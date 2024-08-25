// TODO:
// fold in gzdoom's game_support.pk3 font extensions, which have cyrillic for most of the canon fonts
// someone asked for build + quake fonts
// someday, bbcode...
// better missing char handling
// refreshing loses the selected translation
// aspect ratio correction?
// customize space width???
// custom translations...
// - real gradient editor??
// - parse TEXTCOLO
// force into doom (heretic, hexen, ...) palette?  whoof
// drag and drop for wads
// make translation more fast
// - preconvert default translation?
// allow using different fonts in one message (whoof)
// allow inverting colors when translating (useful for e.g. zdoom 2012)
// fix inferring line height from a loaded font
//
// TODO nice to do while i'm here:
// - modernize js
//   - load the json, as json
//   - i feel like i need a better way of handling the form elements, maybe i need a little lib of thin wrappers idk
//     - fragment should omit when value is default?
//     - kerning and line spacing should support both a slider and a spinner?  or is that too much
// - update the html
//   - too much text?  popups?  not sure
//   - no way to just enter a number
// - preview image edges?
//   - show width/height?
"use strict";
import {
    DOOM_FONTS, FONT_CREATOR_URLS, FONT_LICENSES, DOOM2_PALETTE,
    ZDOOM_TRANSLATIONS, ZDOOM_ACS_TRANSLATION_CODES, rgb,
    SAMPLE_MESSAGES,
} from './data.js';


// XXX zdoom uses integers for a font's lightness range...
const USE_ZDOOM_TRANSLATION_ROUNDING = true;

let scratch_canvas = mk('canvas', {width: 32, height: 32});


function mk(tag_selector, ...children) {
    let [tag, ...classes] = tag_selector.split('.');
    let el = document.createElement(tag);
    el.classList = classes.join(' ');
    if (children.length > 0) {
        if (!(children[0] instanceof Node) && typeof(children[0]) !== "string") {
            let [attrs] = children.splice(0, 1);
            for (let [key, value] of Object.entries(attrs)) {
                el.setAttribute(key, value);
            }
        }
        el.append(...children);
    }
    return el;
}

function trigger_local_download(filename, blob) {
    let url = URL.createObjectURL(blob);
    // To download a file, um, make an <a> and click it.  Not kidding
    let a = mk('a', {
        href: url,
        download: filename,
    });
    document.body.append(a);
    a.click();
    // Absolutely no idea when I'm allowed to revoke this, but surely a minute is safe
    window.setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
    }, 60 * 1000);
}

function random_choice(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function get_lightness(r, g, b) {
    return r * 0.299 + g * 0.587 + b * 0.114;
}

function init_scratch_canvas(w, h) {
    if (scratch_canvas.width < w) {
        scratch_canvas.width = w;
    }
    if (scratch_canvas.height < h) {
        scratch_canvas.height = h;
    }
    let ctx = scratch_canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    return ctx
}

function measure_image_lightness(image) {
    let canvas, ctx, w, h;
    if (image instanceof HTMLCanvasElement) {
        canvas = image;
        ctx = canvas.getContext('2d');
        w = canvas.width;
        h = canvas.height;
    }
    else {
        canvas = scratch_canvas;
        ctx = init_scratch_canvas(image.naturalWidth, image.naturalHeight);
        ctx.drawImage(image, 0, 0);
        w = image.naturalWidth;
        h = image.naturalHeight;
    }

    let minlight = 255;
    let maxlight = 0;
    let imgdata = ctx.getImageData(0, 0, w, h);
    let px = imgdata.data;
    for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] === 0)
            continue;

        let lightness = get_lightness(px[i + 0], px[i + 1], px[i + 2]);
        minlight = Math.min(minlight, lightness);
        maxlight = Math.max(maxlight, lightness);
    }
    if (maxlight < minlight) {
        minlight = 0;
        maxlight = 255;
    }

    return [minlight, maxlight];
}

function translation_to_gradient(spans) {
    let parts = ["linear-gradient(to right"];
    for (let span of spans) {
        // color + position
        parts.push(`, ${span[2].hex} ${span[0] / 255 * 100}%`);
        parts.push(`, ${span[3].hex} ${span[1] / 255 * 100}%`);
    }
    parts.push(")");
    return parts.join('');
}

function string_from_buffer_ascii(buf, start = 0, len) {
    if (ArrayBuffer.isView(buf)) {
        start += buf.byteOffset;
        buf = buf.buffer;
    }
    return String.fromCodePoint.apply(null, new Uint8Array(buf, start, len));
}


async function parse_wad(wadfile) {
    // Use the Blob API to avoid loading the whole file at once, since it might be real big
    // and we only care about a tiny bit of it
    let header_buf = await wadfile.slice(0, 12).arrayBuffer();
    let data = new DataView(header_buf);
    let magic = string_from_buffer_ascii(data, 0, 4);
    if (magic !== 'PWAD' && magic !== 'IWAD') {
        if (magic.startsWith('PK')) {
            throw new Error("This doesn't appear to be a WAD file.  (PK3 isn't supported, sorry!)");
        }
        else {
            throw new Error("This doesn't appear to be a WAD file.");
        }
    }

    let lumpct = data.getUint32(4, true);
    let diroffset = data.getUint32(8, true);

    let dir_buf = await wadfile.slice(diroffset, diroffset + 16 * lumpct).arrayBuffer();
    data = new DataView(dir_buf);
    let p = 0;
    let lumps = [];
    for (let i = 0; i < lumpct; i++) {
        let offset = data.getUint32(p, true);
        let size = data.getUint32(p + 4, true);
        let rawname = string_from_buffer_ascii(data, p + 8, 8);
        let nulpos = rawname.indexOf('\x00')
        let name = nulpos < 0 ? rawname : rawname.substring(0, nulpos);
        lumps.push({name: name.toUpperCase(), size, offset});

        p += 16;
    }

    return lumps;
}

function parse_doom_graphic(buf, palette) {
    let data = new DataView(buf);
    let width = data.getUint16(0, true);
    let height = data.getUint16(2, true);
    let xanchor = data.getInt16(4, true);
    let yanchor = data.getInt16(6, true);

    let canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    let ctx = canvas.getContext('2d');
    let imgdata = ctx.getImageData(0, 0, width, height);
    let px = imgdata.data;

    for (let x = 0; x < width; x++) {
        let p = data.getInt32(8 + 4 * x, true);
        while (true) {
            let y0 = data.getUint8(p);
            if (y0 === 0xff)
                // FF marks last post
                break;
            let pixelct = data.getUint8(p + 1);
            p += 3;  // skip header and a padding byte
            for (let dy = 0; dy < pixelct; dy++) {
                let index = data.getUint8(p);
                let color = palette[index];
                let q = ((y0 + dy) * width + x) * 4;
                px[q + 0] = color[0];
                px[q + 1] = color[1];
                px[q + 2] = color[2];
                px[q + 3] = 255;
                p += 1;
            }
            p += 1;  // skip another padding byte
        }
    }

    ctx.putImageData(imgdata, 0, 0);
    return [canvas, xanchor, yanchor];
}

function* decode_rle(array) {
    let i = 0;
    while (i < array.length) {
        let code = array[i];
        i += 1;

        if (code < 128) {
            let count = code + 1;
            for (let _ = 0; _ < count; _++) {
                yield array[i];
                i += 1;
            }
        }
        else if (code > 128) {
            let count = 257 - code;
            let datum = array[i];
            i += 1;
            for (let _ = 0; _ < count; _++) {
                yield datum;
            }
        }
    }
}

function parse_fon2(buf) {
    let data = new DataView(buf);
    let magic = string_from_buffer_ascii(buf, 0, 4);
    if (magic !== 'FON2') {
        throw new Error("Not a FON2 file");
    }

    let cell_height = data.getUint16(4, true);
    let n0 = data.getUint8(6);
    let n1 = data.getUint8(7);
    let is_constant_width = data.getUint8(8);
    // byte 9 is "shading type", unused
    let palette_size = data.getUint8(10);
    let flags = data.getUint8(11);
    let p = 12;

    let kerning_info;
    if (flags & 1) {
        kerning_info = data.getInt16(p, true);
        p += 2;
    }

    let widths = [];
    if (is_constant_width) {
        let width = data.getUint16(p, true);
        p += 2;
        for (let n = n0; n <= n1; n++) {
            widths.push(width);
        }
    }
    else {
        for (let n = n0; n <= n1; n++) {
            let width = data.getUint16(p, true);
            p += 2;
            widths.push(width);
        }
    }

    let palette = [];
    // Grab the lightness range while we're in here.
    // I *think* it's taken from the palette and not from the set of colors that are actually
    // used?  Hopefully there's no difference in most cases anyway??
    let min_lightness = 255;
    let max_lightness = 0;
    for (let i = 0; i < palette_size + 1; i++) {
        let color = [data.getUint8(p), data.getUint8(p + 1), data.getUint8(p + 2)];
        p += 3;
        palette.push(color);

        // Do NOT do this for the first or last colors, which are transparent and dummy
        if (i !== 0 && i !== palette_size) {
            let lightness = get_lightness(...color);
            min_lightness = Math.min(min_lightness, lightness);
            max_lightness = Math.max(max_lightness, lightness);
        }
    }
    if (max_lightness < min_lightness) {
        // Well this should definitely not happen
        min_lightness = 0;
        max_lightness = 255;
    }

    let glyphs = {};
    let n = n0;
    let glyph = null;
    // This is a generator, and we're gonna juggle it a bit
    let pixel_decoder = decode_rle(new Uint8Array(buf, p));
    for (let n = n0; n <= n1; n++) {
        let width = widths[n - n0];
        if (width === 0)
            continue;

        // TODO probably better to like, pack these into one canvas?
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = cell_height;
        let ctx = canvas.getContext('2d');
        let imgdata = ctx.getImageData(0, 0, width, cell_height);
        let px = imgdata.data;
        for (let i = 0; i < width * cell_height; i++) {
            let p = pixel_decoder.next().value;
            if (p === 0 || p === palette_size)
                continue;

            px[i * 4 + 0] = palette[p][0];
            px[i * 4 + 1] = palette[p][1];
            px[i * 4 + 2] = palette[p][2];
            px[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgdata, 0, 0);

        glyphs[String.fromCodePoint(n)] = {
            width: width,
            height: cell_height,
            canvas: canvas,
            dy: 0,
        };
    }

    return {
        glyphs: glyphs,
        line_height: cell_height,
        kerning: kerning_info,
        lightness_range: [min_lightness, max_lightness],
    };
}

function parse_first_playpal(buf) {
    let palette = [];
    let bytes = new Uint8Array(buf);
    for (let i = 0; i < 256; i++) {
        palette.push([bytes[i*3], bytes[i*3 + 1], bytes[i*3 + 2]]);
    }
    return palette;
}

async function parse_image(buf, palette) {
    let magic = string_from_buffer_ascii(buf, 0, 8);
    if (magic === '\x89PNG\x0d\x0a\x1a\x0a') {
        // This is a PNG already, so we can just wrap it in an image
        let canvas = new Image;
        let xanchor, yanchor;
        let bytestring = string_from_buffer_ascii(buf);
        canvas.src = 'data:image/png;base64,' + btoa(bytestring);
        await canvas.decode();
        // Difficulty: we would really like to support the grAb chunk, without writing a
        // full PNG decoder in JavaScript.  So let's...  let's just...  shh...
        let i = bytestring.indexOf('grAb');
        if (i >= 8) {
            let view = new DataView(buf);
            xanchor = view.getInt32(i + 4, true);
            yanchor = view.getInt32(i + 8, true);
        }
        else {
            xanchor = 0;
            yanchor = 0;
        }
        return [canvas, xanchor, yanchor];
    }
    else {
        // Presume a Doom graphic
        return parse_doom_graphic(buf, palette);
    }
}

// "Standard" fonts I scraped myself from various places and crammed into montages
class BuiltinFont {
    static async from_builtin(fontdef) {
        let montage = new Image;
        montage.src = fontdef.src;
        await montage.decode();
        return new this(fontdef, montage);
    }

    constructor(fontdef, montage) {
        this.glyphs = {};
        // Decode metrics from WxH+X+Y into, like, numbers
        for (let [ch, metrics] of Object.entries(fontdef.glyphs)) {
            let [_, width, height, x, y, dx, dy] = metrics.match(/^(\d+)x(\d+)[+](\d+)[+](\d+)(?:@(-?\d+),(-?\d+))?$/);
            this.glyphs[ch] = {
                // Standard props
                width: parseInt(width, 10),
                height: parseInt(height, 10),
                // Montage props
                x: parseInt(x, 10),
                y: parseInt(y, 10),
                dx: parseInt(dx ?? '0', 10),
                dy: parseInt(dy ?? '0', 10),
            };
        }

        this.space_width = fontdef.space_width;
        this.line_height = fontdef.line_height;
        this.kerning = fontdef.kerning;
        this.lightness_range = fontdef.lightness_range;

        this.meta = fontdef.meta;
        this.name = fontdef.meta.name;

        this.montage = montage;
    }

    draw_glyph(glyph, ctx, x, y) {
        // TODO wait, shouldn't 'y' be the baseline, not the top of the glyph
        ctx.drawImage(
            this.montage,
            glyph.x, glyph.y, glyph.width, glyph.height,
            x, y, glyph.width, glyph.height);
    }
}


function zdoom_estimate_space_width(partial_font) {
    // This really is what ZDoom does, don't look at me
    if ("N" in partial_font.glyphs) {
        return Math.floor(partial_font.glyphs["N"].width / 2 + 0.5);
    }
    else {
        return 4;
    }
}

// Font loaded from a user-supplied WAD
class WADFont {
    constructor(glyphs, meta = {}) {
        this.glyphs = glyphs;

        // Hurriedly invent some metrics
        this.line_height = 0;
        this.space_width = 0;
        let uniform_width = true;
        for (let glyph of Object.values(glyphs)) {
            this.line_height = Math.max(this.line_height, glyph.height + glyph.dy);
            if (this.space_width === 0) {
                this.space_width = glyph.width;
            }
            else if (this.space_width !== glyph.width) {
                uniform_width = false;
            }
        }
        if (! uniform_width) {
            this.space_width = zdoom_estimate_space_width(this);
        }

        // Font kerning mostly exists for the big Doom menu fonts; for custom fonts you can use
        // the global slider for now (since mixing fonts doesn't work yet)
        this.kerning = 0;
        this.lightness_range = [0, 255];  // TODO can just get from the palette?  or do i need the actual lightness of the colors that get used?  urgh

        this.meta = meta;
        this.name = meta.name ?? "";  // XXX ???
        this.meta.format = 'lumps';
    }

    draw_glyph(glyph, ctx, x, y) {
        ctx.drawImage(glyph.canvas, x, y);
    }
}


class FON2Font {
    static async from_builtin(fontdef) {
        let response = await fetch(fontdef.src);
        let buf = await response.arrayBuffer();
        return new this(buf, fontdef.meta);
    }

    constructor(fon2_buf, meta = {}) {
        let ret = parse_fon2(fon2_buf);

        this.glyphs = ret.glyphs;
        this.line_height = ret.line_height;
        this.kerning = ret.kerning ?? 0;
        this.space_width = zdoom_estimate_space_width(this);
        this.lightness_range = ret.lightness_range;

        this.meta = meta;
        this.name = meta.name ?? "";  // XXX ???
        this.meta.format = 'FON2';
    }

    draw_glyph(glyph, ctx, x, y) {
        ctx.drawImage(glyph.canvas, x, y);
    }
}


class UnicodeFont {
    constructor(fontdef, meta = {}) {
        this.glyphs = fontdef.glyphs;
        this.line_height = fontdef.line_height ?? Math.max(
            ...Object.values(fontdef.glyphs).map(glyph => glyph.height + glyph.dy));
        this.kerning = fontdef.kerning ?? 0;
        this.space_width = fontdef.space_width ?? zdoom_estimate_space_width(this);
        this.lightness_range = fontdef.lightness_range;
        if (! this.lightness_range || this.lightness_range[0] >= this.lightness_range[1]) {
            this.lightness_range = [0, 255];
        }

        this.meta = meta;
        this.name = meta.name ?? "";  // XXX ???
        this.meta.format = 'unicode';
    }

    draw_glyph(glyph, ctx, x, y) {
        if ('x' in glyph) {
            ctx.drawImage(
                glyph.canvas,
                glyph.x, glyph.y, glyph.width, glyph.height,
                x, y, glyph.width, glyph.height);
        }
        else {
            ctx.drawImage(glyph.canvas, x, y);
        }
    }
}



// Lil helper for finding ad-hoc fonts made of collections of lumps.
// The idea is to find collections of lumps of the form NAMExxx, where xxx is a range of numbers
// spanning at least 65 to 90 (A-Z) or 97 to 122 (a-z)
class LumpyFontCollector {
    constructor() {
        this.candidates = new Map;
    }

    scan(stem, opaque) {
        let m = stem.match(/\d+$/);
        if (m === null)
            return;

        let [suffix] = m;
        let prefix = stem.substring(0, stem.length - suffix.length);
        // Reject empty prefix
        if (prefix.length === 0 || prefix.endsWith("/"))
            return;
        let num = parseInt(suffix, 10);

        prefix = prefix.toUpperCase();
        if (! this.candidates.has(prefix)) {
            this.candidates.set(prefix, new Map);
        }
        let catalogue = this.candidates.get(prefix);
        catalogue.set(num, opaque);
    }

    *get_results() {
        for (let [prefix, catalogue] of this.candidates) {
            let found_upper = true;
            for (let cp = 65; cp < 91; cp++) {
                if (! catalogue.has(cp)) {
                    found_upper = false;
                    break;
                }
            }
            let found_lower = true;
            for (let cp = 97; cp < 123; cp++) {
                if (! catalogue.has(cp)) {
                    found_lower = false;
                    break;
                }
            }
            if (! found_upper && ! found_lower) {
                console.log("not a font (no full alphabet):", prefix);
                continue;
            }

            // We might still be fooled by e.g. a bunch of patches, so if there are too many
            // "glyphs" in the [0, 31] range, it's probably not a font
            let found_control = 0;
            for (let cp = 0; cp < 32; cp++) {
                if (catalogue.has(cp)) {
                    found_control += 1;
                }
            }
            if (found_control > 8) {
                console.log("not a font (too many control chars):", prefix);
                continue;
            }

            // Seems plausible!
            yield [prefix, catalogue];
        }
    }
}


class BossBrain {
    constructor() {
        // Visible canvas on the actual page
        this.final_canvas = document.querySelector('canvas');
        // Canvas we do most of our drawing to, at 1x
        this.buffer_canvas = mk('canvas');

        this.form = document.querySelector('form');
        this.fonts = {};

        this.init_form();
    }

    async init() {
        let promises = [];
        for (let [fontname, fontdef] of Object.entries(DOOM_FONTS)) {
            let promise;
            if (fontdef.type === 'fon2') {
                promise = FON2Font.from_builtin(fontdef);
            }
            else {
                promise = BuiltinFont.from_builtin(fontdef);
            }
            promises.push(promise.then(font => {
                font.is_builtin = true;
                this.fonts[fontname] = font;
            }));
        }

        await Promise.all(promises);

        this.font_list_el = document.querySelector('#js-font-list');
        this.rendered_font_names = {};
        for (let [ident, fontdef] of Object.entries(DOOM_FONTS)) {
            this.add_font_to_list(ident, fontdef.meta.name);
        }

        if (! this.form.elements['font'].value) {
            this.form.elements['font'].value = 'doom-small';
        }

        this.translations = Object.assign({}, ZDOOM_TRANSLATIONS);
        // Add slots for custom ones
        this.custom_translations = ['custom1'];
        this.translations['custom1'] = {
            normal: [[0, 255, rgb`#000000`, rgb`#FFFFFF`]],
            console: [[0, 255, rgb`#000000`, rgb`#FFFFFF`]],
            flat: rgb`#FFFFFF`,
            is_custom: true,
        };
    }

    async init_form() {
        // While this is checked, the form itself is gone, for the convenience of, for example,
        // people using this live in OBS.  Check this first, before waiting on images to load, to
        // minimize the intermediate flash.
        this.form.elements['solo'].addEventListener('change', ev => {
            document.body.classList.toggle('solo', ev.target.checked);
            // Need to do this directly since usually we rely on it happening due to a redraw
            this.update_fragment();
        });
        // But you can turn it off by clicking anywhere
        document.querySelector('#canvas-wrapper').addEventListener('click', () => {
            this.form.elements['solo'].checked = false;
            document.body.classList.remove('solo');
            this.update_fragment();
        });

        await this.init();

        this.form.addEventListener('submit', ev => {
            ev.preventDefault();
        });

        let textarea = this.form.elements['text'];
        let redraw_handler = this.redraw_current_text.bind(this);
        textarea.addEventListener('input', redraw_handler);

        // Font
        let font_ctl = this.form.elements['font'];
        document.querySelector('#js-font-list').addEventListener('change', ev => {
            this.form.classList.toggle('using-console-font', font_ctl.value === 'zdoom-console');
            this.redraw_current_text();
        });
        this.form.classList.toggle('using-console-font', font_ctl.value === 'zdoom-console');

        let wad_ctl = this.form.elements['wad'];
        wad_ctl.addEventListener('change', ev => {
            this.load_fonts_from_files(ev.target.files);
        });
        // TODO support drag and drop, uggh
        document.querySelector('#button-upload').addEventListener('click', ev => {
            wad_ctl.click();
        });

        // Slider controls
        for (let name of ['scale', 'kerning', 'line-spacing', 'padding']) {
            let ctl = this.form.elements[name];
            let output = ctl.parentNode.querySelector('output');
            ctl.addEventListener('input', ev => {
                output.textContent = String(ctl.value);
                if (name === 'scale') {
                    output.textContent += "×";
                }
                this.redraw_current_text();
            });
            // Note we don't need to update the text now, because we call fix_form in a moment
        }

        // Escapee mode
        this.form.elements['escapee-mode'].addEventListener('change', redraw_handler);

        // Alignment
        let alignment_list = this.form.querySelector('ul.alignment');
        alignment_list.addEventListener('change', redraw_handler);

        // Syntax
        let syntax_list = this.form.querySelector('ul.syntax');
        syntax_list.addEventListener('change', redraw_handler);

        // Outline
        this.form.elements['outline'].addEventListener('change', ev => {
            document.body.classList.toggle('outlined', ev.target.checked);
        });

        // Background
        // FIXME i suspect if you edit the fragment live, the bgcolor control will not update, sigh
        let bg_ctl = this.form.elements['bg'];
        let bgcolor_ctl = this.form.elements['bgcolor'];
        bg_ctl.addEventListener('click', ev => {
            this._fix_bg_controls();
            this.update_background();
            this.redraw_current_text();
        });
        bgcolor_ctl.addEventListener('input', ev => {
            this.set_background(bgcolor_ctl.value);
        });
        this.update_background();

        // Wrapping
        this.form.elements['wrap'].addEventListener('change', () => {
            this._fix_wrap_controls();
            this.redraw_current_text();
        });
        for (let name of ['wrap-width', 'wrap-units'/*, 'overflow'*/]) {
            this.form.elements[name].addEventListener('input', () => {
                if (this.form.elements['wrap'].checked) {
                    this.redraw_current_text();
                }
            });
        }

        // Translations
        let trans_list = this.form.querySelector('.translations');
        this.translation_elements = {};
        for (let [name, trans] of Object.entries(this.translations)) {
            let normal_example = mk('div.translation-example.-normal');
            normal_example.style.backgroundImage = translation_to_gradient(trans.normal);
            let console_example = mk('div.translation-example.-console');
            console_example.style.backgroundImage = translation_to_gradient(trans.console ?? trans.normal);

            let el = mk('label',
                mk('input', {name: 'translation', type: 'radio', value: name}),
                normal_example,
                console_example,
                mk('span.name', name),
                mk('span.acs-escape', trans.acs_code ? '\\c' + trans.acs_code : ''),
                trans.flat ? mk('button', {type: 'button', style: `background: ${trans.flat.hex}`, 'data-hex': trans.flat.hex}) : '',
            );
            this.translation_elements[name] = el;
            trans_list.append(mk('li', el));
        }
        trans_list.addEventListener('change', redraw_handler);
        // Catch button clicks
        trans_list.addEventListener('click', ev => {
            if (ev.target.tagName !== 'BUTTON')
                return;

            this.set_background(ev.target.getAttribute('data-hex'));
        });

        // Custom translations
        for (let name of this.custom_translations) {
            // TODO save/load from fragment in some sensible way, oy
            // TODO initialize also?  either the form to the translation or vice versa
            let start = this.form.elements[name + 'a'];
            let middle = this.form.elements[name + 'b'];
            let end = this.form.elements[name + 'c'];
            let use_middle = this.form.elements[name + 'mid'];

            Object.assign(this.translations[name], {
                start_ctl: start,
                middle_ctl: middle,
                end_ctl: end,
                use_middle_ctl: use_middle,
            });

            let handler = ev => {
                this.update_custom_translation(name);
            };
            for (let el of [start, middle, end, use_middle]) {
                el.addEventListener('change', handler);
            }
        }

        // Miscellaneous
        let handle_radioset = ev => this._update_radioset(ev.target.closest('ul.radioset'));
        for (let ul of document.querySelectorAll('ul.radioset')) {
            ul.addEventListener('change', handle_radioset);
        }

        // This also fixes the form and does the initial draw.
        this.set_form_from_fragment();
        // If the textarea is still blank (which may not be the case if browser navigation restored
        // previously-typed text!), populate it and re-draw.
        if (textarea.value === "") {
            this.randomize();
        }

        // Utility buttons
        document.querySelector('#button-randomize').addEventListener('click', () => {
            this.randomize();
        });
        document.querySelector('#button-copy').addEventListener('click', ev => {
            if (! window.ClipboardItem) {
                alert("hello sorry, in firefox this is still behind a preference, you will need to visit about:config and enable:\n\ndom.events.asyncClipboard.clipboardItem\n\nthen refresh and try again");
                return;
            }

            this.final_canvas.toBlob(async blob => {
                if (! blob)
                    return;

                await navigator.clipboard.write([ new ClipboardItem({'image/png': blob}) ]);
                let star = mk('div.star', "⭐");
                star.style.left = `${ev.clientX}px`;
                star.style.top = `${ev.clientY}px`;
                document.body.append(star);
                setTimeout(() => star.remove(), 1000);
            });
        });
        document.querySelector('#button-download').addEventListener('click', () => {
            this.final_canvas.toBlob(blob => {
                if (! blob)
                    return;

                let slug = (
                    this.form.elements['text'].value
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^-0-9a-z]+/g, '')
                );
                let stem = this.form.elements['font'].value + '-' + (slug || 'blank');
                trigger_local_download(stem.substring(0, 100) + '.png', blob);
            });
        });
        // TODO figure out how to make this more generic.  maybe pop open a dialog?
        document.querySelector('#button-bulk-download').addEventListener('click', async () => {
            let font_ident = this.form.elements['font'].value;
            let text = this.form.elements['text'].value;
            if (! text)
                return;

            let lines = text.split(/\n/);
            let args = this.get_render_args();
            let promises = [];
            for (let line of lines) {
                let canvas = this.render_text({
                    text: line,
                    canvas: null,
                    ...args
                });
                promises.push(
                    new Promise(res => canvas.toBlob(res)).then(blob => blob.arrayBuffer()));
            }
            let bufs = await Promise.all(promises);
            let files = {};
            for (let [i, buf] of bufs.entries()) {
                if (i >= 100)
                    break;

                let s = String(i);
                if (s.length === 1) {
                    s = '0' + s;
                }
                files[`CWILV${s}.png`] = new Uint8Array(buf);
            }
            let bytes = fflate.zipSync(files, { level: 0 });
            let zipblob = new Blob([bytes]);
            trigger_local_download('doomtext.zip', zipblob);
        });

        // Update if the fragment changes
        window.addEventListener('popstate', ev => {
            this.set_form_from_fragment();
        });

        // Dialogs
        this.font_info_dialog = document.querySelector('#font-info-dialog');
        this.font_info_dialog.querySelector('button.-close').addEventListener('click', ev => {
            ev.target.closest('dialog').close();
        });
    }

    _update_radioset(ul) {
        for (let li of ul.querySelectorAll('li.selected')) {
            li.classList.remove('selected');
        }
        for (let radio of ul.querySelectorAll('input[type=radio]:checked')) {
            radio.closest('ul.radioset > li').classList.add('selected');
        }
    }
    _update_all_radiosets() {
        for (let ul of document.querySelectorAll('ul.radioset')) {
            this._update_radioset(ul);
        }
    }

    set_form_from_fragment() {
        let args = new URLSearchParams(location.hash.substring(1));
        for (let [key, value] of args) {
            let el = this.form.elements[key];
            if (! el)
                continue;

            if (el.type === 'checkbox' && el.value === value) {
                el.checked = true;
            }
            else if (el.type === 'file') {
                el.value = '';
            }
            else {
                el.value = value;
            }
        }

        this.fix_form();
        this.redraw_current_text();
    }

    _fix_bg_controls() {
        this.form.elements['bgcolor'].disabled = ! this.form.elements['bg'].checked;
    }

    _fix_wrap_controls() {
        let disabled = ! this.form.elements['wrap'].checked;
        this.form.elements['wrap-width'].disabled = disabled;
        this.form.elements['wrap-units'].disabled = disabled;
        //this.form.elements['overflow'].disabled = disabled;
    }

    // Update the form with various internal consistency stuff
    fix_form() {
        this._update_all_radiosets();
        this._fix_bg_controls();
        this._fix_wrap_controls();

        // XXX i feel like i'm repeating myself a bit.  what if they had a trigger instead
        let scale_ctl = this.form.elements['scale'];
        scale_ctl.parentNode.querySelector('output').textContent = `${scale_ctl.value}×`;
        let kerning_ctl = this.form.elements['kerning'];
        kerning_ctl.parentNode.querySelector('output').textContent = String(kerning_ctl.value);
        let line_spacing_ctl = this.form.elements['line-spacing'];
        line_spacing_ctl.parentNode.querySelector('output').textContent = String(line_spacing_ctl.value);
        let padding_ctl = this.form.elements['padding'];
        padding_ctl.parentNode.querySelector('output').textContent = String(padding_ctl.value);

        document.body.classList.toggle('outlined', this.form.elements['outline'].checked);
        document.body.classList.toggle('solo', this.form.elements['solo'].checked);

        for (let name of this.custom_translations) {
            this.update_custom_translation(name);
        }
    }

    update_fragment() {
        // FIXME do something with file uploads
        let data = new FormData(this.form);
        data.delete('wad');  // file upload control does not have a useful value
        let font = this.fonts[data.get('font')];
        if (! font.is_builtin) {
            // The URL can't handle custom fonts, so fall back to the default
            data.set('font', 'doom-small');
        }
        history.replaceState(null, document.title, '#' + new URLSearchParams(data));
    }

    add_font_to_list(ident, name) {
        let name_canvas = this.render_text({
            text: name,
            default_font: ident,
            scale: 2,
            escapee_mode: 'min-each',
            canvas: null,
        });
        let info_button = mk('button.emoji-button', {type: 'button'}, "ℹ️");
        info_button.addEventListener('click', ev => {
            this.show_font_info(ident);
        });
        let li = mk('li',
            mk('label',
                mk('input', {type: 'radio', name: 'font', value: ident}),
                info_button,
                " ",
                name_canvas,
            ),
        );
        this.font_list_el.append(li);
        this.rendered_font_names[ident] = name_canvas;
    }

    show_font_info(ident) {
        let font = this.fonts[ident];
        let dialog = this.font_info_dialog;
        let q = sel => this.font_info_dialog.querySelector(':scope ' + sel);
        q('> h1').textContent = '';
        q('> h1').append(
            mk('img', {src: this.rendered_font_names[ident].toDataURL('image/png')}));

        if (font.is_builtin) {
            let title = [`${font.meta?.name} — `];
            if (typeof font.meta.creator === 'string') {
                title.push(font.meta.creator);
            }
            else {
                let first = true;
                for (let creator of font.meta.creator) {
                    if (! first) {
                        title.push(", ");
                    }
                    first = false;
                    if (creator in FONT_CREATOR_URLS) {
                        title.push(mk('a', {href: FONT_CREATOR_URLS[creator]}, creator));
                    }
                    else {
                        title.push(creator);
                    }
                }
            }
            q('> h2').textContent = '';
            q('> h2').append(...title);
            q('> .-desc').textContent = font.meta.desc;
        }
        else {
            q('> h2').textContent = `${font.meta?.name}`;
            q('> .-desc').textContent = "Font extracted from a file you provided.";
        }

        if (font.meta.format === 'lumps') {
            q('p.-format').textContent = "collection of loose lumps in a WAD";
        }
        else if (font.meta.format === 'FON2') {
            q('p.-format').textContent = "";
            q('p.-format').append(
                mk('a', {href: 'https://zdoom.org/wiki/FON2'}, "FON2"));
        }
        else if (font.meta.format === 'unicode') {
            q('p.-format').textContent = "";
            q('p.-format').append(
                mk('a', {href: 'https://zdoom.org/wiki/Unicode_font'}, "GZDoom \"Unicode\" font"));
        }
        if (font.meta.source_url) {
            q('p.-source').textContent = "";
            q('p.-source').append(mk('a', {href: font.meta.source_url}, font.meta.source));
        }
        else {
            q('p.-source').textContent = font.meta.source ?? "";
        }
        q('p.-license').textContent = FONT_LICENSES[font.meta.license ?? 'unknown'];

        let [table_ascii, table_other] = this.font_info_dialog.querySelectorAll('ol.character-set');
        table_ascii.textContent = '';
        table_other.textContent = '';
        for (let n = 32; n < 128; n++) {
            let ch = String.fromCodePoint(n);
            if (ch in font.glyphs) {
                if (ch === " ") {
                    ch = "␠";
                }
                else if (ch === "\x7f") {
                    ch = "␡";
                }
                table_ascii.append(mk('li', ch));
            }
            else {
                table_ascii.append(mk('li.-missing'));
            }
        }
        for (let ch of Object.keys(font.glyphs).sort()) {
            if (ch <= "\x7f")
                continue;

            table_other.append(mk('li', ch));
        }

        dialog.showModal();
    }

    async load_fonts_from_files(files) {
        let output_el = document.querySelector('#wad-uploader output');
        output_el.classList.remove('--success', '--failure');
        output_el.textContent = 'Beep boop, computing...';
        output_el.offsetWidth;

        let promises = [];
        for (let file of files) {
            promises.push(this.load_fonts_from_file(file));
        }

        let results = await Promise.allSettled(promises);
        output_el.textContent = '';
        let first_font = true;
        for (let [i, result] of results.entries()) {
            let file = files[i];
            if (result.status === 'fulfilled') {
                for (let ident of result.value) {
                    this.add_font_to_list(ident, this.fonts[ident].name.replace(/—/, "-"));

                    // If this is the first font we found, go ahead and select it and redraw.
                    // This also speeds up getting back where you were after refreshing
                    if (first_font) {
                        first_font = false;

                        this.form.elements['font'].value = ident;
                        // Fire a 'change' event so state gets tidied up
                        let ev = new Event('change', { bubbles: true });
                        for (let radio of this.form.elements['font']) {
                            if (radio.checked) {
                                radio.dispatchEvent(ev);
                                break;
                            }
                        }
                        this.redraw_current_text();
                    }
                }

                let font_msg;
                if (result.value.length === 1) {
                    font_msg = "a font";
                }
                else {
                    font_msg = `${result.value.length} fonts`;
                }
                output_el.append(mk('p.-success', `${file.name} — Found ${font_msg}`));
            }
            else {
                output_el.append(mk('p.-failure', `${file.name} — ${result.reason}`));
                if (result.reason.constructor !== Error) {
                    // Oh this is a real error
                    console.error(result.reason);
                }
            }
        }
    }

    async load_fonts_from_file(file) {
        let magic = string_from_buffer_ascii(await file.slice(0, 4).arrayBuffer());
        let found_fonts = [];

        // WADs and PK3s are fairly similar (other than that only PK3s can contain unicode fonts),
        // but not QUITE similar enough to share code, alas.
        // Duplicating several lines of FON parsing is especially irritating
        let palette = DOOM2_PALETTE;  // TODO UI for choosing a different stock palette...?
        let lump_index = {};  // uppercase lump name: ArrayBuffer
        let collector = new LumpyFontCollector;
        let read_lump;  // ugh
        if (magic === 'IWAD' || magic === 'PWAD') {
            read_lump = lump => {
                return file.slice(lump.offset, lump.offset + lump.size).arrayBuffer();
            };
            let lumps = await parse_wad(file);

            for (let lump of lumps) {
                // Markers and the like will never be interesting
                if (lump.size < 4)
                    continue;
                lump_index[lump.name.toUpperCase()] = lump;

                // Check for a known font type
                let magic = string_from_buffer_ascii(
                    await file.slice(lump.offset, lump.offset + 4).arrayBuffer());
                if (magic === 'FON2') {
                    let ident = `${file.name}:${lump.name}`;
                    let buf = file.slice(lump.offset, lump.offset + lump.size).arrayBuffer();
                    this.fonts[ident] = new FON2Font(await file.arrayBuffer(), {
                        name: `${file.name} — ${lump.name}`,
                    });
                    found_fonts.push(ident);
                    continue;
                }

                if (lump.name === 'PLAYPAL' && lump.size >= 768) {
                    let buf = await file.slice(lump.offset, lump.offset + 768).arrayBuffer();
                    palette = parse_first_playpal(buf);
                }

                collector.scan(lump.name, lump);
            }
        }
        else if (magic === 'PK\x03\x04') {
            if (! window.fflate)
                throw new Error("Can't read PK3s because the fflate library failed to load");

            read_lump = bytes => bytes.buffer;
            // I've been unable to find a JS zip library that will let me peek at the first few
            // bytes of each entry without decompressing every goddamn one, so, fuck it I
            // guess, it's your machine not mine, let's just inflate it big and round
            let buf = await file.arrayBuffer();
            let promise = new Promise((res, rej) => {
                fflate.unzip(new Uint8Array(buf), (err, data) => {
                    if (err) {
                        rej(err);
                    }
                    else {
                        res(data);
                    }
                });
            });

            let contents = await promise;

            // PK3s might contain any of:
            // - Single-lump font formats (e.g. FON2)
            // - Unicode fonts, a directory /fonts/foo containing images (TODO)
            // - A big ol' pile of Doom graphics used implicitly (TODO ugh)
            // - Something vastly more complicated using FONTDEFS (TODO TODO TODO)
            let unicode_fonts = {};
            for (let [path, data] of Object.entries(contents)) {
                if (data.byteLength < 4)
                    continue;

                let magic = string_from_buffer_ascii(data, 0, 4);
                if (magic === 'FON2') {
                    let ident = `${file.name}:${path}`;
                    this.fonts[ident] = new FON2Font(data.buffer, {
                        name: `${file.name} — ${path}`,
                    });
                    found_fonts.push(ident);
                    continue;
                }

                // Look for Unicode fonts, which are at least easy to identify: they're all
                // fonts/NAME/HHHH, with an optional font.inf in the same directory
                let m = path.match(/^((?:filter[/][^/]+[/])?fonts[/][^/]+)[/]([^/.]+)([.].*)?$/);
                if (m) {
                    let [_, fontpath, stem, ext] = m;
                    let fontdef = unicode_fonts[fontpath];
                    if (! fontdef) {
                        fontdef = {
                            raw_glyphs: new Map,
                        };
                        unicode_fonts[fontpath] = fontdef;
                    }

                    if (path.endsWith('/font.inf')) {
                        // Cheaply parse the info file, which is just identifier keys and then some
                        // kinda value
                        let inf = string_from_buffer_ascii(data);
                        inf = inf.replace(/[/][*].*[*][/]/gs, '');
                        inf = inf.replace(/[/][/].*$/gm, '');
                        let info = {};
                        for (let [line] of inf.matchAll(/^(.+)$/gm)) {
                            line = line.trim();
                            if (line === "")
                                continue;

                            let m = line.match(/^([a-z]\w*)[ \t]+(.+)$/i);
                            if (! m) {
                                console.warn("Bad line in font.inf?", line);
                                continue;
                            }
                            info[m[1].toLowerCase()] = m[2];
                        }

                        let kerning = parseInt(info['kerning'], 10);
                        if (! Number.isNaN(kerning)) {
                            fontdef.kerning = kerning;
                        }
                        let line_height = parseInt(info['fontheight'], 10);
                        if (! Number.isNaN(line_height) && line_height > 0) {
                            fontdef.line_height = line_height;
                        }
                        let space_width = parseInt(info['spacewidth'], 10);
                        if (! Number.isNaN(space_width)) {
                            fontdef.space_width = space_width;
                        }
                        if ('translationtype' in info && info['translationtype'].toLowerCase() === 'console') {
                            fontdef.use_console_translation = true;
                        }
                        if ('cellsize' in info) {
                            let m = info['cellsize'].match(/^(\d+)\s*,\s*(\d+)$/);
                            if (m) {
                                fontdef.cell_width = parseInt(m[1], 10);
                                fontdef.cell_height = parseInt(m[2], 10);
                            }
                            else {
                                console.error("Bad cellsize in font.inf?", info['cellsize']);
                            }
                        }
                        continue;
                    }

                    if (! stem.match(/^[0-9a-f]+$/i))
                        continue;
                    fontdef.raw_glyphs.set(parseInt(stem, 16), data);
                }

                if (path.match(/^playpal(?:[.][^/]*)?$/i) && data.byteLength >= 768) {
                    palette = parse_first_playpal(data);
                }

                // For a PK3, lumpy fonts should be in graphics/
                if (path.startsWith('graphics/')) {
                    collector.scan(path.replace(/[.][^.]+$/, ''), data);
                }
            }

            // Assemble any Unicode fonts
            for (let [fontpath, fontdef] of Object.entries(unicode_fonts)) {
                if (! fontdef.raw_glyphs.size) {
                    console.log("Didn't find any glyphs in Unicode font", fontpath);
                    continue;
                }

                let glyphs = {};
                let minlight = 255;
                let maxlight = 0;

                for (let [cp, imgdata] of fontdef.raw_glyphs) {
                    let [canvas, xanchor, yanchor] = await parse_image(imgdata.buffer, palette);
                    let [light0, light1] = measure_image_lightness(canvas);
                    minlight = Math.min(minlight, light0);
                    maxlight = Math.max(maxlight, light1);

                    if (fontdef['cell_width']) {
                        // This is a montage of fixed-size glyphs
                        for (let y = 0; y < canvas.height; y += fontdef.cell_height) {
                            for (let x = 0; x < canvas.width; x += fontdef.cell_width) {
                                glyphs[String.fromCodePoint(cp)] = {
                                    canvas, x, y,
                                    width: fontdef.cell_width,
                                    height: fontdef.cell_height,
                                    dx: -xanchor,
                                    dy: -yanchor,
                                };
                                cp += 1;
                            }
                        }
                    }
                    else {
                        // This whole image is one glyph
                        glyphs[String.fromCodePoint(cp)] = {
                            canvas,
                            width: canvas.width,
                            height: canvas.height,
                            dx: -xanchor,
                            dy: -yanchor,
                        };
                    }
                }

                fontdef.glyphs = glyphs;
                fontdef.lightness_range = [minlight, maxlight];

                let ident = `${file.name}:${fontpath}`;
                // FIXME consolidate all the font types probably, they don't meaningfully differ
                this.fonts[ident] = new UnicodeFont(fontdef, {
                    name: `${file.name} — ${fontpath}`,
                    format: 'unicode',
                });
                found_fonts.push(ident);
            }
        }
        else if (magic === 'FON2') {
            let ident = file.name;
            this.fonts[ident] = new FON2Font(await file.arrayBuffer(), {
                name: file.name.replace(/[.][^.]+$/, ''),
            });
            return [ident];
        }
        else {
            throw new Error("Unrecognized file type");
        }

        // OK, all that's left from here are lump clumps
        for (let [prefix, catalogue] of collector.get_results()) {
            // Convert the map into a table of glyphs and decode the image data
            console.log("looks like we have a font:", prefix);
            let glyphs = {};
            let minlight = 255;
            let maxlight = 0;
            for (let [cp, opaque] of catalogue) {
                let [canvas, xanchor, yanchor] = await parse_image(await read_lump(opaque));
                glyphs[String.fromCodePoint(cp)] = {
                    canvas,
                    width: canvas.width,
                    height: canvas.height,
                    dx: -xanchor,
                    dy: -yanchor,
                };

                let [light0, light1] = measure_image_lightness(canvas);
                minlight = Math.min(minlight, light0);
                maxlight = Math.max(maxlight, light1);
            }

            let ident = file.name + ":" + prefix;
            this.fonts[ident] = new WADFont(glyphs, {
                name: `${file.name} — ${prefix}*`,
                format: 'lumps',
            });
            // XXX should proooobably pass this in
            this.fonts[ident].lightness_range = [minlight, maxlight];
            found_fonts.push(ident);
        }

        if (found_fonts.length === 0)
            throw new Error("Couldn't find any lumps that look like fonts");

        return found_fonts;
    }

    // Roll a random message and color
    randomize() {
        let group = random_choice(SAMPLE_MESSAGES);
        this.form.elements['text'].value = random_choice(group.messages);

        this.form.elements['font'].value = group.font ?? random_choice(Object.keys(DOOM_FONTS));

        if (Math.random() < 0.2) {
            this.form.elements['translation'].value = '';
        }
        else {
            this.form.elements['translation'].value = random_choice(Object.keys(this.translations));
        }

        this._update_all_radiosets();
        this.redraw_current_text();
    }

    set_background(bgcolor) {
        if (bgcolor === null) {
            this.form.elements['bg'].checked = false;
            this.form.elements['bgcolor'].disabled = true;
        }
        else {
            this.form.elements['bg'].checked = true;
            this.form.elements['bgcolor'].disabled = false;
            this.form.elements['bgcolor'].value = bgcolor;
        }
        this.update_background();
        this.redraw_current_text();
    }

    update_background() {
        let canvas_wrapper = document.getElementById('canvas-wrapper');
        if (this.form.elements['bg'].checked) {
            canvas_wrapper.style.backgroundColor = this.form.elements['bgcolor'].value;
        }
        else {
            canvas_wrapper.style.backgroundColor = 'transparent';
        }
    }

    update_custom_translation(name) {
        let trans = this.translations[name];
        if (trans.use_middle_ctl.checked) {
            trans.normal = [
                [0, 127, rgb([trans.start_ctl.value]), rgb([trans.middle_ctl.value])],
                [128, 255, rgb([trans.middle_ctl.value]), rgb([trans.end_ctl.value])],
            ];
        }
        else {
            trans.normal = [[0, 255, rgb([trans.start_ctl.value]), rgb([trans.end_ctl.value])]];
        }
        trans.console = trans.normal;

        trans.middle_ctl.disabled = ! trans.use_middle_ctl.checked;

        // FIXME when there's several
        let output = document.querySelector('.shabby-gradient-editor output');
        let gradient = translation_to_gradient(trans.normal);
        output.style.backgroundImage = gradient;
        for (let ex of this.translation_elements[name].querySelectorAll('div.translation-example')) {
            ex.style.backgroundImage = gradient;
        }

        // TODO only need to do this if it actually uses this translation...
        this.redraw_current_text();
    }

    get_render_args() {
        let elements = this.form.elements;
        let font = this.fonts[elements['font'].value];

        let wrap = null;
        if (elements['wrap'].checked) {
            let n = Math.max(0, parseFloat(elements['wrap-width'].value));
            let unit = elements['wrap-units'].value;
            let scale = 1;
            if (unit === 'em') {
                if (font.glyphs['m']) {
                    scale = font.glyphs['m'].width;
                }
                else if (font.glyphs['M']) {
                    scale = font.glyphs['M'].width;
                }
                else {
                    // ???
                    scale = font.line_height;
                }
            }
            else if (unit === 'sp') {
                if (font.glyphs[' ']) {
                    scale = font.glyphs[' '].width;
                }
                else {
                    scale = font.space_width;
                }
            }

            wrap = n * scale;
        }

        return {
            syntax: elements['syntax'].value,
            scale: elements['scale'].value,
            kerning: parseInt(elements['kerning'].value, 10),
            line_spacing: parseInt(elements['line-spacing'].value, 10),
            escapee_mode: elements['escapee-mode'].value,
            padding: parseInt(elements['padding'].value, 10),
            wrap: wrap,
            default_font: elements['font'].value,
            default_translation: elements['translation'].value || null,
            alignment: elements['align'].value,
            background: elements['bg'].checked ? elements['bgcolor'].value : null,
        };
    }

    redraw_current_text() {
        this.render_text({
            text: this.form.elements['text'].value,
            ...this.get_render_args(),
        });

        this.update_fragment();
    }

    render_text(args) {
        let text = args.text;
        let syntax = args.syntax;
        if (syntax !== 'acs') {
            syntax = 'none';
        }
        let scale = args.scale || 1;
        let kerning = args.kerning || 0;
        let line_spacing = args.line_spacing || 0;
        // How to adjust the height of the line for odd-size glyphs:
        // default: just use the given line height and do nothing else
        // max: all lines grow to fit the whole charset
        // each: each line grows to fit that line's glyphs
        // equal: all lines grow to fit the whole text's glyphs
        // min-each: like 'each', but also shrink to fit that line's glyphs
        // min-equal: like 'equal', but also shrink to fit the whole text's glyphs
        let escapee_mode = args.escapee_mode || 'none';
        if (['max', 'each', 'equal', 'min-each', 'min-equal'].indexOf(escapee_mode) < 0) {
            escapee_mode = 'none';
        }
        let padding = Math.max(0, args.padding || 0);
        let default_font = args.default_font || 'doom-small';
        let default_translation = args.default_translation || null;
        let alignment = args.alignment;
        if (alignment === null || alignment === undefined) {
            alignment = 0.5;
        }
        let background = args.background;
        let wrap = args.wrap || null;

        let final_canvas;
        if (args.canvas === null) {
            // This means use a new canvas
            final_canvas = document.createElement('canvas');
            final_canvas.width = 32;
            final_canvas.height = 32;
        }
        else if (args.canvas) {
            final_canvas = args.canvas;
        }
        else {
            // Undefined means use the default canvas
            final_canvas = this.final_canvas;
        }

        if (syntax === 'acs') {
            text = text.replace(/\\\n/g, "").replace(/\\n/g, "\n");
        }

        let lines = text.split('\n');

        let font = this.fonts[default_font];
        // XXX handle error?

        // Compute some layout metrics first
        let line_infos = [];
        let y = 0;
        for (let line of lines) {
            // Note: with ACS, the color reverts at the end of every line
            let translation = default_translation;
            let x = 0;
            let last_word_ending = null;
            let prev_glyph_was_space = false;
            let line_info = {
                draws: [],
                width: null,  // set at the end of the line
                height: font.line_height,
                ascent: 0,
                descent: 0,
                x0: null,  // set during alignment
                y0: y,
            };
            line_infos.push(line_info);
            // TODO line height may need adjustment if there's a character that extends above the top of the line
            // TODO options for line height?  always use min height, default, equal height, always
            // use max height?

            let character_regex;
            if (syntax === 'acs') {
                character_regex = /\\c\[(.*?)\]|\\c(.)|\\([0-7]{3})|\\x([0-9a-fA-F]{2})|\\([\\"])|./g;
            }
            else {
                character_regex = /./g;
            }
            let match;
            while (match = character_regex.exec(line)) {
                let ch = match[0];
                if (match[1] !== undefined) {
                    // ACS translation by name
                    // TODO this fudges the aliasing a bit
                    translation = match[1].toLowerCase().replace(/ /g, '').replace(/grey/g, 'gray');
                    if (translation === 'untranslated') {
                        translation = null;
                    }
                    else if (this.translations[translation] === undefined) {
                        // TODO warn?
                        translation = null;
                    }
                    continue;
                }
                else if (match[2] !== undefined) {
                    // ACS translation code
                    translation = ZDOOM_ACS_TRANSLATION_CODES[match[2]];
                    continue;
                }
                else if (match[3] !== undefined) {
                    // Octal escape
                    ch = String.fromCodePoint(parseInt(match[3], 8));
                }
                else if (match[4] !== undefined) {
                    // Hex escape
                    ch = String.fromCodePoint(parseInt(match[4], 16));
                }
                else if (match[5] !== undefined) {
                    // Literal escape (\\ or \")
                    ch = match[5];
                }

                let is_space = (ch === ' ' || ch === '\t');
                if (is_space && ! prev_glyph_was_space) {
                    last_word_ending = {
                        next_index: line_info.draws.length,
                        x: x,
                    };
                }
                prev_glyph_was_space = is_space;

                if (x > 0) {
                    x += (font.kerning || 0);
                    x += kerning;
                }

                let glyph = font.glyphs[ch];
                // TODO better handle lowercase remapping, turn anything else into...  something?
                if (! glyph) {
                    if (ch === ' ') {
                        // With no explicit space glyph, fall back to the font prop
                        // TODO this isn't always populated oops
                        x += (font.space_width || 0);
                        continue;
                    }

                    // Try changing the case
                    if (ch !== ch.toUpperCase()) {
                        glyph = font.glyphs[ch.toUpperCase()];
                    }
                    else if (ch !== ch.toLowerCase()) {
                        glyph = font.glyphs[ch.toLowerCase()];
                    }

                    // FIXME if still no good, do some fallback

                    if (! glyph)
                        continue;
                }

                line_info.draws.push({glyph, x, translation, is_space});
                x += glyph.width;

                if (! is_space && wrap !== null && x > wrap && last_word_ending !== null) {
                    // We overshot the wrap limit!  Backtrack one word and fix this by breaking the
                    // line.  (If we haven't seen the end of a word yet, this is just a really
                    // long word and there's nothing we can do about it.)

                    // End the current line
                    line_info.width = last_word_ending.x;
                    y += line_info.height + line_spacing;

                    // Skip any spaces after the end of the previous word
                    let i0 = last_word_ending.next_index;
                    while (i0 < line_info.draws.length && line_info.draws[i0].is_space) {
                        line_info.draws.splice(i0, 1);
                    }
                    // Break all subsequent glyphs onto a new line
                    let old_line_info = line_info;
                    line_info = {
                        draws: old_line_info.draws.splice(i0),
                        width: null,
                        height: font.line_height,
                        ascent: 0,
                        descent: 0,
                        x0: null,
                        y0: y,
                    };
                    line_infos.push(line_info);
                    // Shift them back horizontally to the start of the line
                    let dx = line_info.draws[0].x;
                    for (let draw of line_info.draws) {
                        draw.x -= dx;
                    }

                    // Update our current x position and continue
                    x -= dx;
                    last_word_ending = null;
                }
            }

            line_info.width = x;
            y += line_info.height + line_spacing;
        }

        // Undo this, since there's no spacing after the last line
        if (lines.length > 0) {
            y -= line_spacing;
        }
        let canvas_height = y;

        // Deal with characters that extend beyond the line height, or that don't extend to reach it
        // TODO feels like a font method maybe
        let extract_ascent_descent = (glyphs, line_height, min_zero) => {
            let ascent = Math.max(...glyphs.map(glyph => -glyph.dy));
            let descent = Math.max(...glyphs.map(glyph => glyph.height + glyph.dy - line_height));
            if (min_zero) {
                ascent = Math.max(0, ascent);
                descent = Math.max(0, descent);
            }
            else {
                if (ascent === -Infinity) {
                    ascent = 0;
                }
                if (descent === -Infinity) {
                    descent = 0;
                }
            }
            return [ascent, descent];
        };
        if (escapee_mode === 'none') {
            // Despite the name, we do do ONE thing here: expand the first and last lines to ensure
            // no glyphs get cut off
            // TODO but if there's padding, maybe we should let glyphs escape into it?
            let [ascent, descent] = extract_ascent_descent(
                line_infos[0].draws.map(draw => draw.glyph), font.line_height, true);
            line_infos[0].ascent = ascent;
            [ascent, descent] = extract_ascent_descent(
                line_infos.at(-1).draws.map(draw => draw.glyph), font.line_height, true);
            line_infos.at(-1).descent = descent;
        }
        else if (escapee_mode === 'max') {
            // Make every line as tall as possible
            let [ascent, descent] = extract_ascent_descent(
                Object.values(font.glyphs), font.line_height, true);
            for (let line_info of line_infos) {
                line_info.ascent = ascent;
                line_info.descent = descent;
            }
        }
        else {
            // Actually compute how much extra ascent + descent space we need
            for (let line_info of line_infos) {
                [line_info.ascent, line_info.descent] = extract_ascent_descent(
                    line_info.draws.map(draw => draw.glyph),
                    font.line_height,
                    ! (escapee_mode === 'min-each' || escapee_mode === 'min-equal'));
            }

            // For 'equal' height, copy the greatest of each to every line
            if (escapee_mode === 'equal' || escapee_mode === 'min-equal') {
                let ascent = Math.max(...line_infos.map(line_info => line_info.ascent));
                let descent = Math.max(...line_infos.map(line_info => line_info.descent));
                for (let line_info of line_infos) {
                    line_info.ascent = ascent;
                    line_info.descent = descent;
                }
            }
        }

        // Apply any vertical space changes from ascent/descent
        let y_shift = 0;
        for (let line_info of line_infos) {
            // Ascent is "outside" the line, so it goes before the line's y position
            line_info.y0 += y_shift + line_info.ascent;
            y_shift += line_info.ascent + line_info.descent;
        }
        canvas_height += y_shift;

        // Resize the canvas to fit snugly
        let canvas_width = Math.max(...line_infos.map(line_info => line_info.width));
        this.buffer_canvas.width = canvas_width;
        this.buffer_canvas.height = canvas_height;
        if (canvas_width === 0 || canvas_height === 0) {
            return;
        }

        // Align text horizontally
        if (alignment > 0) {
            for (let line_info of line_infos) {
                line_info.x0 = Math.floor((canvas_width - line_info.width) * alignment);
            }
        }

        // And draw!
        let ctx = this.buffer_canvas.getContext('2d');
        for (let line_info of line_infos) {
            for (let draw of line_info.draws) {
                let glyph = draw.glyph;
                let px = line_info.x0 + (glyph.dx || 0) + draw.x;
                let py = line_info.y0 + (glyph.dy || 0);
                if (draw.translation) {
                    // Argh, we need to translate
                    let transdef = this.translations[draw.translation];
                    let trans = default_font === 'zdoom-console' ? transdef.console : transdef.normal;
                    // First draw the character to the dummy canvas -- note we can't
                    // draw it to this canvas and then alter it, because negative
                    // kerning might make it overlap an existing character we shouldn't
                    // be translating
                    let scratch_ctx = init_scratch_canvas(glyph.width, glyph.height);
                    font.draw_glyph(glyph, scratch_ctx, 0, 0);

                    // Now translate it in place
                    let imagedata = scratch_ctx.getImageData(0, 0, glyph.width, glyph.height);
                    let pixels = imagedata.data;
                    let [light0, light1] = font.lightness_range;
                    for (let i = 0; i < pixels.length; i += 4) {
                        if (pixels[i + 3] === 0)
                            continue;

                        let lightness = get_lightness(pixels[i + 0], pixels[i + 1], pixels[i + 2]);
                        lightness = (lightness - light0) / (light1 - light0) * 256;
                        let l = Math.max(0, Math.min(255, Math.floor(lightness)));
                        for (let span of trans) {
                            if (span[0] <= l && l <= span[1]) {
                                let t = Math.floor(256 * (l - span[0]) / (span[1] - span[0]));
                                let c0 = span[2];
                                let c1 = span[3];
                                pixels[i + 0] = c0[0] + Math.floor((c1[0] - c0[0]) * t / 256);
                                pixels[i + 1] = c0[1] + Math.floor((c1[1] - c0[1]) * t / 256);
                                pixels[i + 2] = c0[2] + Math.floor((c1[2] - c0[2]) * t / 256);
                                break;
                            }
                        }
                    }
                    scratch_ctx.putImageData(imagedata, 0, 0);

                    // Finally blit it onto the final canvas.  Note that we do NOT put
                    // the image data directly, since that overwrites rather than
                    // compositing
                    ctx.drawImage(
                        scratch_canvas,
                        0, 0, glyph.width, glyph.height,
                        px, py, glyph.width, glyph.height);
                }
                else {
                    // Simple case: no translation is a straight blit
                    font.draw_glyph(glyph, ctx, px, py);
                }
            }
        }

        // Finally, scale up the offscreen canvas
        final_canvas.width = (canvas_width + 2 * padding) * scale;
        final_canvas.height = (canvas_height + 2 * padding) * scale;
        let final_ctx = final_canvas.getContext('2d');
        let aabb = [0, 0, final_canvas.width, final_canvas.height];
        if (background) {
            final_ctx.fillStyle = background;
            final_ctx.fillRect(...aabb);
        }
        else {
            final_ctx.clearRect(...aabb);
        }
        final_ctx.imageSmoothingEnabled = false;
        final_ctx.drawImage(
            this.buffer_canvas,
            padding * scale, padding * scale,
            canvas_width * scale, canvas_height * scale);

        return final_canvas;
    }
}

window.addEventListener('load', ev => {
    window._icon_of_sin = new BossBrain;
});
