import { readUint16, readUint32 } from "@pdfjs/core/core_utils";
import { isICCProfile } from "@/lib/streamDetection";
import { readAscii, readHex } from "@/lib/utils";

export interface ICCHeader {
  profileSize: number;
  preferredCMM: string;
  version: string;
  deviceClass: string;
  deviceClassName: string;
  colorSpace: string;
  colorSpaceName: string;
  pcs: string;
  pcsName: string;
  dateCreated: Date;
  signature: string;
  primaryPlatform: string;
  primaryPlatformName: string;
  profileFlags: number;
  deviceManufacturer: string;
  deviceModel: string;
  renderingIntent: number;
  renderingIntentName: string;
  pcsIlluminant: { x: number; y: number; z: number };
  profileCreator: string;
  profileId: string;
}

export interface ICCTag {
  signature: string;
  signatureName: string;
  offset: number;
  size: number;
  parsedValue?: string | { x: number; y: number; z: number } | CurveInfo;
}

export interface CurveInfo {
  type: "gamma" | "parametric" | "table";
  gamma?: number;
  tableEntries?: number;
}

export interface ParsedICCProfile {
  header: ICCHeader;
  tags: ICCTag[];
  description?: string;
  copyright?: string;
}

const DEVICE_CLASSES: Record<string, string> = {
  scnr: "Input (Scanner)",
  mntr: "Display (Monitor)",
  prtr: "Output (Printer)",
  link: "Device Link",
  spac: "Color Space Conversion",
  abst: "Abstract",
  nmcl: "Named Color",
};

const COLOR_SPACES: Record<string, string> = {
  "XYZ ": "CIEXYZ",
  "Lab ": "CIELAB",
  "Luv ": "CIELUV",
  YCbr: "YCbCr",
  "Yxy ": "CIEYxy",
  "RGB ": "RGB",
  GRAY: "Grayscale",
  "HSV ": "HSV",
  "HLS ": "HLS",
  CMYK: "CMYK",
  "CMY ": "CMY",
  "2CLR": "2 Color",
  "3CLR": "3 Color",
  "4CLR": "4 Color",
  "5CLR": "5 Color",
  "6CLR": "6 Color",
  "7CLR": "7 Color",
  "8CLR": "8 Color",
  "9CLR": "9 Color",
  ACLR: "10 Color",
  BCLR: "11 Color",
  CCLR: "12 Color",
  DCLR: "13 Color",
  ECLR: "14 Color",
  FCLR: "15 Color",
};

const PLATFORMS: Record<string, string> = {
  APPL: "Apple",
  MSFT: "Microsoft",
  "SGI ": "SGI",
  SUNW: "Sun Microsystems",
  "*nix": "Unix/Linux",
};

const RENDERING_INTENTS: Record<number, string> = {
  0: "Perceptual",
  1: "Relative Colorimetric",
  2: "Saturation",
  3: "Absolute Colorimetric",
};

const TAG_NAMES: Record<string, string> = {
  desc: "Profile Description",
  cprt: "Copyright",
  wtpt: "Media White Point",
  bkpt: "Media Black Point",
  rXYZ: "Red Matrix Column",
  gXYZ: "Green Matrix Column",
  bXYZ: "Blue Matrix Column",
  rTRC: "Red TRC",
  gTRC: "Green TRC",
  bTRC: "Blue TRC",
  kTRC: "Gray TRC",
  chad: "Chromatic Adaptation",
  A2B0: "AToB0 (Device→PCS, Perceptual)",
  A2B1: "AToB1 (Device→PCS, Rel. Colorimetric)",
  A2B2: "AToB2 (Device→PCS, Saturation)",
  B2A0: "BToA0 (PCS→Device, Perceptual)",
  B2A1: "BToA1 (PCS→Device, Rel. Colorimetric)",
  B2A2: "BToA2 (PCS→Device, Saturation)",
  gamt: "Gamut",
  dmnd: "Device Manufacturer Description",
  dmdd: "Device Model Description",
  lumi: "Luminance",
  meas: "Measurement",
  tech: "Technology",
  vued: "Viewing Conditions Description",
  view: "Viewing Conditions",
  cicp: "Coding-Independent Code Points",
  clrt: "Colorant Table",
  clot: "Colorant Table Out",
  pre0: "Preview 0",
  pre1: "Preview 1",
  pre2: "Preview 2",
  ncl2: "Named Color 2",
  arts: "Absolute to Relative Conversion",
  chrm: "Chromaticity",
  meta: "Metadata",
};

