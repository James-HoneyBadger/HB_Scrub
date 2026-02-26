/**
 * AVIF format handler.
 *
 * AVIF uses the same ISOBMFF container as HEIC/HEIF.  We delegate all
 * processing to the shared HEIC handler — the key differences (brand
 * 'avif' vs 'heic', profile box usage) do not affect metadata layout.
 *
 * Detection happens in detect.ts; this module exposes the public API so
 * AVIF can appear as a distinct 'avif' entry in SupportedFormat.
 */

import { heic } from './heic.js';
import type { RemoveOptions } from '../types.js';
import type { MetadataMap } from '../types.js';

export function remove(data: Uint8Array, options: RemoveOptions = {}): Uint8Array {
  return heic.remove(data, options);
}

export function getMetadataTypes(data: Uint8Array): string[] {
  return heic.getMetadataTypes(data);
}

export function read(data: Uint8Array): Partial<MetadataMap> {
  return heic.read(data);
}

export const avif = { remove, getMetadataTypes, read };
export default avif;
