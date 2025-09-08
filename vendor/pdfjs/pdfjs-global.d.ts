// Type definitions for PDF.js (ambient/global)

declare const PDFJSDev: Regxp | undefined;

type EvaluatorOptions = {
  canvasMaxAreaInBytes?: number;
  isImageDecoderSupported?: boolean;
  isOffscreenCanvasSupported?: boolean;
  useWasm?: boolean;
  useWorkerFetch?: boolean;
  wasmUrl?: string;
  iccUrl?: string;
  ignoreErrors?: boolean;
};
