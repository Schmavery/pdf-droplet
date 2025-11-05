# PDF Droplet

I couldn't find a PDF viewer that would show me the object level data. This uses internal PDFjs APIs to do the parsing/rendering.

# TODO

- better support for struct tree stuff, maybe an alternative tree view vs the object list??
- toggle/edit drawing commands, see the change visually
- load all images upfront to display in detail view
- object list filtering options (image, font, xobj, struct tree elems, objstm)
- parse & display font file information from binary stream
- link MCIDs in content streams to their elems
- ???

# Thanks to

- [PDFjs](https://mozilla.github.io/pdf.js/) for PDF code
- [FontDrop!](https://fontdrop.info/) for inspiration
