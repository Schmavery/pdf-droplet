import { useMemo } from "react";
import type { Dict } from "@pdfjs/core/primitives";

interface XRefEntry {
  objNum: number;
  type: number;
  field1: number;
  field2: number;
}

const TYPE_LABELS = ["Free", "Uncompressed", "Compressed"];

function parseXRefStream(
  data: Uint8Array,
  dict: Dict,
): XRefEntry[] {
  const w = dict.get("W") as number[];
  if (!w || w.length < 3) return [];

  const size = dict.get("Size") as number;
  const index = dict.get("Index") as number[] | undefined;

  const subsections: { first: number; count: number }[] = [];
  if (index) {
    for (let i = 0; i < index.length; i += 2) {
      subsections.push({ first: index[i], count: index[i + 1] });
    }
  } else {
    subsections.push({ first: 0, count: size });
  }

  const entrySize = w[0] + w[1] + w[2];
  const entries: XRefEntry[] = [];
  let offset = 0;

  for (const sub of subsections) {
    for (let i = 0; i < sub.count; i++) {
      if (offset + entrySize > data.length) break;

      let type = 0;
      let field1 = 0;
      let field2 = 0;

      for (let b = 0; b < w[0]; b++) type = (type << 8) | data[offset++];
      for (let b = 0; b < w[1]; b++) field1 = (field1 << 8) | data[offset++];
      for (let b = 0; b < w[2]; b++) field2 = (field2 << 8) | data[offset++];

      // W[0]=0 means type defaults to 1
      if (w[0] === 0) type = 1;

      entries.push({ objNum: sub.first + i, type, field1, field2 });
    }
  }

  return entries;
}

export default function XRefView({
  data,
  dict,
}: {
  data: Uint8Array;
  dict: Dict;
}) {
  const entries = useMemo(() => parseXRefStream(data, dict), [data, dict]);

  const w = dict.get("W") as number[];
  const size = dict.get("Size") as number;

  return (
    <div className="mt-2 space-y-2">
      <div className="text-sm text-muted-foreground">
        Cross-reference stream — {entries.length} entries, W=[{w?.join(", ")}],
        Size={size}
      </div>
      <div className="overflow-auto max-h-[500px] border rounded">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-gray-100">
            <tr className="text-left text-muted-foreground">
              <th className="px-2 py-1">Obj#</th>
              <th className="px-2 py-1">Type</th>
              <th className="px-2 py-1">Offset / ObjStm#</th>
              <th className="px-2 py-1">Gen / Index</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.objNum}
                className="border-t border-gray-100 hover:bg-gray-50"
              >
                <td className="px-2 py-0.5">{e.objNum}</td>
                <td className="px-2 py-0.5">
                  <span
                    className={
                      e.type === 0
                        ? "text-gray-400"
                        : e.type === 2
                          ? "text-violet-600"
                          : ""
                    }
                  >
                    {TYPE_LABELS[e.type] ?? e.type}
                  </span>
                </td>
                <td className="px-2 py-0.5">{e.field1}</td>
                <td className="px-2 py-0.5">{e.field2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}