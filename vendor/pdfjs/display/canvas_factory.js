/* Copyright 2015 Mozilla Foundation
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

import { unreachable } from "../shared/util.js";

/**
 * @template {OffscreenCanvas | HTMLCanvasElement} CanvasType
 */
class BaseCanvasFactory {
  #enableHWA = false;

  constructor({ enableHWA = false }) {
    if (
      (typeof PDFJSDev === "undefined" || PDFJSDev.test("TESTING")) &&
      this.constructor === BaseCanvasFactory
    ) {
      unreachable("Cannot initialize BaseCanvasFactory.");
    }
    this.#enableHWA = enableHWA;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @returns {{ canvas: CanvasType; context: ReturnType<CanvasType["getContext"]> | null; }}
   */
  create(width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }
    const canvas = this._createCanvas(width, height);
    return {
      canvas,
      context: canvas.getContext("2d", {
        willReadFrequently: !this.#enableHWA,
      }),
    };
  }

  /**
   * @param {{ canvas: { width: any; height: any; }; }} canvasAndContext
   * @param {number} width
   * @param {number} height
   */
  reset(canvasAndContext, width, height) {
    if (!canvasAndContext.canvas) {
      throw new Error("Canvas is not specified");
    }
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid canvas size");
    }
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  /**
   * @param {{ canvas: { width: number; height: number; } | null; context: null; }} canvasAndContext
   */
  destroy(canvasAndContext) {
    if (!canvasAndContext.canvas) {
      throw new Error("Canvas is not specified");
    }
    // Zeroing the width and height cause Firefox to release graphics
    // resources immediately, which can greatly reduce memory consumption.
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }

  /**
   * @param {any} _width
   * @param {any} _height
   * @returns {CanvasType}
   */
  _createCanvas(_width, _height) {
    unreachable("Abstract method `_createCanvas` called.");
  }
}

/**
 * @extends {BaseCanvasFactory<HTMLCanvasElement>}
 */
class DOMCanvasFactory extends BaseCanvasFactory {
  constructor({ ownerDocument = globalThis.document, enableHWA = false }) {
    super({ enableHWA });
    this._document = ownerDocument;
  }

  /**
   * @ignore
   * @param {number} width
   * @param {number} height
   * @returns {HTMLCanvasElement}
   */
  _createCanvas(width, height) {
    const canvas = this._document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
}

export { BaseCanvasFactory, DOMCanvasFactory };
