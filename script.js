// TODO:
// get the extended characters from gzdoom
// more fonts?  some from popular megawads maybe?  hacx?  freedoom?
// someone asked for build + quake fonts
// .. also these https://forum.zdoom.org/viewtopic.php?f=37&t=33409&sid=d5022aefc120e44df307204f243589be
// data is way too big, a lot of it could be computed on the fly trivially?
// someday, bbcode...
// better missing char handling
// refreshing loses the selected translation
// aspect ratio correction?
// metrics twiddles -- customize spacing, space width, line height.  PADDING.  soft wrap?
// custom translations!
// force into doom (heretic, hexen, ...) palette?
// automatic wrapping, even?
// allow dragging in a wad, and identify any fonts within it
// little info popup about a font (source, copyright, character set...)
//
// TODO things people asked for:
// - [OK] add nightmare font
// - add query string, or maybe just insta-update fragment?
// - line spacing
// TODO nice to do while i'm here:
// - button to reroll a random message
// - modernize js
//   - load the json, as json
//   - i feel like i need a better way of handling the form elements, maybe i need a little lib of thin wrappers idk
//     - need to populate them on load from the fragment
//     - fragment should skip when value is default
//     - kerning and line spacing should support both a slider and a spinner?  or is that too much
// - update the html
//   - poor mobile layout
//   - translations unnecessarily wide on desktops
//   - too much text?  popups?  not sure
//   - no way to just enter a number
// - fix the json what the jesus fuck
// - preview image edges?
//   - show width/height?
// - button to download it, if that were not clear
import DOOM_FONTS from './data.js';
// Decode the glyph data real quick, shh we're technically mutating a global
for (let fontdef of Object.values(DOOM_FONTS)) {
    for (let [ch, metrics] of Object.entries(fontdef.glyphs)) {
        let [_, width, height, x, y, dx, dy] = metrics.match(/^(\d+)x(\d+)[+](\d+)[+](\d+)(?:@(-?\d+),(-?\d+))?$/);
        fontdef.glyphs[ch] = {
            x: parseInt(x, 10),
            y: parseInt(y, 10),
            width: parseInt(width, 10),
            height: parseInt(height, 10),
            dx: parseInt(dx ?? '0', 10),
            dy: parseInt(dy ?? '0', 10),
        };
    }
}

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

// used for rgb`#000000`
function rgb(rrggbb) {
    rrggbb = rrggbb[0];
    let ret = [
        parseInt(rrggbb.substring(1, 3), 16),
        parseInt(rrggbb.substring(3, 5), 16),
        parseInt(rrggbb.substring(5, 7), 16),
    ];
    ret.hex = rrggbb;
    return ret;
}

// XXX absolutely no idea what this was for
const USE_ZDOOM_TRANSLATION_ROUNDING = true;

