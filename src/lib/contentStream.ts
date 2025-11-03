// Note: heavily gpted

export type NumberVal = { type: "number"; value: number };
export type BoolVal = { type: "bool"; value: boolean };
export type NullVal = { type: "null" };
export type NameVal = { type: "name"; name: string }; // /Something
export type StringVal = { type: "string"; value: string }; // ( ... )
export type HexVal = { type: "hex"; bytes: Uint8Array }; // < ... >
export type ArrayVal = { type: "array"; contents: ArgVal[] }; // [ ... ]
export type DictVal = { type: "dict"; entries: Record<string, ArgVal> }; // << /K V ... >>
export type BytesVal = { type: "bytes"; bytes: Uint8Array }; // raw segment (e.g., inline image data)

export type ArgVal =
  | NumberVal
  | BoolVal
  | NullVal
  | NameVal
  | StringVal
  | HexVal
  | ArrayVal
  | DictVal
  | BytesVal;

// internal token types
type KwToken = { kind: "kw"; value: string }; // bare keyword, often an operator
type OpToken = { kind: "op"; op: string }; // forced operator (BI/ID/EI handling)
type ImgToken = { kind: "img"; data: Uint8Array }; // inline image raw bytes
type ValToken = { kind: "val"; value: ArgVal };
type Token = KwToken | OpToken | ImgToken | ValToken;
type DocEntry = {
  doc: string;
  detail?: string;
  args?: string[];
  type:
    | "path"
    | "paint"
    | "color"
    | "state"
    | "text"
    | "showtext"
    | "image"
    | "markedcontent";
};
export type OpTypes = DocEntry["type"];

export type ParsedOp = { indent: number; op: string; args: ArgVal[] };

/** Parse a (decompressed) PDF content stream into ops with indentation. */
export function parseContentStream(bytes: Uint8Array): ParsedOp[] {
  const tokens = tokenize(bytes);
  const ops = toOps(tokens);
  return withIndent(ops);
}

export function getOpDoc(op: string): (typeof OP_DOCS)[string] | null {
  return OP_DOCS[op] ?? null;
}

/** Print ArgVal as compact, one-line text. */
export function printArgVal(v: ArgVal): string {
  switch (v.type) {
    case "number":
      return String(v.value);
    case "bool":
      return v.value ? "true" : "false";
    case "null":
      return "null";
    case "name":
      return `/${v.name}`;
    case "string":
      return `(${v.value})`;
    case "hex":
      return `<${toHex(v.bytes)}>`;
    case "bytes":
      return `<${v.bytes.length} bytes>`;
    case "array":
      return `[${v.contents.map(printArgVal).join(", ")}]`;
    case "dict": {
      const parts = Object.entries(v.entries).map(
        ([k, val]) => `/${k} ${printArgVal(val)}`
      );
      return `<< ${parts.join(" ")} >>`;
    }
  }
}

