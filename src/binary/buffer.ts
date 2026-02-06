/**
 * Check if data starts with a specific pattern
 */
export function startsWith(data: Uint8Array, pattern: Uint8Array | number[]): boolean {
  const patternArray = pattern instanceof Uint8Array ? pattern : new Uint8Array(pattern);
  if (data.length < patternArray.length) {
    return false;
  }
  for (let i = 0; i < patternArray.length; i++) {
    if (data[i] !== patternArray[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Concatenate multiple Uint8Arrays
 */
export function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Find a pattern in a Uint8Array
 */
export function indexOf(data: Uint8Array, pattern: Uint8Array | number[], startOffset = 0): number {
  const patternArray = pattern instanceof Uint8Array ? pattern : new Uint8Array(pattern);
  const maxOffset = data.length - patternArray.length;

  for (let i = startOffset; i <= maxOffset; i++) {
    let found = true;
    for (let j = 0; j < patternArray.length; j++) {
      if (data[i + j] !== patternArray[j]) {
        found = false;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return -1;
}

/**
 * Check if pattern exists at a specific offset
 */
export function matchesAt(
  data: Uint8Array,
  offset: number,
  pattern: Uint8Array | number[]
): boolean {
  const patternArray = pattern instanceof Uint8Array ? pattern : new Uint8Array(pattern);
  if (offset + patternArray.length > data.length) {
    return false;
  }
  for (let i = 0; i < patternArray.length; i++) {
    if (data[offset + i] !== patternArray[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Convert a string to Uint8Array using ASCII encoding
 */
export function fromAscii(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/**
 * Convert Uint8Array to ASCII string
 */
export function toAscii(data: Uint8Array, offset = 0, length?: number): string {
  const end = length !== undefined ? offset + length : data.length;
  let result = '';
  for (let i = offset; i < end && i < data.length; i++) {
    result += String.fromCharCode(data[i]!);
  }
  return result;
}
