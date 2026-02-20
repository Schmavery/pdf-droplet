import { useEffect, useRef, useState } from "react";
import {
  PDF_OBJS,
  PDF_COMMON_OBJECTS,
  type ObjectEntry,
} from "@/lib/loadPDF";
import { FlateStream } from "@pdfjs/core/flate_stream";
import { Name, Ref } from "@pdfjs/core/primitives";
import { Stream } from "@pdfjs/core/stream";

const GRAYSCALE_1BPP = 1;
const RGB_24BPP = 2;
const RGBA_32BPP = 3;

function drawRawImgData(
  canvas: HTMLCanvasElement,
  obj: { data: Uint8ClampedArray; width: number; height: number; kind?: number },
) {
  canvas.width = obj.width;
  canvas.height = obj.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  if (
    obj.kind === RGBA_32BPP ||
    (!obj.kind && obj.data.length === obj.width * obj.height * 4)
  ) {
    const imgData = new ImageData(
      new Uint8ClampedArray(obj.data),
      obj.width,
      obj.height,
    );
    ctx.putImageData(imgData, 0, 0);
  } else if (
    obj.kind === RGB_24BPP ||
    (!obj.kind && obj.data.length === obj.width * obj.height * 3)
  ) {
    const imgData = ctx.createImageData(obj.width, obj.height);
    const dst = imgData.data;
    const src = obj.data;
    for (let i = 0, j = 0, len = obj.width * obj.height; i < len; i++, j += 3) {
      dst[i * 4] = src[j];
      dst[i * 4 + 1] = src[j + 1];
      dst[i * 4 + 2] = src[j + 2];
      dst[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  } else if (obj.kind === GRAYSCALE_1BPP) {
    const imgData = ctx.createImageData(obj.width, obj.height);
    const dst = imgData.data;
    const src = obj.data;
    for (let i = 0, len = obj.width * obj.height; i < len; i++) {
      const byteIdx = i >> 3;
      const bitIdx = 7 - (i & 7);
      const g = ((src[byteIdx] >> bitIdx) & 1) === 0 ? 0 : 255;
      dst[i * 4] = g;
      dst[i * 4 + 1] = g;
      dst[i * 4 + 2] = g;
      dst[i * 4 + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }
}

function decodeFromStreamBytes(
  canvas: HTMLCanvasElement,
  stream: FlateStream | Stream,
): string | null {
  const dict = stream.dict;
  if (!dict) return "No image dictionary";

  const width = dict.get("W", "Width") as number;
  const height = dict.get("H", "Height") as number;
  const bpc = dict.get("BitsPerComponent") as number;
  const cs = dict.get("ColorSpace");
  const csName =
    cs instanceof Name ? cs.name : typeof cs === "string" ? cs : null;

  if (!width || !height) return "Missing width/height";

  const bytes =
    stream instanceof FlateStream
      ? stream.buffer.subarray(0, stream.bufferLength)
      : stream.bytes.slice(stream.start, stream.end);

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "Could not get canvas context";

  const imgData = ctx.createImageData(width, height);
  const dst = imgData.data;

  if (csName === "DeviceGray" && bpc === 8) {
    for (let i = 0, len = width * height; i < len; i++) {
      const g = bytes[i] ?? 0;
      dst[i * 4] = g;
      dst[i * 4 + 1] = g;
      dst[i * 4 + 2] = g;
      dst[i * 4 + 3] = 255;
    }
  } else if (csName === "DeviceRGB" && bpc === 8) {
    for (let i = 0, len = width * height; i < len; i++) {
      dst[i * 4] = bytes[i * 3] ?? 0;
      dst[i * 4 + 1] = bytes[i * 3 + 1] ?? 0;
      dst[i * 4 + 2] = bytes[i * 3 + 2] ?? 0;
      dst[i * 4 + 3] = 255;
    }
  } else if (csName === "DeviceGray" && bpc === 1) {
    for (let i = 0, len = width * height; i < len; i++) {
      const byteIdx = i >> 3;
      const bitIdx = 7 - (i & 7);
      const g = ((bytes[byteIdx] >> bitIdx) & 1) === 0 ? 0 : 255;
      dst[i * 4] = g;
      dst[i * 4 + 1] = g;
      dst[i * 4 + 2] = g;
      dst[i * 4 + 3] = 255;
    }
  } else {
    return `Unsupported image format: ${csName ?? "unknown"} ${bpc}bpc`;
  }

  ctx.putImageData(imgData, 0, 0);
  return null;
}

function findDecodedImage(refStr: string) {
  for (const pool of [PDF_OBJS, PDF_COMMON_OBJECTS] as const) {
    for (const [, obj] of pool) {
      if (obj?.ref?.toString() !== refStr) continue;
      if (obj.bitmap instanceof ImageBitmap) return obj as { bitmap: ImageBitmap };
      if (obj.data && obj.width && obj.height)
        return obj as { data: Uint8ClampedArray; width: number; height: number; kind?: number };
    }
  }
  return null;
}

export default function ImageView({
  entry,
}: {
  entry: ObjectEntry;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string>();

  const stream = entry.val as FlateStream | Stream;
  const objRef = entry.ref;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setError(undefined);

    const refStr = objRef.toString();
    const decoded = findDecodedImage(refStr);

    if (decoded && "bitmap" in decoded) {
      canvas.width = decoded.bitmap.width;
      canvas.height = decoded.bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(decoded.bitmap, 0, 0);
      return;
    }

    if (decoded && "data" in decoded) {
      drawRawImgData(canvas, decoded);
      return;
    }

    const err = decodeFromStreamBytes(canvas, stream);
    if (err) setError(err);
  }, [stream, objRef]);

  const dict = stream.dict;
  const width = dict?.get("W", "Width") as number | undefined;
  const height = dict?.get("H", "Height") as number | undefined;
  const bpc = dict?.get("BitsPerComponent") as number | undefined;
  const cs = dict?.get("ColorSpace");
  const csName =
    cs instanceof Name ? cs.name : typeof cs === "string" ? cs : null;
  const filter = dict?.get("Filter");
  const filterName =
    filter instanceof Name ? filter.name : typeof filter === "string" ? filter : null;

  return (
    <div className="mt-2 space-y-3">
      <div className="bg-gray-50 border rounded-md p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block bg-green-100 text-green-800 text-xs font-semibold px-2 py-0.5 rounded">
            Image XObject
          </span>
          {width != null && height != null && (
            <span className="text-sm text-muted-foreground">
              {width} × {height}
            </span>
          )}
        </div>
        <table className="w-full text-sm font-mono">
          <tbody>
            {csName && (
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-4 text-muted-foreground font-semibold">Color Space</td>
                <td className="py-1">{csName}</td>
              </tr>
            )}
            {bpc != null && (
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-4 text-muted-foreground font-semibold">Bits/Component</td>
                <td className="py-1">{bpc}</td>
              </tr>
            )}
            {filterName && (
              <tr className="border-b border-gray-100">
                <td className="py-1 pr-4 text-muted-foreground font-semibold">Filter</td>
                <td className="py-1">{filterName}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error ? (
        <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          {error}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          style={{ maxWidth: "100%", border: "1px solid #ccc" }}
        />
      )}
    </div>
  );
}