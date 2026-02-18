import { useMemo } from "react";
import {
  isICCProfile,
  parseICCProfile,
  type CurveInfo,
  type ICCTag,
  type ParsedICCProfile,
} from "@/lib/iccProfile";

function formatXYZ(val: { x: number; y: number; z: number }): string {
  return `(${val.x.toFixed(4)}, ${val.y.toFixed(4)}, ${val.z.toFixed(4)})`;
}

function formatCurve(curve: CurveInfo): string {
  if (curve.type === "gamma") return `γ = ${curve.gamma}`;
  if (curve.type === "parametric")
    return `Parametric (type ${curve.tableEntries}, γ = ${curve.gamma})`;
  return `Curve table (${curve.tableEntries} entries)`;
}

function formatTagValue(tag: ICCTag): string | null {
  if (tag.parsedValue == null) return null;
  if (typeof tag.parsedValue === "string") return tag.parsedValue;
  if ("type" in tag.parsedValue) return formatCurve(tag.parsedValue);
  return formatXYZ(tag.parsedValue);
}

function HeaderTable({ profile }: { profile: ParsedICCProfile }) {
  const { header } = profile;
  const rows: [string, string][] = [
    ["Profile Size", `${header.profileSize.toLocaleString()} bytes`],
    ["Version", header.version],
    ["Device Class", `${header.deviceClassName} (${header.deviceClass})`],
    ["Color Space", `${header.colorSpaceName} (${header.colorSpace})`],
    ["PCS", `${header.pcsName} (${header.pcs})`],
    ["Date Created", header.dateCreated.toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    })],
    ["Primary Platform", header.primaryPlatformName],
    ["CMM Type", header.preferredCMM],
    ["Device Manufacturer", header.deviceManufacturer],
    ["Device Model", header.deviceModel],
    ["Rendering Intent", header.renderingIntentName],
    ["PCS Illuminant", formatXYZ(header.pcsIlluminant)],
    ["Profile Creator", header.profileCreator],
    ["Profile ID", header.profileId],
  ].filter(([, value]) => value && value !== "(none)" && value !== "(not computed)");

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

function TagTable({ tags }: { tags: ICCTag[] }) {
  return (
    <table className="w-full text-sm font-mono">
      <thead>
        <tr className="border-b border-gray-300 text-muted-foreground">
          <th className="py-1 pr-3 text-left font-semibold">Tag</th>
          <th className="py-1 pr-3 text-left font-semibold">Name</th>
          <th className="py-1 pr-3 text-right font-semibold">Offset</th>
          <th className="py-1 pr-3 text-right font-semibold">Size</th>
          <th className="py-1 text-left font-semibold">Value</th>
        </tr>
      </thead>
      <tbody>
        {tags.map((tag, i) => {
          const displayVal = formatTagValue(tag);
          return (
            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-1 pr-3 text-muted-foreground">{tag.signature}</td>
              <td className="py-1 pr-3">{tag.signatureName}</td>
              <td className="py-1 pr-3 text-right text-muted-foreground">
                {tag.offset}
              </td>
              <td className="py-1 pr-3 text-right text-muted-foreground">
                {tag.size}
              </td>
              <td className="py-1 break-all max-w-xs truncate" title={displayVal ?? ""}>
                {displayVal ?? (
                  <span className="text-muted-foreground italic">binary</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ICCProfileView({
  data,
}: {
  data: Uint8Array;
}) {
  const profile = useMemo(() => parseICCProfile(data), [data]);

  if (!profile) return null;

  return (
    <div className="mt-2 space-y-4">
      <div className="bg-gray-50 border rounded-md p-3">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block bg-indigo-100 text-indigo-800 text-xs font-semibold px-2 py-0.5 rounded">
            ICC Profile
          </span>
          {profile.description && (
            <span className="text-sm font-semibold truncate">
              {profile.description}
            </span>
          )}
        </div>
        {profile.copyright && (
          <p className="text-xs text-muted-foreground mb-2">
            {profile.copyright}
          </p>
        )}
        <HeaderTable profile={profile} />
      </div>

      {profile.tags.length > 0 && (
        <div className="bg-gray-50 border rounded-md p-3">
          <h4 className="text-sm font-semibold mb-2">
            Tags ({profile.tags.length})
          </h4>
          <div className="overflow-x-auto">
            <TagTable tags={profile.tags} />
          </div>
        </div>
      )}
    </div>
  );
}

export { isICCProfile };
