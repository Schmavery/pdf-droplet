import { useMemo } from "react";

function parseCIDSet(data: Uint8Array) {
  const totalBits = data.length * 8;
  const presentCIDs: number[] = [];

  for (let byteIdx = 0; byteIdx < data.length; byteIdx++) {
    const byte = data[byteIdx];
    if (byte === 0) continue;
    for (let bit = 7; bit >= 0; bit--) {
      if ((byte >> bit) & 1) {
        presentCIDs.push(byteIdx * 8 + (7 - bit));
      }
    }
  }

  const ranges: [number, number][] = [];
  for (const cid of presentCIDs) {
    const last = ranges[ranges.length - 1];
    if (last && cid === last[1] + 1) {
      last[1] = cid;
    } else {
      ranges.push([cid, cid]);
    }
  }

  return { totalBits, presentCIDs, ranges };
}

export default function CIDSetView({ data }: { data: Uint8Array }) {
  const { totalBits, presentCIDs, ranges } = useMemo(
    () => parseCIDSet(data),
    [data],
  );

  return (
    <div className="mt-2 space-y-2">
      <div className="text-sm text-muted-foreground">
        {presentCIDs.length.toLocaleString()} of{" "}
        {totalBits.toLocaleString()} CIDs present
      </div>

      {ranges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {ranges.slice(0, 200).map(([start, end], i) => (
            <span
              key={i}
              className="inline-block bg-blue-50 text-blue-800 text-xs font-mono px-1.5 py-0.5 rounded border border-blue-200"
            >
              {start === end ? start : `${start}–${end}`}
            </span>
          ))}
          {ranges.length > 200 && (
            <span className="text-xs text-muted-foreground italic self-center">
              … and {ranges.length - 200} more
            </span>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        A CIDSet is a bitmap declaring which character IDs are included in a
        subset-embedded CIDFont.
      </p>
    </div>
  );
}