// TODO does vanilla do anything like this??  is this converted to the palette?
const ZDOOM_TRANSLATIONS = {
    brick: {
        acs_code: 'a',
        normal: [[0, 256, rgb`#470000`, rgb`#FFB8B8`]],
        console: [
            [0, 127, rgb`#470000`, rgb`#A35C5C`],
            [128, 256, rgb`#800000`, rgb`#FFFEFE`],
        ],
        flat: rgb`#CC3333`,
    },
    tan: {
        acs_code: 'b',
        normal: [[0, 256, rgb`#332B13`, rgb`#FFEBDF`]],
        console: [
            [0, 127, rgb`#332B13`, rgb`#998B79`],
            [128, 256, rgb`#998B79`, rgb`#FFFFFF`],
        ],
        flat: rgb`#D2B48C`,
    },
    gray: {
        acs_code: 'c',
        aliases: ['Grey'],
        normal: [[0, 256, rgb`#272727`, rgb`#EFEFEF`]],
        console: [
            [0, 127, rgb`#272727`, rgb`#8B8B8B`],
            [128, 256, rgb`#505050`, rgb`#FFFFFF`],
        ],
        flat: rgb`#CCCCCC`,
    },
    green: {
        acs_code: 'd',
        normal: [[0, 256, rgb`#0B1707`, rgb`#77FF6F`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#007F00`],
            [128, 256, rgb`#00FF00`, rgb`#FEFFFE`],
        ],
        flat: rgb`#00CC00`,
    },
    brown: {
        acs_code: 'e',
        normal: [[0, 256, rgb`#533F2F`, rgb`#BFA78F`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#7F4000`],
            [128, 256, rgb`#432F1F`, rgb`#FFE7CF`],
        ],
        flat: rgb`#996633`,
    },
    gold: {
        acs_code: 'f',
        normal: [[0, 256, rgb`#732B00`, rgb`#FFFF73`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#7FC040`],
            [128, 256, rgb`#DFBF00`, rgb`#DFFFFE`],
        ],
        flat: rgb`#FFCC00`,
    },
    red: {
        acs_code: 'g',
        normal: [[0, 256, rgb`#3F0000`, rgb`#FF0000`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#7F0000`],
            [128, 256, rgb`#FF0000`, rgb`#FFFEFE`],
        ],
        flat: rgb`#FF5566`,
    },
    blue: {
        acs_code: 'h',
        normal: [[0, 256, rgb`#000027`, rgb`#0000FF`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#00007F`],
            [128, 256, rgb`#4040FF`, rgb`#DEDEFF`],
        ],
        flat: rgb`#9999FF`,
    },
    orange: {
        acs_code: 'i',
        normal: [[0, 256, rgb`#200000`, rgb`#FF8000`]],
        console: [
            [0, 127, rgb`#200000`, rgb`#904000`],
            [128, 256, rgb`#FF7F00`, rgb`#FFFEFE`],
        ],
        flat: rgb`#FFAA00`,
    },
    // This is designed to match the white Heretic/Hexen font.
    // It is close to the gray BOOM font, but not quite the same.
    white: {
        acs_code: 'j',
        normal: [[0, 256, rgb`#242424`, rgb`#FFFFFF`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#7F7F7F`],
            [128, 256, rgb`#808080`, rgb`#FFFFFF`],
        ],
        flat: rgb`#DFDFDF`,
    },
    // This is designed to match the yellow Hexen font, which has a
    // gray outline filled with shades of yellow.
    yellow: {
        acs_code: 'k',
        normal: [
            [0, 64, rgb`#272727`, rgb`#515151`],
            [65, 207, rgb`#784918`, rgb`#F3A718`],
            [208, 256, rgb`#F3A82A`, rgb`#FCD043`],
        ],
        console: [
            [0, 127, rgb`#000000`, rgb`#7F7F00`],
            [128, 256, rgb`#FFFF00`, rgb`#FFFFFF`],
        ],
        flat: rgb`#EEEE33`,
    },
    black: {
        acs_code: 'm',
        normal: [[0, 256, rgb`#131313`, rgb`#505050`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#323232`],
            [128, 256, rgb`#0A0A0A`, rgb`#505050`],
        ],
        flat: rgb`#000000`,
    },
    lightblue: {
        acs_code: 'n',
        normal: [[0, 256, rgb`#000073`, rgb`#B4B4FF`]],
        console: [
            [0, 127, rgb`#00003C`, rgb`#5050FF`],
            [128, 256, rgb`#8080FF`, rgb`#FFFFFF`],
        ],
        flat: rgb`#33EEFF`,
    },
    cream: {
        acs_code: 'o',
        normal: [[0, 256, rgb`#CF8353`, rgb`#FFD7BB`]],
        console: [
            [0, 127, rgb`#2B230F`, rgb`#BF7B4B`],
            [128, 256, rgb`#FFB383`, rgb`#FFFFFF`],
        ],
        flat: rgb`#FFCC99`,
    },
    olive: {
        acs_code: 'p',
        normal: [[0, 256, rgb`#2F371F`, rgb`#7B7F50`]],
        console: [
            [0, 127, rgb`#373F27`, rgb`#7B7F63`],
            [128, 256, rgb`#676B4F`, rgb`#D1D8A8`],
        ],
        flat: rgb`#D1D8A8`,
    },
    darkgreen: {
        acs_code: 'q',
        aliases: ["Dark Green"],
        normal: [[0, 256, rgb`#0B1707`, rgb`#439337`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#005800`],
            [128, 256, rgb`#008C00`, rgb`#DCFFDC`],
        ],
        flat: rgb`#008C00`,
    },
    darkred: {
        acs_code: 'r',
        aliases: ["Dark Red"],
        normal: [[0, 256, rgb`#2B0000`, rgb`#AF2B2B`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#730000`],
            [128, 255, rgb`#800000`, rgb`#FFDCDC`],
        ],
        flat: rgb`#800000`,
    },
    darkbrown: {
        acs_code: 's',
        aliases: ["Dark Brown"],
        normal: [[0, 256, rgb`#1F170B`, rgb`#A36B3F`]],
        console: [
            [0, 127, rgb`#2B230F`, rgb`#773000`],
            [128, 256, rgb`#735743`, rgb`#F7BD58`],
        ],
        flat: rgb`#663333`,
    },
    purple: {
        acs_code: 't',
        normal: [[0, 256, rgb`#230023`, rgb`#CF00CF`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#9F009B`],
            [128, 256, rgb`#FF00FF`, rgb`#FFFFFF`],
        ],
        flat: rgb`#9966CC`,
    },
    darkgray: {
        acs_code: 'u',
        aliases: ["DarkGrey", "Dark Gray", "Dark Grey"],
        normal: [[0, 256, rgb`#232323`, rgb`#8B8B8B`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#646464`],
            [128, 256, rgb`#404040`, rgb`#B4B4B4`],
        ],
        flat: rgb`#808080`,
    },
    cyan: {
        acs_code: 'v',
        normal: [[0, 256, rgb`#001F1F`, rgb`#00F0F0`]],
        console: [
            [0, 127, rgb`#000000`, rgb`#007F7F`],
            [128, 256, rgb`#00FFFF`, rgb`#FEFFFF`],
        ],
        flat: rgb`#00DDDD`,
    },
    ice: {
        acs_code: 'w',
        normal: [
            [0, 94, rgb`#343450`, rgb`#7C7C98`],
            [95, 256, rgb`#7C7C98`, rgb`#E0E0E0`],
        ],
        console: [
            [0, 127, rgb`#343450`, rgb`#7C7C98`],
            [128, 256, rgb`#7C7C98`, rgb`#E0E0E0`],
        ],
        flat: rgb`#7C7C98`,
    },
    fire: {
        acs_code: 'x',
        normal: [
            [0, 104, rgb`#660000`, rgb`#D57604`],
            [105, 256, rgb`#D57604`, rgb`#FFFF00`],
        ],
        console: [
            [0, 127, rgb`#6F0000`, rgb`#D57604`],
            [128, 256, rgb`#D57604`, rgb`#FFFF00`],
        ],
        flat: rgb`#D57604`,
    },
    sapphire: {
        acs_code: 'y',
        normal: [
            [0, 94, rgb`#000468`, rgb`#506CFC`],
            [95, 256, rgb`#506CFC`, rgb`#50ECFC`],
        ],
        console: [
            [0, 127, rgb`#000468`, rgb`#506CFC`],
            [128, 256, rgb`#506CFC`, rgb`#50ECFC`],
        ],
        flat: rgb`#506CFC`,
    },
    teal: {
        acs_code: 'z',
        normal: [
            [0, 90, rgb`#001F1F`, rgb`#236773`],
            [91, 256, rgb`#236773`, rgb`#7BB3C3`],
        ],
        console: [
            [0, 127, rgb`#001F1F`, rgb`#236773`],
            [128, 256, rgb`#236773`, rgb`#7BB3C3`],
        ],
        flat: rgb`#236773`,
    },
    // TODO also some special ones: - + * something
};
const TRANSLATION_ACS_INDEX = {
    l: null,
};
for (let [name, trans] of Object.entries(ZDOOM_TRANSLATIONS)) {
    TRANSLATION_ACS_INDEX[trans.acs_code] = name;
}


const SAMPLE_MESSAGES = [
    // Doom 1
    "please don't leave, there's more\ndemons to toast!",
    "let's beat it -- this is turning\ninto a bloodbath!",
    "i wouldn't leave if i were you.\ndos is much worse.",
    "you're trying to say you like dos\nbetter than me, right?",
    "don't leave yet -- there's a\ndemon around that corner!",
    "ya know, next time you come in here\ni'm gonna toast ya.",
    "go ahead and leave. see if i care.",

    // Doom II
    "you want to quit?\nthen, thou hast lost an eighth!",
    "don't go now, there's a \ndimensional shambler waiting\nat the dos prompt!",
    "get outta here and go back\nto your boring programs.",
    "if i were your boss, i'd \n deathmatch ya in a minute!",
    "look, bud. you leave now\nand you forfeit your body count!",
    "just leave. when you come\nback, i'll be waiting with a bat.",
    "you're lucky i don't smack\nyou for thinking about leaving.",

    // Strife
    "where are you going?!\nwhat about the rebellion?",
    "carnage interruptus...\nwhat a tease!",
    "but you're the hope\n-- my only chance!!",
    "nobody walks out on blackbird.",
    "i thought you were different...",
    "fine! just kill and run!",
    "you can quit...\nbut you can't hide...",
    "whaaa, what's the matter?\nmommy says dinnertime?",

    // Chex
    "Don't quit now, there are still\nflemoids on the loose!",
    "Don't give up -- the flemoids will\nget the upper hand!",
    "Don't leave now.\nWe need your help!",
    "I hope you're just taking a\nbreak for Chex(R) party mix.",
    "Don't quit now!\nWe need your help!",
    "Don't abandon the\nIntergalactic Federation of Cereals!",
    "The real Chex(R) Warrior\nwouldn't give up so fast!",

    // Pangrams
    "The quick brown fox jumps over the lazy dog.",
    "Jived fox nymph grabs quick waltz.",
    "Glib jocks quiz nymph to vex dwarf.",
    "Sphinx of black quartz, judge my vow.",
    "How vexingly quick daft zebras jump!",
    "The five boxing wizards jump quickly.",
    "Pack my box with five dozen liquor jugs.",
    "Jackdaws love my big sphynx of quartz.",
    "Cwm fjord bank glyphs vext quiz.",
];

// This size should be big enough to fit any character!
// FIXME could just auto resize when it's too small
const TRANS_WIDTH = 32;
const TRANS_HEIGHT = 32;
let trans_canvas = mk('canvas', {width: TRANS_WIDTH, height: TRANS_HEIGHT});
let font_images = {};

class BossBrain {
    constructor() {
        // Visible canvas on the actual page
        this.final_canvas = document.querySelector('canvas');
        // Canvas we do most of our drawing to, at 1x
        this.buffer_canvas = mk('canvas');

        this.font_images = {}  // fontname => source image

        this.form = document.querySelector('form');

        this.init_form();
    }

    async init() {
        let load_promises = [];
        for (let [fontname, fontdef] of Object.entries(DOOM_FONTS)) {
            let img = new Image;
            img.src = fontdef.image;
            font_images[fontname] = img;
            load_promises.push(img.decode());
            //document.body.append(img);
        }

        await Promise.all(load_promises);


        // TODO read fragment

        let list = document.querySelector('#js-font-list');
        for (let [ident, fontdef] of Object.entries(DOOM_FONTS)) {
            // TODO pop open a lil info overlay for each of these
            this.render_text({
                text: "Hello, world!",
                default_font: ident,
                scale: 2,
            });
            let name_canvas = mk('canvas', {width: this.final_canvas.width, height: this.final_canvas.height});
            name_canvas.getContext('2d').drawImage(this.final_canvas, 0, 0);

            let glyphs = DOOM_FONTS[ident].glyphs;
            let li = mk('li',
                mk('label',
                    mk('input', {type: 'radio', name: 'font', value: ident}),
                    " ",
                    fontdef.meta.name,
                    mk('br'),
                    name_canvas,
                ),
            );
            list.append(li);
        }

        if (! this.form.elements['font'].value) {
            this.form.elements['font'].value = 'doom-small';
        }
    }

    async init_form() {
        await this.init();

        this.form.addEventListener('submit', ev => {
            ev.preventDefault();
        });
        let canvas_wrapper = document.getElementById('canvas-wrapper');

        let textarea = this.form.elements['text'];
        // If the textarea is blank (which may not be the case if browser
        // navigation restored previously-typed text!), populate it.
        // FIXME but then you're stuck on the same one.  also it should use the matching font!
        if (textarea.value === "") {
            textarea.value = SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)];
        }
        let redraw_handler = this.redraw_current_text.bind(this);
        textarea.addEventListener('input', redraw_handler);

        // Font
        let font_ctl = this.form.elements['font'];
        document.querySelector('#js-font-list').addEventListener('change', ev => {
            this.form.classList.toggle('using-console-font', font_ctl.value === 'zdoom-console');
            this.redraw_current_text();
        });
        this.form.classList.toggle('using-console-font', font_ctl.value === 'zdoom-console');

        // Scale
        let scale_ctl = this.form.elements['scale'];
        function update_scale_label() {
            scale_ctl.parentNode.querySelector('output').textContent = `${scale_ctl.value}×`;
        }
        scale_ctl.addEventListener('input', ev => {
            update_scale_label();
            this.redraw_current_text();
        });
        update_scale_label();

        // Kerning
        let kerning_ctl = this.form.elements['kerning'];
        function update_kerning_label() {
            kerning_ctl.parentNode.querySelector('output').textContent = String(kerning_ctl.value);
        }
        kerning_ctl.addEventListener('input', ev => {
            update_kerning_label();
            this.redraw_current_text();
        });
        update_kerning_label();

        // Alignment
        let alignment_list = this.form.querySelector('ul.alignment');
        alignment_list.addEventListener('change', redraw_handler);

        // Syntax
        let syntax_list = this.form.querySelector('ul.syntax');
        syntax_list.addEventListener('change', redraw_handler);

        // Page properties
        let bg_ctl = this.form.elements['bg'];
        let bgcolor_ctl = this.form.elements['bgcolor'];
        function set_background(bgcolor) {
            if (bgcolor === null) {
                bg_ctl.checked = false;
                bgcolor_ctl.disabled = true;
            }
            else {
                bg_ctl.checked = true;
                bgcolor_ctl.disabled = false;
                bgcolor_ctl.value = bgcolor;
            }
            update_background();
            this.redraw_current_text();
        }
        function update_background() {
            if (bg_ctl.checked) {
                canvas_wrapper.style.backgroundColor = bgcolor_ctl.value;
            }
            else {
                canvas_wrapper.style.backgroundColor = 'transparent';
            }
        }
        bg_ctl.addEventListener('click', ev => {
            bgcolor_ctl.disabled = ! bg_ctl.checked;
            update_background();
            this.redraw_current_text();
        });
        bgcolor_ctl.addEventListener('input', ev => {
            set_background(bgcolor_ctl.value);
        });
        bgcolor_ctl.disabled = ! bg_ctl.checked;
        update_background();

        // Translations
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
        let trans_list = this.form.querySelector('.translations');
        for (let [name, trans] of Object.entries(ZDOOM_TRANSLATIONS)) {
            let normal_example = mk('div.translation-example.-normal');
            normal_example.style.backgroundImage = translation_to_gradient(trans.normal);
            let console_example = mk('div.translation-example.-console');
            console_example.style.backgroundImage = translation_to_gradient(trans.console);

            trans_list.append(mk('li', mk('label',
                mk('input', {name: 'translation', type: 'radio', value: name}),
                normal_example,
                console_example,
                mk('span.name', name),
                mk('span.acs-escape', '\\c' + trans.acs_code),
                mk('button', {type: 'button', style: `background: ${trans.flat.hex}`, 'data-hex': trans.flat.hex}),
            )));
        }
        trans_list.addEventListener('change', redraw_handler);
        // Catch button clicks
        trans_list.addEventListener('click', ev => {
            if (ev.target.tagName !== 'BUTTON')
                return;

            set_background(ev.target.getAttribute('data-hex'));
        });

        // Fonts were already loaded by init() so we are good to go
        this.redraw_current_text();

        function handle_radioset(ev) {
            let ul = ev.target.closest('ul.radioset');
            for (let li of ul.querySelectorAll('li.selected')) {
                li.classList.remove('selected');
            }
            ev.target.closest('ul.radioset > li').classList.add('selected');
        }
        for (let ul of document.querySelectorAll('ul.radioset')) {
            ul.addEventListener('change', handle_radioset);

            // Highlight whatever's selected /now/
            for (let radio of ul.querySelectorAll('input[type=radio]')) {
                if (radio.checked) {
                    radio.closest('ul.radioset > li').classList.add('selected');
                }
            }
        }
    }

    redraw_current_text() {
        let elements = this.form.elements;
        this.render_text({
            text: elements['text'].value,
            syntax: elements['syntax'].value,
            scale: elements['scale'].value,
            kerning: parseInt(elements['kerning'].value, 10),
            default_font: elements['font'].value,
            default_translation: elements['translation'].value || null,
            alignment: elements['align'].value,
            background: elements['bg'].checked ? elements['bgcolor'].value : null,
        });

        let data = new FormData(this.form);
        history.replaceState(null, document.title, '#' + new URLSearchParams(data));
    }

    render_text(args) {
        let text = args.text;
        let syntax = args.syntax;
        if (syntax !== 'acs') {
            syntax = 'none';
        }
        let scale = args.scale || 1;
        let kerning = args.kerning || 0;
        let default_font = args.default_font || 'doom-small';
        let default_translation = args.default_translation || null;
        let alignment = args.alignment;
        if (alignment === null || alignment === undefined) {
            alignment = 0.5;
        }
        let background = args.background;

        if (syntax === 'acs') {
            text = text.replace(/\\\n/g, "").replace(/\\n/g, "\n");
        }

        let lines = text.split('\n');

        let font = DOOM_FONTS[default_font];
        // XXX handle error?

        // Compute some layout metrics first
        let draws = [];
        let line_stats = [];
        let y = 0;
        for (let [l, line] of lines.entries()) {
            // Note: with ACS, the color reverts at the end of every line
            let translation = default_translation;
            let x = 0;
            // TODO line height may need adjustment if there's a character that extends above the top of the line
            // TODO options for this?

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
                    // TODO doesn't support "untranslated"
                    translation = match[1].toLowerCase().replace(/ /g, '').replace(/grey/g, 'gray');
                    if (ZDOOM_TRANSLATIONS[translation] === undefined) {
                        // TODO warn?
                        translation = null;
                    }
                    continue;
                }
                else if (match[2] !== undefined) {
                    // ACS translation code
                    translation = TRANSLATION_ACS_INDEX[match[2]];
                    continue;
                }
                else if (match[3] !== undefined) {
                    // Octal escape
                    ch = String.fromCharCode(parseInt(match[3], 8));
                }
                else if (match[4] !== undefined) {
                    // Hex escape
                    ch = String.fromCharCode(parseInt(match[4], 16));
                }
                else if (match[5] !== undefined) {
                    // Literal escape (\\ or \")
                    ch = match[5];
                }

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

                draws.push({
                    glyph: glyph,
                    lineno: l,
                    x: x,
                    translation: translation,
                });

                x += glyph.width;
            }

            line_stats.push({
                width: x,
                x0: 0,  // updated below
                y0: y,
            });

            y += font.line_height;
        }

        // Resize the canvas to fit snugly
        let canvas_width = Math.max(...Object.values(line_stats).map(line_stat => line_stat.width));
        let canvas_height = y;
        this.buffer_canvas.width = canvas_width;
        this.buffer_canvas.height = canvas_height;
        this.final_canvas.width = canvas_width * scale;
        this.final_canvas.height = canvas_height * scale;
        if (canvas_width === 0 || canvas_height === 0) {
            return;
        }

        // Align text horizontally
        if (alignment > 0) {
            for (let line_stat of line_stats) {
                line_stat.x0 = Math.floor((canvas_width - line_stat.width) * alignment);
            }
        }

        // And draw!
        let ctx = this.buffer_canvas.getContext('2d');
        for (let draw of draws) {
            let line_stat = line_stats[draw.lineno];
            let glyph = draw.glyph;
            let px = line_stat.x0 + (glyph.dx || 0) + draw.x;
            let py = line_stat.y0 + (glyph.dy || 0);
            if (draw.translation) {
                console.log(draw.translation);
                // Argh, we need to translate
                let transdef = ZDOOM_TRANSLATIONS[draw.translation];
                let trans = default_font === 'zdoom-console' ? transdef.console : transdef.normal;
                // First draw the character to the dummy canvas -- note we can't
                // draw it to this canvas and then alter it, because negative
                // kerning might make it overlap an existing character we shouldn't
                // be translating
                let trans_ctx = trans_canvas.getContext('2d');
                trans_ctx.clearRect(0, 0, glyph.width, glyph.height);
                trans_ctx.drawImage(
                    font_images[default_font],
                    glyph.x, glyph.y, glyph.width, glyph.height,
                    0, 0, glyph.width, glyph.height);

                // Now translate it in place
                let imagedata = trans_ctx.getImageData(0, 0, glyph.width, glyph.height);
                let pixels = imagedata.data;
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i + 3] === 0)
                        continue;

                    // FIXME these are...  part of the font definition i guess?
                    let lightness = (pixels[i + 0] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
                    lightness = (lightness - font.lightness_range[0]) / (font.lightness_range[1] - font.lightness_range[0]);
                    let l = Math.max(0, Math.min(255, Math.floor(lightness * 256)));
                    //console.log(pixels[i], pixels[i+1], pixels[i+2], lightness, l);
                    for (let span of trans) {
                        if (span[0] <= l && l <= span[1]) {
                            let t = Math.floor(256 * (l - span[0]) / (span[1] - span[0]));
                            let c0 = span[2];
                            let c1 = span[3];
                            pixels[i + 0] = c0[0] + Math.floor((c1[0] - c0[0]) * t / 256);
                            pixels[i + 1] = c0[1] + Math.floor((c1[1] - c0[1]) * t / 256);
                            pixels[i + 2] = c0[2] + Math.floor((c1[2] - c0[2]) * t / 256);
                            //console.log("...", t, c0, c1, pixels[i], pixels[i+1], pixels[i+2]);
                            break;
                        }
                    }
                }
                trans_ctx.putImageData(imagedata, 0, 0);

                // Finally blit it onto the final canvas.  Note that we do NOT put
                // the image data directly, since that overwrites rather than
                // compositing
                ctx.drawImage(
                    trans_canvas,
                    0, 0, glyph.width, glyph.height,
                    px, py, glyph.width, glyph.height);
            }
            else {
                // Simple case: no translation is a straight blit
                ctx.drawImage(
                    font_images[default_font],
                    glyph.x, glyph.y, glyph.width, glyph.height,
                    px, py, glyph.width, glyph.height);
            }
        }

        // Finally, scale up the offscreen canvas
        let final_ctx = this.final_canvas.getContext('2d');
        let aabb = [0, 0, this.final_canvas.width, this.final_canvas.height];
        if (background) {
            final_ctx.fillStyle = background;
            final_ctx.fillRect(...aabb);
        }
        else {
            final_ctx.clearRect(...aabb);
        }
        final_ctx.imageSmoothingEnabled = false;
        final_ctx.drawImage(this.buffer_canvas, ...aabb);
    }
}

window.addEventListener('load', ev => {
    window._icon_of_sin = new BossBrain;
});
