import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function dirname(path: string) {
  return path.match(/.*\//);
}

export function basename(path: string) {
  return path.replace(/.*\//, "");
}

export function createResource<T>(promise: Promise<T>) {
  let status = "pending";
  let result: T;
  let error: unknown;

  const suspender = promise.then(
    (r) => {
      status = "success";
      result = r;
    },
    (e) => {
      status = "error";
      error = e;
    }
  );

  return {
    read() {
      if (status === "pending") throw suspender;
      if (status === "error") throw error;
      return result;
    },
  };
}

export type SuspenseResource<T> = ReturnType<typeof createResource<T>>;

/** Read `length` bytes starting at `offset` as a lowercase hex string. */
export function readHex(
  data: Uint8Array,
  offset: number,
  length: number,
): string {
  let s = "";
  for (let i = 0; i < length; i++) {
    s += data[offset + i].toString(16).padStart(2, "0");
  }
  return s;
}

/** Read `length` bytes as printable ASCII, stripping non-printable chars. */
export function readAscii(
  data: Uint8Array,
  offset: number,
  length: number,
): string {
  let s = "";
  for (let i = 0; i < length; i++) {
    const b = data[offset + i];
    s += b >= 32 && b <= 126 ? String.fromCharCode(b) : "";
  }
  return s.trim();
}
