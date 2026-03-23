declare module "zstd-decompression-stream" {
  export class ZstdDecompressionStream extends TransformStream<Uint8Array, Uint8Array> {
    constructor();
  }
}
