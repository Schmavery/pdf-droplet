import { useMemo, useState } from "react";
import { inspectFont, type FontInspection, type GlyphEntry } from "@/lib/fontFile";

// ── Glyph grid ─────────────────────────────────────────────────────────

const PREVIEW_CHARS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
  ..."!@#$%&*()+-=[]{}|;:'\",.<>/?",
].map((c) => c.codePointAt(0)!);

function GlyphCell({
  id,
  svgPath,
  viewBox,
  yMax,
  isGlyphIndex,
}: {
  id: number;
  svgPath: string;
  viewBox: string;
  yMax: number;
  isGlyphIndex?: boolean;
}) {
  const label = isGlyphIndex
    ? `GID ${id}`
    : `U+${id.toString(16).toUpperCase().padStart(4, "0")} ${String.fromCodePoint(id)}`;
  const displayLabel = isGlyphIndex
    ? `#${id}`
    : id.toString(16).toUpperCase().padStart(4, "0");
  return (
    <div
      className="flex flex-col items-center border border-gray-200 rounded overflow-hidden bg-white hover:border-gray-400 transition-colors"
      title={label}
    >
      <div className="p-1.5 flex items-center justify-center">
        <svg viewBox={viewBox} className="w-8 h-8" aria-label={label}>
          <g transform={`translate(0,${yMax}) scale(1,-1)`}>
            <path d={svgPath} fill="currentColor" />
          </g>
        </svg>
      </div>
      <span className="text-[9px] text-muted-foreground font-mono leading-none bg-gray-100 w-full text-center py-0.5">
        {displayLabel}
      </span>
    </div>
  );
}