/** Read an ICC s15Fixed16Number (signed 16.16 fixed-point) as a float. */
function readS15Fixed16(data: Uint8Array, offset: number): number {
  const val =
    (data[offset] << 24) |
    (data[offset + 1] << 16) |
    (data[offset + 2] << 8) |
    data[offset + 3];
  return val / 65536;
}

function parseTextTag(data: Uint8Array, offset: number, size: number): string {
  const typeSignature = readAscii(data, offset, 4);
  if (typeSignature === "text") {
    // 'text' type: sig(4) + reserved(4) + ASCII text
    const textBytes = data.slice(offset + 8, offset + size);
    let end = textBytes.indexOf(0);
    if (end === -1) end = textBytes.length;
    return new TextDecoder("ascii").decode(textBytes.slice(0, end));
  }
  if (typeSignature === "desc") {
    // v2 'desc' type: sig(4) + reserved(4) + ASCII count(4) + ASCII text
    const asciiCount = readUint32(data, offset + 8);
    if (asciiCount > 0 && offset + 12 + asciiCount <= data.length) {
      const textBytes = data.slice(offset + 12, offset + 12 + asciiCount);
      let end = textBytes.indexOf(0);
      if (end === -1) end = textBytes.length;
      return new TextDecoder("ascii").decode(textBytes.slice(0, end));
    }
  }
  if (typeSignature === "mluc") {
    // v4 'mluc' type: sig(4) + reserved(4) + record count(4) + record size(4)
    //   then records: language(2) + country(2) + string length(4) + string offset(4)
    const recordCount = readUint32(data, offset + 8);
    if (recordCount > 0) {
      const strLength = readUint32(data, offset + 20);
      const strOffset = readUint32(data, offset + 24);
      if (strOffset + strLength <= size) {
        const strBytes = data.slice(
          offset + strOffset,
          offset + strOffset + strLength,
        );
        return new TextDecoder("utf-16be").decode(strBytes).replace(/\0/g, "");
      }
    }
  }
  return "";
}

function parseXYZTag(
  data: Uint8Array,
  offset: number,
): { x: number; y: number; z: number } | undefined {
  const typeSignature = readAscii(data, offset, 4);
  if (typeSignature !== "XYZ") return undefined;
  return {
    x: readS15Fixed16(data, offset + 8),
    y: readS15Fixed16(data, offset + 12),
    z: readS15Fixed16(data, offset + 16),
  };
}

function parseCurveTag(
  data: Uint8Array,
  offset: number,
): CurveInfo | undefined {
  const typeSignature = readAscii(data, offset, 4);
  if (typeSignature === "curv") {
    const entryCount = readUint32(data, offset + 8);
    if (entryCount === 0) return { type: "gamma", gamma: 1.0 };
    if (entryCount === 1) {
      const g = readUint16(data, offset + 12) / 256;
      return { type: "gamma", gamma: Math.round(g * 100) / 100 };
    }
    return { type: "table", tableEntries: entryCount };
  }
  if (typeSignature === "para") {
    const funcType = readUint16(data, offset + 8);
    const g = readS15Fixed16(data, offset + 12);
    return {
      type: "parametric",
      gamma: Math.round(g * 100) / 100,
      tableEntries: funcType,
    };
  }
  return undefined;
}

