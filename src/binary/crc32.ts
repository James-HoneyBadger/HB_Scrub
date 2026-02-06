/**
 * CRC32 lookup table (IEEE polynomial)
 */
const CRC32_TABLE: Uint32Array = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[i] = c;
  }
  return table;
})();

/**
 * Calculate CRC32 checksum for a Uint8Array
 */
export function crc32(data: Uint8Array, initial = 0xffffffff): number {
  let crc = initial;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    crc = CRC32_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Calculate CRC32 for PNG chunks (includes chunk type + data)
 * Uses incremental computation to avoid allocating a combined buffer.
 */
export function crc32Png(chunkType: Uint8Array, chunkData: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < chunkType.length; i++) {
    crc = CRC32_TABLE[(crc ^ chunkType[i]!) & 0xff]! ^ (crc >>> 8);
  }
  for (let i = 0; i < chunkData.length; i++) {
    crc = CRC32_TABLE[(crc ^ chunkData[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