function GlyphGrid({
  font,
  showAll,
}: {
  font: FontInspection;
  showAll: boolean;
}) {
  const glyphs = useMemo((): GlyphEntry[] => {
    // Fonts without a cmap (common for subsetted PDF fonts): render by glyph index
    if (!font.hasCmap) {
      return font.getGlyphsByIndex();
    }

    if (showAll) {
      const codePoints = font.getMappedCodePoints().slice(0, 256);
      const result: GlyphEntry[] = [];
      for (const cp of codePoints) {
        const svg = font.getGlyphSVG(cp);
        if (svg) result.push({ id: cp, svgPath: svg });
      }
      if (result.length < 8) {
        return font.getGlyphsByIndex();
      }
      return result.sort((a, b) => a.id - b.id);
    }
    // Try standard ASCII chars first; if few match (e.g. Symbol fonts
    // that map to PUA range 0xF0xx), supplement with mapped code points
    const result: GlyphEntry[] = [];
    for (const cp of PREVIEW_CHARS) {
      const svg = font.getGlyphSVG(cp);
      if (svg) result.push({ id: cp, svgPath: svg });
    }
    if (result.length < 8) {
      const seen = new Set(result.map((g) => g.id));
      for (const cp of font.getMappedCodePoints().slice(0, 256)) {
        if (seen.has(cp)) continue;
        const svg = font.getGlyphSVG(cp);
        if (svg) result.push({ id: cp, svgPath: svg });
      }
    }
    if (result.length < 8) {
      return font.getGlyphsByIndex();
    }
    return result.sort((a, b) => a.id - b.id);
  }, [font, showAll]);

  const { viewBox, yMax } = useMemo(() => {
    const h = font.head;
    const upm = h?.unitsPerEm || 1000;
    const xMin = (h ? h.xMin : 0) / upm;
    const yMin = (h ? h.yMin : -200) / upm;
    const xMax = (h ? h.xMax : upm) / upm;
    const yMaxVal = (h ? h.yMax : 800) / upm;
    if ([xMin, yMin, xMax, yMaxVal].some((v) => !Number.isFinite(v))) {
      return { viewBox: "-0.1 0 1.2 1.3", yMax: 1.1 };
    }
    const pad = (yMaxVal - yMin) * 0.04;
    const svgW = xMax - xMin + pad * 2;
    const svgH = yMaxVal - yMin + pad * 2;
    return {
      viewBox: `${xMin - pad} 0 ${svgW} ${svgH}`,
      yMax: yMaxVal + pad,
    };
  }, [font.head]);

  if (glyphs.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic space-y-1">
        <p>No renderable glyphs found.</p>
        {font.glyphError && (
          <p className="text-red-600 not-italic font-mono text-xs">
            {font.glyphError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-1" style={{gridTemplateColumns: "repeat(auto-fill, minmax(3.25rem, 1fr))"}}>
      {glyphs.map(({ id, svgPath, isGlyphIndex }) => (
        <GlyphCell
          key={isGlyphIndex ? `gid-${id}` : id}
          id={id}
          svgPath={svgPath}
          viewBox={viewBox}
          yMax={yMax}
          isGlyphIndex={isGlyphIndex}
        />
      ))}
    </div>
  );
}

// ── Shared table component ─────────────────────────────────────────────

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

// ── Top-level identity rows ────────────────────────────────────────────

function getIdentityRows(font: FontInspection): [string, string][] {
  const rows: [string, string][] = [];
  if (font.names.fullName) rows.push(["Full Name", font.names.fullName]);
  else if (font.names.family) rows.push(["Family", font.names.family]);
  if (font.names.postScriptName)
    rows.push(["PostScript Name", font.names.postScriptName]);
  if (font.names.version) rows.push(["Version", font.names.version]);
  if (font.numGlyphs != null) {
    const present = font.getGlyphsByIndex().length;
    if (present < font.numGlyphs) {
      rows.push([
        "Glyphs",
        `${present} of ${font.numGlyphs.toLocaleString()} (subsetted)`,
      ]);
    } else {
      rows.push(["Glyphs", font.numGlyphs.toLocaleString()]);
    }
  }
  if (font.os2) rows.push(["Weight", font.os2.weightClassName]);
  if (font.names.copyright) rows.push(["Copyright", font.names.copyright]);
  return rows;
}

// ── Metrics rows (detailed) ────────────────────────────────────────────

function getMetricsRows(font: FontInspection): [string, string][] {
  const rows: [string, string][] = [];

  rows.push(["Format", font.format]);
  if (font.head) {
    rows.push(["Units per Em", font.head.unitsPerEm.toString()]);
    rows.push([
      "Bounding Box",
      `[${font.head.xMin}, ${font.head.yMin}] – [${font.head.xMax}, ${font.head.yMax}]`,
    ]);
    if (font.macStyleFlags.length > 0)
      rows.push(["Mac Style", font.macStyleFlags.join(", ")]);
    if (font.head.created)
      rows.push([
        "Created",
        font.head.created.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      ]);
    if (font.head.modified)
      rows.push([
        "Modified",
        font.head.modified.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        }),
      ]);
  }

  if (font.hhea) {
    rows.push(["Ascender", font.hhea.ascender.toString()]);
    rows.push(["Descender", font.hhea.descender.toString()]);
    rows.push(["Line Gap", font.hhea.lineGap.toString()]);
  }

  if (font.os2) {
    rows.push(["Width", font.os2.widthClassName]);
    if (font.os2.vendorID) rows.push(["Vendor", font.os2.vendorID]);
    if (font.fsSelectionFlags.length > 0)
      rows.push(["Selection Flags", font.fsSelectionFlags.join(", ")]);
    rows.push([
      "Char Range",
      `U+${font.os2.firstCharIndex.toString(16).toUpperCase().padStart(4, "0")} – U+${font.os2.lastCharIndex.toString(16).toUpperCase().padStart(4, "0")}`,
    ]);
    if (font.os2.panose.some((v) => v !== 0))
      rows.push(["Panose", font.os2.panose.join(" ")]);
    if (font.os2.typoAscender != null)
      rows.push(["Typo Ascender", font.os2.typoAscender.toString()]);
    if (font.os2.typoDescender != null)
      rows.push(["Typo Descender", font.os2.typoDescender.toString()]);
    if (font.os2.typoLineGap != null)
      rows.push(["Typo Line Gap", font.os2.typoLineGap.toString()]);
  }

  if (font.post) {
    rows.push(["Italic Angle", `${font.post.italicAngle}°`]);
    rows.push(["Fixed Pitch", font.post.isFixedPitch ? "Yes" : "No"]);
    rows.push([
      "Underline",
      `pos ${font.post.underlinePosition}, thickness ${font.post.underlineThickness}`,
    ]);
  }

  if (font.names.manufacturer)
    rows.push(["Manufacturer", font.names.manufacturer]);
  if (font.names.designer) rows.push(["Designer", font.names.designer]);
  if (font.names.license) rows.push(["License", font.names.license]);

  return rows;
}

// ── Sub-tables ─────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

function TableDirectory({ tables }: { tables: FontInspection["tables"] }) {
  return (
    <table className="w-full text-sm font-mono">
      <thead>
        <tr className="border-b border-gray-300 text-muted-foreground">
          <th className="py-1 pr-3 text-left font-semibold">Tag</th>
          <th className="py-1 pr-3 text-right font-semibold">Offset</th>
          <th className="py-1 text-right font-semibold">Size</th>
        </tr>
      </thead>
      <tbody>
        {tables.map((t) => (
          <tr
            key={t.tag}
            className="border-b border-gray-100 hover:bg-gray-50"
          >
            <td className="py-1 pr-3 font-semibold">{t.tag}</td>
            <td className="py-1 pr-3 text-right text-muted-foreground">
              {t.offset}
            </td>
            <td className="py-1 text-right text-muted-foreground">
              {formatBytes(t.length)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CmapSubtables({
  subtables,
}: {
  subtables: FontInspection["cmapSubtables"];
}) {
  return (
    <table className="w-full text-sm font-mono">
      <thead>
        <tr className="border-b border-gray-300 text-muted-foreground">
          <th className="py-1 pr-3 text-left font-semibold">Platform</th>
          <th className="py-1 pr-3 text-right font-semibold">Encoding</th>
          <th className="py-1 text-right font-semibold">Format</th>
        </tr>
      </thead>
      <tbody>
        {subtables.map((st, i) => (
          <tr
            key={i}
            className="border-b border-gray-100 hover:bg-gray-50"
          >
            <td className="py-1 pr-3">
              {st.platformName}{" "}
              <span className="text-muted-foreground">({st.platformID})</span>
            </td>
            <td className="py-1 pr-3 text-right text-muted-foreground">
              {st.encodingID}
            </td>
            <td className="py-1 text-right text-muted-foreground">
              {st.format}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main component ─────────────────────────────────────────────────────

export default function FontFileView({ data }: { data: Uint8Array }) {
  const font = useMemo(() => inspectFont(data), [data]);
  const [showAllGlyphs, setShowAllGlyphs] = useState(false);

  if (!font) return null;

  const badgeColor =
    font.format === "TrueType"
      ? "bg-emerald-100 text-emerald-800"
      : "bg-sky-100 text-sky-800";

  const identityRows = getIdentityRows(font);
  const metricsRows = getMetricsRows(font);

  return (
    <div className="mt-2 space-y-4">
      {/* Header + key identity info */}
      <div className="bg-gray-50 border rounded-md p-3">
        <div className="flex items-center gap-2 mb-2">
          <span
            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${badgeColor}`}
          >
            {font.format}
          </span>
          {font.names.fullName && (
            <span className="text-sm font-semibold truncate">
              {font.names.fullName}
            </span>
          )}
        </div>
        <MetadataTable rows={identityRows} />
      </div>

      {/* Glyph preview */}
      <div className="bg-gray-50 border rounded-md p-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Glyphs</h4>
          {font.hasCmap && (
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setShowAllGlyphs((v) => !v)}
            >
              {showAllGlyphs ? "Common characters" : "Show all mapped"}
            </button>
          )}
        </div>
        <GlyphGrid font={font} showAll={showAllGlyphs} />
      </div>

      {/* Metrics (detailed) */}
      {metricsRows.length > 0 && (
        <div className="bg-gray-50 border rounded-md p-3">
          <h4 className="text-sm font-semibold mb-2">Metrics</h4>
          <MetadataTable rows={metricsRows} />
        </div>
      )}

      {/* Table directory */}
      {font.tables.length > 0 && (
        <div className="bg-gray-50 border rounded-md p-3">
          <h4 className="text-sm font-semibold mb-2">
            Tables ({font.tables.length})
          </h4>
          <div className="overflow-x-auto">
            <TableDirectory tables={font.tables} />
          </div>
        </div>
      )}

      {/* Cmap subtables */}
      {font.cmapSubtables.length > 0 && (
        <div className="bg-gray-50 border rounded-md p-3">
          <h4 className="text-sm font-semibold mb-2">
            Character Maps ({font.cmapSubtables.length})
          </h4>
          <div className="overflow-x-auto">
            <CmapSubtables subtables={font.cmapSubtables} />
          </div>
        </div>
      )}
    </div>
  );
}
