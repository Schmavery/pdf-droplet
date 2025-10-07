/* Copyright 2012 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { CmykICCBasedCS, IccColorSpace } from "./icc_colorspace.js";
import {
  createValidAbsoluteUrl,
  FeatureTest,
  unreachable,
  warn,
} from "../shared/util.js";
import { ChunkedStreamManager } from "./chunked_stream.js";
import { ImageResizer } from "./image_resizer.js";
import { JpegStream } from "./jpeg_stream.js";
import { JpxImage } from "./jpx.js";
import { MissingDataException } from "./core_utils.js";
import { OperatorList } from "./operator_list.js";
import { PDFDocument } from "./document.js";
import { Stream } from "./stream.js";

/**
 * typedef {Object} EvaluatorOptions
 * @property {number} [canvasMaxAreaInBytes]
 * @property {boolean} [isImageDecoderSupported]
 * @property {boolean} [isOffscreenCanvasSupported]
 * @property {*} [handler]
 * @property {boolean} [useWasm]
 * @property {boolean} [useWorkerFetch]
 * @property {string} [wasmUrl]
 * @property {string} [iccUrl]
 */

/**
 *
 * @param {string | null} url
 * @returns
 */
function parseDocBaseUrl(url) {
  if (url) {
    const absoluteUrl = createValidAbsoluteUrl(url);
    if (absoluteUrl) {
      return absoluteUrl.href;
    }
    warn(`Invalid absolute docBaseUrl: "${url}".`);
  }
  return null;
}

class BasePdfManager {
  /**
   * @param {object} args
   * @param {*} [args.source]
   * @param {*} [args.disableAutoFetch]
   * @param {*} [args.docBaseUrl]
   * @param {*} args.docId
   * @param {*} [args.enableXfa]
   * @param {EvaluatorOptions} args.evaluatorOptions
   * @param {*} args.handler
   * @param {*} [args.length]
   * @param {*} [args.password]
   * @param {*} [args.rangeChunkSize]
   */
  constructor({
    // source,
    // disableAutoFetch,
    docBaseUrl,
    docId,
    enableXfa,
    evaluatorOptions,
    handler,
    // length,
    password,
    // rangeChunkSize,
  }) {
    this._docBaseUrl = parseDocBaseUrl(docBaseUrl);
    this._docId = docId;
    this._password = password;
    this.enableXfa = enableXfa;

    // Check `OffscreenCanvas` and `ImageDecoder` support once,
    // rather than repeatedly throughout the worker-thread code.
    evaluatorOptions.isOffscreenCanvasSupported &&=
      FeatureTest.isOffscreenCanvasSupported;
    evaluatorOptions.isImageDecoderSupported &&=
      FeatureTest.isImageDecoderSupported;

    /**
     * @type {EvaluatorOptions}
     */
    this.evaluatorOptions = Object.freeze(evaluatorOptions);

    // Initialize image-options once per document.
    ImageResizer.setOptions(evaluatorOptions);
    JpegStream.setOptions(evaluatorOptions);
    OperatorList.setOptions(evaluatorOptions);

    const options = { ...evaluatorOptions, handler };
    JpxImage.setOptions(options);
    IccColorSpace.setOptions(options);
    CmykICCBasedCS.setOptions(options);
  }

  get docId() {
    return this._docId;
  }

  get password() {
    return this._password;
  }

  get docBaseUrl() {
    return this._docBaseUrl;
  }

  /**
   * @param {any} prop
   * @param {any} args
   */
  ensureDoc(prop, args) {
    return this.ensure(this.pdfDocument, prop, args);
  }

  /**
   * @param {any} prop
   * @param {any} args
   */
  ensureXRef(prop, args) {
    return this.ensure(this.pdfDocument.xref, prop, args);
  }

  /**
   * @param {any} prop
   * @param {any} args
   */
  ensureCatalog(prop, args) {
    return this.ensure(this.pdfDocument.catalog, prop, args);
  }

  /**
   * @param {any} pageIndex
   */
  getPage(pageIndex) {
    return this.pdfDocument.getPage(pageIndex);
  }

  /**
   * @param {any} id
   * @param {any} handler
   */
  fontFallback(id, handler) {
    return this.pdfDocument.fontFallback(id, handler);
  }