const OP_DOCS: Record<string, DocEntry> = {
  // marked content
  BMC: { type: "markedcontent", doc: "begin marked content", args: ["name"] },
  BDC: {
    type: "markedcontent",
    doc: "begin marked content",
    args: ["tag", "properties"],
  },
  EMC: { type: "markedcontent", doc: "end marked content" },
  DP: {
    type: "state",
    doc: "define marked content point",
    args: ["tag", "properties"],
  },
  MP: { type: "state", doc: "marked content point", args: ["name"] },
  // graphics state
  q: { type: "state", doc: "push graphics state" },
  Q: { type: "state", doc: "pop graphics state" },
  cm: {
    type: "state",
    doc: "concat matrix",
    args: ["a", "b", "c", "d", "e", "f"],
    detail:
      "Concatenate specified matrix to current transformation matrix. Matrix is [a b 0] [c d 0] [e f 1]",
  },
  w: { type: "state", doc: "set line width" },
  J: { type: "state", doc: "set line cap" },
  j: { type: "state", doc: "set line join" },
  M: { type: "state", doc: "set miter limit" },
  d: {
    type: "state",
    doc: "set stroke dash pattern",
    args: ["pattern array", "offset"],
  },
  ri: { type: "state", doc: "set rendering intent" },
  i: { type: "state", doc: "set flatness" },
  gs: { type: "state", doc: "set ExtGState " },
  // color
  CS: { type: "color", doc: "set stroke color space" },
  cs: { type: "color", doc: "set fill color space" },
  SC: { type: "color", doc: "set stroke color (per CS)" },
  sc: { type: "color", doc: "set fill color (per cs)" },
  SCN: { type: "color", doc: "set stroke color (pattern/ICCBased)" },
  scn: { type: "color", doc: "set fill color (pattern/ICCBased)" },
  G: { type: "color", doc: "set stroke gray" },
  g: { type: "color", doc: "set fill gray" },
  RG: { type: "color", doc: "set stroke RGB" },
  rg: { type: "color", doc: "set fill RGB" },
  K: { type: "color", doc: "set stroke CMYK" },
  k: { type: "color", doc: "set fill CMYK" },
  // paths
  m: { type: "path", doc: "move to", args: ["x", "y"] },
  l: { type: "path", doc: "line to", args: ["x", "y"] },
  c: {
    type: "path",
    doc: "curve to",
    args: ["x1", "y1", "x2", "y2", "x3", "y3"],
  },
  v: {
    type: "path",
    doc: "curve (copy first control)",
    args: ["x2", "y2", "x3", "y3"],
  },
  y: {
    type: "path",
    doc: "curve (copy second control)",
    args: ["x1", "y1", "x3", "y3"],
  },
  h: { type: "path", doc: "close subpath" },
  re: {
    type: "path",
    doc: "rectangle",
    args: ["x", "y", "width", "height"],
  },
  S: { type: "paint", doc: "stroke" },
  s: { type: "paint", doc: "close & stroke" },
  f: { type: "paint", doc: "fill", detail: "Non-zero" },
  "f*": { type: "paint", doc: "fill", detail: "Even-odd" },
  B: { type: "paint", doc: "fill, then stroke", detail: "Fill is non-zero" },
  "B*": { type: "paint", doc: "fill, then stroke", detail: "Fill is even-odd" },
  b: { type: "paint", doc: "close, fill, stroke", detail: "Fill is non-zero" },
  "b*": {
    type: "paint",
    doc: "close, fill (EO), stroke",
    detail: "Fill is even-odd",
  },
  n: {
    type: "paint",
    doc: "end path, no paint",
    detail: "Used after W / W* operators to establish the new clipping path.",
  },
  W: { type: "paint", doc: "set clip", detail: "Non-zero" },
  "W*": { type: "paint", doc: "set clip", detail: "Even-odd" },
  // text
  BT: { type: "text", doc: "begin text object" },
  ET: { type: "text", doc: "end text object" },
  Tc: { type: "text", doc: "set char spacing" },
  Tw: { type: "text", doc: "set word spacing" },
  Tz: { type: "text", doc: "set horiz scaling %" },
  TL: { type: "text", doc: "set leading" },
  Tr: {
    type: "text",
    doc: "set text render mode",
    detail:
      "0: fill, 1: stroke, 2: fill then stroke, 3: invisible, 4-7: clipping",
  },
  Ts: {
    type: "text",
    doc: "set rise",
    detail: "Relative to baseline, used for superscripts or subscripts",
  },
  Td: { type: "text", doc: "set text position", args: ["x", "y"] },
  TD: {
    type: "text",
    doc: "set text pos & leading",
    args: ["x", "y"],
    detail: "TD is equivalent to: -y TL x y Td",
  },
  Tm: {
    type: "text",
    doc: "set text matrix",
    args: ["a", "b", "c", "d", "e", "f"],
    detail: "Based on the text transformation matrix [a b 0] [c d 0] [e f 1]",
  },
  "T*": { type: "text", doc: "move to next line" },
  Tf: { type: "text", doc: "set font", args: ["name", "size"] },
  Tj: { type: "showtext", doc: "show text" },
  TJ: {
    type: "showtext",
    doc: "show text",
    detail: "Array of strings and kerning numbers",
  },
  "'": {
    type: "showtext",
    doc: "next line + show",
    detail: "Equivalent to T* followed by Tj",
  },
  '"': {
    type: "showtext",
    doc: "set word/char space + show",
    args: ["wordSpace", "charSpace"],
  },
  // XObjects / images / shadings
  Do: { type: "image", doc: "invoke XObject by name" },
  BI: { type: "image", doc: "begin inline image" },
  ID: { type: "image", doc: "begin inline image data" },
  EI: { type: "image", doc: "end inline image" },
  sh: { type: "image", doc: "paint shading by name" },
  // Type3
  d0: { type: "text", doc: "glyph width (Type3)" },
  d1: { type: "text", doc: "glyph width & bbox (Type3)" },
};

