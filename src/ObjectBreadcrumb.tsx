import * as React from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { Ref } from "@pdfjs/core/primitives";

interface ObjectBreadcrumbProps {
  path: Ref[];
  onNavigate: (index: number) => void;
}

export const ObjectBreadcrumb: React.FC<ObjectBreadcrumbProps> = ({
  path,
  onNavigate,
}) => {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {path.map((entry, idx) => (
          <React.Fragment key={idx}>
            <BreadcrumbItem>
              {idx === path.length - 1 ? (
                <span>{entry.toString()}</span>
              ) : (
                <BreadcrumbLink asChild>
                  <button
                    type="button"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                    }}
                    onClick={() => onNavigate(idx)}
                    aria-current={idx === path.length - 1 ? "page" : undefined}
                  >
                    {entry.toString()}
                  </button>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {idx < path.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};