  cleanup(manuallyTriggered = false) {
    return this.pdfDocument.cleanup(manuallyTriggered);
  }

  /**
   * @param {any} _obj
   * @param {any} _prop
   * @param {any} _args
   */
  async ensure(_obj, _prop, _args) {
    unreachable("Abstract method `ensure` called");
  }

  /**
   * @param {any} _begin
   * @param {any} _end
   */
  requestRange(_begin, _end) {
    unreachable("Abstract method `requestRange` called");
  }

  requestLoadedStream(_noFetch = false) {
    unreachable("Abstract method `requestLoadedStream` called");
  }

  /**
   * @param {any} _chunk
   */
  sendProgressiveData(_chunk) {
    unreachable("Abstract method `sendProgressiveData` called");
  }

  /**
   * @param {any} password
   */
  updatePassword(password) {
    this._password = password;
  }

  /**
   * @param {any} _reason
   */
  terminate(_reason) {
    unreachable("Abstract method `terminate` called");
  }
}

class LocalPdfManager extends BasePdfManager {
  /**
   * @param {object} args
   * @param {Uint8Array | ArrayBuffer} args.source
   * @param {*} [args.disableAutoFetch]
   * @param {*} [args.docBaseUrl]
   * @param {*} [args.docId]
   * @param {*} [args.enableXfa]
   * @param {EvaluatorOptions} args.evaluatorOptions
   * @param {*} [args.handler]
   * @param {*} [args.length]
   * @param {*} [args.password]
   * @param {*} [args.rangeChunkSize]
   */
  constructor(args) {
    super(args);

    const stream = new Stream(args.source);
    this.pdfDocument = new PDFDocument(this, stream);
    this._loadedStreamPromise = Promise.resolve(stream);
    this.localStream = stream;
  }

  /**
   * @param {{ [x: string]: any; }} obj
   * @param {string | number} prop
   * @param {any} args
   */
  async ensure(obj, prop, args) {
    const value = obj[prop];
    if (typeof value === "function") {
      return value.apply(obj, args);
    }
    return value;
  }

  /**
   * @param {any} _begin
   * @param {any} _end
   */
  requestRange(_begin, _end) {
    return Promise.resolve();
  }

  requestLoadedStream(_noFetch = false) {
    return this._loadedStreamPromise;
  }

  /**
   * @param {any} _reason
   */
  terminate(_reason) {}
}

class NetworkPdfManager extends BasePdfManager {
  /**
   * @param {{ source: any; disableAutoFetch: any; docBaseUrl: any; docId?: any; enableXfa?: any; evaluatorOptions?: EvaluatorOptions; handler: any; length: any; password?: any; rangeChunkSize: any; }} args
   */
  constructor(args) {
    super(args);

    this.streamManager = new ChunkedStreamManager(args.source, {
      msgHandler: args.handler,
      length: args.length,
      disableAutoFetch: args.disableAutoFetch,
      rangeChunkSize: args.rangeChunkSize,
    });
    this.pdfDocument = new PDFDocument(this, this.streamManager.getStream());
  }

  /**
   * @param {{ [x: string]: any; }} obj
   * @param {string | number} prop
   * @param {any} args
   */
  async ensure(obj, prop, args) {
    try {
      const value = obj[prop];
      if (typeof value === "function") {
        return value.apply(obj, args);
      }
      return value;
    } catch (ex) {
      if (!(ex instanceof MissingDataException)) {
        throw ex;
      }
      await this.requestRange(ex.begin, ex.end);
      return this.ensure(obj, prop, args);
    }
  }

  /**
   * @param {any} begin
   * @param {any} end
   */
  requestRange(begin, end) {
    return this.streamManager.requestRange(begin, end);
  }

  requestLoadedStream(noFetch = false) {
    return this.streamManager.requestAllChunks(noFetch);
  }

  /**
   * @param {any} chunk
   */
  sendProgressiveData(chunk) {
    this.streamManager.onReceiveData({ chunk });
  }

  /**
   * @param {any} reason
   */
  terminate(reason) {
    this.streamManager.abort(reason);
  }
}

export { LocalPdfManager, NetworkPdfManager, BasePdfManager };
