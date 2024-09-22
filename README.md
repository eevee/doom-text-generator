# Doom Text Generator

This is my Doom text generator.  It generates Doom text.  It has several built-in fonts, and it can read most Doom-ecosystem font formats from WADs or PK3s.  It also supports ZDoom-like color translations for recoloring text.

You probably want to use it via its hosted form: https://c.eev.ee/doom-text-generator/

You are, of course, also free to grab the source code and run it locally, but note that due to browser restrictions, it ***will not*** run from a `file:///` URL.  You will need a tiny HTTP server, like the one that ships with Python, which can be run with `python -m http.server` (with an optional port).

Most of the included fonts are commercial works extracted from commercial products, and I do not have permission to use them beyond the general air of quietly-tolerated remix culture in the Doom community and the fact that vanilla Doom requires a level graphic.  C'est la vie.


## Technical stuff

I originally wrote this in a single day as an advent calendar idea, so the original iteration (`doom-font-to-montage.py`) is a hot mess of Python and ImageMagick.

I later improved on this somewhat:

- The frontend can now read WADs, PK3s, and most notably FON2s, so I can ship FON2s directly and skip montaging them.

- I wrote a new Python parser (`doom-font-to-montage2.py`) that sucks less and uses Pillow instead of shelling out to the most godawful ImageMagick incantations you've ever seen in your life.

- I guess I'm maintaining two versions of every parser now but that's fine.

It's still fairly simple and straightforward: parse, lay out text, blit a lot.
