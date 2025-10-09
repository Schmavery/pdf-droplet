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