// indentation based on these scopes
const OP_OPEN = new Set(["q", "BT", "BDC", "BMC"]);
const OP_CLOSE = new Set(["Q", "ET", "EMC"]);

function withIndent(
  raw: { op: string; args: ArgVal[]; imgLen?: number }[]
): ParsedOp[] {
  let depth = 0;
  const out: ParsedOp[] = [];
  for (const r of raw) {
    if (OP_CLOSE.has(r.op)) depth = Math.max(0, depth - 1);
    out.push({ indent: depth, op: r.op, args: r.args });
    if (OP_OPEN.has(r.op)) depth++;
  }
  return out;
}

const W0 = 0x00,
  TAB = 0x09,
  LF = 0x0a,
  FF = 0x0c,
  CR = 0x0d,
  SP = 0x20;
const SLASH = 0x2f,
  PCT = 0x25,
  LPAR = 0x28,
  RPAR = 0x29,
  LBRKT = 0x5b,
  RBRKT = 0x5d;
const LT = 0x3c,
  GT = 0x3e;

function isWhite(b: number): boolean {
  return b === W0 || b === TAB || b === LF || b === FF || b === CR || b === SP;
}

function isDelim(b: number): boolean {
  return (
    b === LPAR ||
    b === RPAR ||
    b === LT ||
    b === GT ||
    b === LBRKT ||
    b === RBRKT ||
    b === SLASH ||
    b === PCT
  );
}

