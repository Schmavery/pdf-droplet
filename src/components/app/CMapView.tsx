import { use, useMemo, useState } from "react";
import { inspectCMap, type ParsedCMap } from "@/lib/cmap";

function MetadataTable({ rows }: { rows: [string, string][] }) {
  return (
    <table className="w-full text-sm font-mono">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-gray-100">
            <td className="py-1 pr-4 text-muted-foreground whitespace-nowrap align-top font-semibold">
              {label}
            </td>
            <td className="py-1 break-all">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MappingTable({ mappings }: { mappings: ParsedCMap["mappings"] }) {
  const [showAll, setShowAll] = useState(false);
  const PREVIEW_LIMIT = 128;
  const visible = showAll ? mappings : mappings.slice(0, PREVIEW_LIMIT);
  const hasMore = mappings.length > PREVIEW_LIMIT;

  return (
    <div>
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-gray-200 text-muted-foreground text-left">
            <th className="py-1 pr-4 font-semibold">Code</th>
            <th className="py-1 pr-4 font-semibold">Unicode</th>
            <th className="py-1 pr-4 font-semibold">Char</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((m) => (
            <tr key={m.codeHex} className="border-b border-gray-50">
              <td className="py-0.5 pr-4 text-muted-foreground">{m.codeHex}</td>
              <td className="py-0.5 pr-4">{m.unicode}</td>
              <td className="py-0.5 text-base">{m.char || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {hasMore && !showAll && (
        <button
          className="mt-2 text-xs text-blue-600 hover:underline"
          onClick={() => setShowAll(true)}
        >
          Show all {mappings.length} mappings…
        </button>
      )}
    </div>
  );
}

export default function CMapView({ data }: { data: Uint8Array }) {
  const promise = useMemo(() => inspectCMap(data), [data]);
  const cmap = use(promise);

  if (!cmap) {
    return (
      <div className="text-muted-foreground text-sm p-2">
        Could not parse CMap data.
      </div>
    );
  }

  const identityRows: [string, string][] = [];
  if (cmap.name) identityRows.push(["CMap Name", cmap.name]);
  if (cmap.vertical) identityRows.push(["Writing Mode", "Vertical"]);
  if (cmap.codespaceRanges.length > 0)
    identityRows.push([
      "Code Space",
      cmap.codespaceRanges
        .map((r) => `<${r.low}> – <${r.high}> (${r.bytes}-byte)`)
        .join(", "),
    ]);
  identityRows.push(["Mappings", cmap.mappings.length.toLocaleString()]);

  return (
    <div className="space-y-4 py-2">
      {identityRows.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Summary
          </h3>
          <MetadataTable rows={identityRows} />
        </section>
      )}

      {cmap.mappings.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Character Mappings
          </h3>
          <MappingTable mappings={cmap.mappings} />
        </section>
      )}
    </div>
  );
}