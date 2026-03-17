/**
 * Plugin/Format Extension API
 *
 * Allows third-party code to register custom format handlers without forking.
 *
 * @example
 * ```typescript
 * import { registerFormat } from 'hb-scrub';
 *
 * registerFormat('psd', {
 *   detect: (data) => data[0] === 0x38 && data[1] === 0x42,
 *   remove: (data, options) => strippedData,
 *   getMetadataTypes: (data) => ['XMP', 'IPTC'],
 *   read: (data) => ({ software: 'Photoshop' }),
 * });
 * ```
 */

import type { RemoveOptions, MetadataMap } from './types.js';

/**
 * A custom format handler that plugins must implement.
 */
export interface FormatPlugin {
  /** Return true if `data` matches this format (magic bytes check). */
  detect: (data: Uint8Array) => boolean;
  /** Remove metadata and return cleaned bytes. */
  remove: (data: Uint8Array, options: RemoveOptions) => Uint8Array;
  /** Return names of metadata types present in the file. */
  getMetadataTypes: (data: Uint8Array) => string[];
  /** Read structured metadata (optional). */
  read?: (data: Uint8Array) => Partial<MetadataMap>;
}

/** Internal registry: format name → plugin. */
const pluginRegistry = new Map<string, FormatPlugin>();

/**
 * Register a custom format handler.
 *
 * @param name    A short identifier (e.g. `'psd'`). Must not collide with a
 *                built-in format unless you intend to override it.
 * @param plugin  The handler implementation.
 */
export function registerFormat(name: string, plugin: FormatPlugin): void {
  if (!name || typeof name !== 'string') {
    throw new Error('registerFormat: name must be a non-empty string');
  }
  if (!plugin || typeof plugin.detect !== 'function' || typeof plugin.remove !== 'function' || typeof plugin.getMetadataTypes !== 'function') {
    throw new Error('registerFormat: plugin must implement detect, remove, and getMetadataTypes');
  }
  pluginRegistry.set(name.toLowerCase(), plugin);
}

/**
 * Unregister a previously registered format plugin.
 */
export function unregisterFormat(name: string): boolean {
  return pluginRegistry.delete(name.toLowerCase());
}

/**
 * Try to detect format using registered plugins.
 * Returns the plugin name and handler, or null if no plugin matches.
 */
export function detectPlugin(data: Uint8Array): { name: string; plugin: FormatPlugin } | null {
  for (const [name, plugin] of pluginRegistry) {
    try {
      if (plugin.detect(data)) {
        return { name, plugin };
      }
    } catch {
      // Skip broken plugins
    }
  }
  return null;
}

/**
 * Get a registered plugin by name.
 */
export function getPlugin(name: string): FormatPlugin | undefined {
  return pluginRegistry.get(name.toLowerCase());
}

/**
 * List all registered plugin format names.
 */
export function getRegisteredFormats(): string[] {
  return [...pluginRegistry.keys()];
}