export function parseICCProfile(data: Uint8Array): ParsedICCProfile | null {
  if (!isICCProfile(data)) return null;

  const profileSize = readUint32(data, 0);
  const preferredCMM = readAscii(data, 4, 4);

  const major = data[8];
  const minor = (data[9] >> 4) & 0xf;
  const bugfix = data[9] & 0xf;
  const version = `${major}.${minor}.${bugfix}`;

  const deviceClassRaw = readAscii(data, 12, 4);
  const colorSpaceRaw = readAscii(data, 16, 4);
  const pcsRaw = readAscii(data, 20, 4);

  const year = readUint16(data, 24);
  const month = readUint16(data, 26);
  const day = readUint16(data, 28);
  const hour = readUint16(data, 30);
  const minute = readUint16(data, 32);
  const second = readUint16(data, 34);
  const dateCreated = new Date(year, month - 1, day, hour, minute, second);

  const signature = readAscii(data, 36, 4);
  const primaryPlatformRaw = readAscii(data, 40, 4);
  const profileFlags = readUint32(data, 44);
  const deviceManufacturer = readAscii(data, 48, 4);
  const deviceModel = readAscii(data, 52, 4);

  const renderingIntent = readUint32(data, 64);

  const pcsIlluminant = {
    x: readS15Fixed16(data, 68),
    y: readS15Fixed16(data, 72),
    z: readS15Fixed16(data, 76),
  };

  const profileCreator = readAscii(data, 80, 4);
  const profileId = readHex(data, 84, 16);
  const isZeroId = profileId === "00000000000000000000000000000000";

  const header: ICCHeader = {
    profileSize,
    preferredCMM,
    version,
    deviceClass: deviceClassRaw,
    deviceClassName: DEVICE_CLASSES[deviceClassRaw] ?? deviceClassRaw,
    colorSpace: colorSpaceRaw,
    colorSpaceName:
      COLOR_SPACES[colorSpaceRaw] ??
      COLOR_SPACES[colorSpaceRaw + " "] ??
      colorSpaceRaw,
    pcs: pcsRaw,
    pcsName: COLOR_SPACES[pcsRaw] ?? COLOR_SPACES[pcsRaw + " "] ?? pcsRaw,
    dateCreated,
    signature,
    primaryPlatform: primaryPlatformRaw,
    primaryPlatformName:
      PLATFORMS[primaryPlatformRaw] ?? (primaryPlatformRaw || "(none)"),
    profileFlags,
    deviceManufacturer: deviceManufacturer || "(none)",
    deviceModel: deviceModel || "(none)",
    renderingIntent,
    renderingIntentName:
      RENDERING_INTENTS[renderingIntent] ?? `${renderingIntent}`,
    pcsIlluminant,
    profileCreator: profileCreator || "(none)",
    profileId: isZeroId ? "(not computed)" : profileId,
  };

  const tags: ICCTag[] = [];
  let description: string | undefined;
  let copyright: string | undefined;

  if (data.length >= 132) {
    const tagCount = readUint32(data, 128);
    const maxTags = Math.min(tagCount, 100);

    for (let i = 0; i < maxTags; i++) {
      const tagOffset = 132 + i * 12;
      if (tagOffset + 12 > data.length) break;

      const sig = readAscii(data, tagOffset, 4);
      const dataOffset = readUint32(data, tagOffset + 4);
      const dataSize = readUint32(data, tagOffset + 8);

      const tag: ICCTag = {
        signature: sig,
        signatureName: TAG_NAMES[sig] ?? sig,
        offset: dataOffset,
        size: dataSize,
      };

      if (dataOffset + dataSize <= data.length) {
        if (
          sig === "desc" ||
          sig === "dmnd" ||
          sig === "dmdd" ||
          sig === "vued"
        ) {
          const text = parseTextTag(data, dataOffset, dataSize);
          if (text) {
            tag.parsedValue = text;
            if (sig === "desc") description = text;
          }
        } else if (sig === "cprt") {
          const text = parseTextTag(data, dataOffset, dataSize);
          if (text) {
            tag.parsedValue = text;
            copyright = text;
          }
        } else if (
          sig === "wtpt" ||
          sig === "bkpt" ||
          sig === "rXYZ" ||
          sig === "gXYZ" ||
          sig === "bXYZ" ||
          sig === "lumi"
        ) {
          const xyz = parseXYZTag(data, dataOffset);
          if (xyz) tag.parsedValue = xyz;
        } else if (
          sig === "rTRC" ||
          sig === "gTRC" ||
          sig === "bTRC" ||
          sig === "kTRC"
        ) {
          const curve = parseCurveTag(data, dataOffset);
          if (curve) tag.parsedValue = curve;
        }
      }

      tags.push(tag);
    }
  }

  return { header, tags, description, copyright };
}