function bytesToLatin1(bytes: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

function readNumberOrWord(bytes: Uint8Array, i: number): [string, number] {
  const start = i;
  while (i < bytes.length && !isWhite(bytes[i]) && !isDelim(bytes[i])) i++;
  return [bytesToLatin1(bytes, start, i), i];
}

function readName(bytes: Uint8Array, i: number): [NameVal, number] {
  // assumes '/'
  i++;
  const start = i;
  while (i < bytes.length && !isWhite(bytes[i]) && !isDelim(bytes[i])) i++;
  const raw = bytesToLatin1(bytes, start, i);
  const decoded = raw.replace(/#([0-9A-Fa-f]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
  return [{ type: "name", name: decoded }, i];
}

function readLiteralString(bytes: Uint8Array, i: number): [StringVal, number] {
  // assumes '('
  i++;
  let depth = 1,
    out = "";
  while (i < bytes.length && depth > 0) {
    const c = bytes[i++];
    if (c === 0x5c) {
      // backslash
      const n = bytes[i++];
      if (n === undefined) break;
      out += "\\" + String.fromCharCode(n); // keep visible
    } else if (c === LPAR) {
      depth++;
      out += "(";
    } else if (c === RPAR) {
      depth--;
      if (depth > 0) out += ")";
    } else out += String.fromCharCode(c);
  }
  return [{ type: "string", value: out }, i];
}

function readHexString(bytes: Uint8Array, i: number): [HexVal, number] {
  // assumes '<' but not '<<'
  i++;
  let hex = "";
  while (i < bytes.length && bytes[i] !== GT) {
    if (!isWhite(bytes[i])) hex += String.fromCharCode(bytes[i]);
    i++;
  }
  if (i < bytes.length && bytes[i] === GT) i++;
  if (hex.length % 2 === 1) hex += "0";
  const out = new Uint8Array(hex.length / 2);
  for (let k = 0; k < out.length; k++) {
    out[k] = parseInt(hex.substr(2 * k, 2), 16) || 0;
  }
  return [{ type: "hex", bytes: out }, i];
}

function readArray(bytes: Uint8Array, i: number): [ArrayVal, number] {
  i++; // skip '['
  const items: ArgVal[] = [];
  while (i < bytes.length) {
    i = skipWS(bytes, i);
    if (bytes[i] === RBRKT) {
      i++;
      break;
    }
    const [val, j] = readObject(bytes, i);
    items.push(val);
    i = j;
  }
  return [{ type: "array", contents: items }, i];
}

function readDict(bytes: Uint8Array, i: number): [DictVal, number] {
  i += 2; // skip '<<'
  const entries: Record<string, ArgVal> = {};
  while (i < bytes.length) {
    i = skipWS(bytes, i);
    if (bytes[i] === GT && bytes[i + 1] === GT) {
      i += 2;
      break;
    }
    const [k, j1] = readName(bytes, i);
    i = skipWS(bytes, j1);
    const [v, j2] = readObject(bytes, i);
    entries[k.name] = v;
    i = j2;
  }
  return [{ type: "dict", entries }, i];
}

function skipWS(bytes: Uint8Array, i: number): number {
  while (i < bytes.length) {
    if (isWhite(bytes[i])) {
      i++;
      continue;
    }
    if (bytes[i] === PCT) {
      // comment
      while (i < bytes.length && bytes[i] !== LF && bytes[i] !== CR) i++;
      continue;
    }
    break;
  }
  return i;
}

function readObject(bytes: Uint8Array, i: number): [ArgVal, number] {
  i = skipWS(bytes, i);
  const c = bytes[i];
  if (c === SLASH) return readName(bytes, i);
  if (c === LPAR) return readLiteralString(bytes, i);
  if (c === LT) {
    if (bytes[i + 1] === LT) return readDict(bytes, i);
    return readHexString(bytes, i);
  }
  if (c === LBRKT) return readArray(bytes, i);

  // word: number | true | false | null | keyword
  const [word, j] = readNumberOrWord(bytes, i);
  if (/^[+-]?\d+(\.\d+)?$/.test(word))
    return [{ type: "number", value: parseFloat(word) }, j];
  if (word === "true") return [{ type: "bool", value: true }, j];
  if (word === "false") return [{ type: "bool", value: false }, j];
  if (word === "null") return [{ type: "null" }, j];
  // Otherwise, treat as bare keyword token (operator candidate)
  return [{ type: "string", value: word } as StringVal, j]; // will be rewrapped as KwToken later
}

function tokenize(bytes: Uint8Array): Token[] {
  const toks: Token[] = [];
  let i = 0;

  function findInlineImageEnd(
    idx: number
  ): { start: number; end: number } | null {
    // Look for EI delimited by whitespace or delimiter
    for (let k = idx + 1; k < bytes.length - 2; k++) {
      if (bytes[k] === 0x45 && bytes[k + 1] === 0x49) {
        // 'E''I'
        const before = bytes[k - 1],
          after = bytes[k + 2];
        if (isWhite(before) && (isWhite(after) || isDelim(after))) {
          return { start: k, end: k + 2 };
        }
      }
    }
    return null;
  }

  while (i < bytes.length) {
    i = skipWS(bytes, i);
    if (i >= bytes.length) break;

    // Peek for BI
    const save = i;
    const [maybe, j] = readNumberOrWord(bytes, i);
    i = j;
    if (maybe === "BI") {
      toks.push({ kind: "op", op: "BI" });
      // Read inline image dict: sequence of name-like keys / values until ID
      while (true) {
        i = skipWS(bytes, i);
        const [w, j2] = readNumberOrWord(bytes, i);
        i = j2;
        if (w === "ID") {
          toks.push({ kind: "op", op: "ID" });
          break;
        }
        // In BI dict, keys are bare words (not "/Key")
        const key = w;
        const [val, j3] = readObject(bytes, i);
        i = j3;
        // we encode as a dict entry by pushing artificial pair tokens:
        toks.push({ kind: "val", value: { type: "name", name: key } });
        toks.push({ kind: "val", value: val });
      }
      // After ID, exactly one whitespace char, then raw data until EI
      if (!isWhite(bytes[i]))
        throw new Error("Expected 1 whitespace byte after ID");
      i++;
      const end = findInlineImageEnd(i);
      if (!end) throw new Error("Inline image: EI not found");
      const data = bytes.slice(i, end.start);
      toks.push({ kind: "img", data });
      i = end.end;
      toks.push({ kind: "op", op: "EI" });
      continue;
    }

    // Not BI; rewind and read a generic object/token
    i = save;
    const c = bytes[i];
    if (c === SLASH) {
      const [v, jn] = readName(bytes, i);
      toks.push({ kind: "val", value: v });
      i = jn;
      continue;
    }
    if (c === LPAR) {
      const [v, jn] = readLiteralString(bytes, i);
      toks.push({ kind: "val", value: v });
      i = jn;
      continue;
    }
    if (c === LT) {
      if (bytes[i + 1] === LT) {
        const [v, jn] = readDict(bytes, i);
        toks.push({ kind: "val", value: v });
        i = jn;
        continue;
      } else {
        const [v, jn] = readHexString(bytes, i);
        toks.push({ kind: "val", value: v });
        i = jn;
        continue;
      }
    }
    if (c === LBRKT) {
      const [v, jn] = readArray(bytes, i);
      toks.push({ kind: "val", value: v });
      i = jn;
      continue;
    }

    // word: could be number/bool/null/keyword
    const [word, jn] = readNumberOrWord(bytes, i);
    i = jn;
    if (/^[+-]?\d+(\.\d+)?$/.test(word)) {
      toks.push({
        kind: "val",
        value: { type: "number", value: parseFloat(word) },
      });
    } else if (word === "true") {
      toks.push({ kind: "val", value: { type: "bool", value: true } });
    } else if (word === "false") {
      toks.push({ kind: "val", value: { type: "bool", value: false } });
    } else if (word === "null") {
      toks.push({ kind: "val", value: { type: "null" } });
    } else {
      toks.push({ kind: "kw", value: word });
    }
  }

  return toks;
}

// --- Postfix to ops ---------------------------------------------------------

function looksLikeOperator(s: string): boolean {
  // Prefer known ops, otherwise fall back to "PDF-ish" 1–4 char words (incl. * ' ")
  return !!OP_DOCS[s] || /^[A-Za-z*'"]{1,4}$/.test(s);
}

function toOps(
  tokens: Token[]
): { op: string; args: ArgVal[]; imgLen?: number }[] {
  const out: { op: string; args: ArgVal[]; imgLen?: number }[] = [];
  const stack: ArgVal[] = [];

  // We’ll scan with index to detect BI sub-sequences
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.kind === "op" && t.op === "BI") {
      // Immediately after BI, we expect a series of (name,val) ValTokens up to an "ID" op
      const dictStart = i + 1;
      let j = dictStart;
      const dictEntries: Record<string, ArgVal> = {};
      while (
        j < tokens.length &&
        !(tokens[j].kind === "op" && (tokens[j] as OpToken).op === "ID")
      ) {
        const k1 = tokens[j] as ValToken;
        const k2 = tokens[j + 1] as ValToken;
        if (
          !k1 ||
          !k2 ||
          k1.kind !== "val" ||
          k2.kind !== "val" ||
          k1.value.type !== "name"
        )
          break;
        dictEntries[k1.value.name] = k2.value;
        j += 2;
      }
      // push BI with dict args
      out.push({ op: "BI", args: [{ type: "dict", entries: dictEntries }] });
      // skip ahead to ID
      i = j - 1;
      continue;
    }

    if (t.kind === "op" && t.op === "ID") {
      // Next should be ImgToken
      const dataTok = tokens[i + 1];
      if (dataTok && dataTok.kind === "img") {
        const bytes = (dataTok as ImgToken).data;
        out.push({ op: "ID", args: [{ type: "bytes", bytes }] });
        i++; // skip the img token
        continue;
      } else {
        out.push({ op: "ID", args: [] });
        continue;
      }
    }

    if (t.kind === "op" && t.op === "EI") {
      out.push({ op: "EI", args: [] });
      continue;
    }

    if (t.kind === "kw") {
      const word = t.value;
      if (looksLikeOperator(word)) {
        // Emit current stack as args (postfix).
        out.push({ op: word, args: stack.splice(0, stack.length) });
      } else {
        // treat unknown bare word as string to avoid data loss
        stack.push({ type: "string", value: word });
      }
      continue;
    }

    if (t.kind === "img") {
      // img data should have been handled by ID; if we land here, keep as bytes
      stack.push({ type: "bytes", bytes: t.data });
      continue;
    }

    // value token => push to operand stack
    if (t.kind === "val") {
      stack.push(t.value);
    }
  }

  if (stack.length) {
    // If leftover operands exist, attach them to a fake op for debugging (optional).
    out.push({ op: "__STACK__", args: stack.slice() });
  }
  return out;
}

// ---------------------------- Utilities -------------------------------------

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const h = bytes[i].toString(16).padStart(2, "0");
    s += h;
  }
  return s;
}
