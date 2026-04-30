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
  /**
   * Detection priority (higher value = checked first).
   * Built-in formats are at priority 0; plugins default to 10.
   * Use a higher value to override a built-in handler.
   */
  priority?: number;
}

/** Options for registerFormat. */
export interface RegisterFormatOptions {
  /**
   * Called when the plugin's remove() or detect() throws an error.
   * Defaults to silently swallowing errors (existing behaviour).
   */
  onError?: (err: unknown) => void;
  /** Suppress the console warning when overwriting an existing plugin. */
  silent?: boolean;
}

/** Internal registry: format name → { plugin, onError }. */
const pluginRegistry = new Map<string, { plugin: FormatPlugin; onError?: (err: unknown) => void }>();

/**
 * Register a custom format handler.
 *
 * @param name    A short identifier (e.g. `'psd'`). Must not collide with a
 *                built-in format unless you intend to override it.
 * @param plugin  The handler implementation.
 * @param opts    Optional registration options (onError, silent).
 */
export function registerFormat(
  name: string,
  plugin: FormatPlugin,
  opts: RegisterFormatOptions = {}
): void {
  if (!name || typeof name !== 'string') {
    throw new Error('registerFormat: name must be a non-empty string');
  }
  if (
    !plugin ||
    typeof plugin.detect !== 'function' ||
    typeof plugin.remove !== 'function' ||
    typeof plugin.getMetadataTypes !== 'function'
  ) {
    throw new Error('registerFormat: plugin must implement detect, remove, and getMetadataTypes');
  }
  const key = name.toLowerCase();
  if (pluginRegistry.has(key) && !opts.silent) {
    console.warn(`hb-scrub: registerFormat('${key}') overwrites an existing plugin`);
  }
  pluginRegistry.set(key, { plugin, ...(opts.onError !== undefined && { onError: opts.onError }) });
}

/**
 * Unregister a previously registered format plugin.
 */
export function unregisterFormat(name: string): boolean {
  return pluginRegistry.delete(name.toLowerCase());
}

/**
 * Unregister all registered plugins (useful in tests).
 */
export function clearAllPlugins(): void {
  pluginRegistry.clear();
}

/**
 * Register multiple format handlers at once.
 *
 * @param plugins  A record mapping format name to plugin + options.
 * @example
 * ```ts
 * registerFormats({
 *   psd: { plugin: psdHandler },
 *   xcf: { plugin: xcfHandler, onError: console.warn },
 * });
 * ```
 */
export function registerFormats(
  plugins: Record<string, FormatPlugin | { plugin: FormatPlugin } & RegisterFormatOptions>
): void {
  for (const [name, entry] of Object.entries(plugins)) {
    if (typeof (entry as { plugin?: unknown }).plugin === 'object' && (entry as { plugin?: unknown }).plugin !== null) {
      const { plugin, ...opts } = entry as { plugin: FormatPlugin } & RegisterFormatOptions;
      registerFormat(name, plugin, opts);
    } else {
      registerFormat(name, entry as FormatPlugin);
    }
  }
}

/**
 * Try to detect format using registered plugins.
 * Returns the plugin name and handler, or null if no plugin matches.
 * Plugins are checked in descending priority order (highest priority first).
 */
export function detectPlugin(data: Uint8Array): { name: string; plugin: FormatPlugin } | null {
  // Sort entries by priority (descending) for deterministic ordering.
  const sorted = [...pluginRegistry.entries()].sort(
    ([, a], [, b]) => (b.plugin.priority ?? 10) - (a.plugin.priority ?? 10)
  );
  for (const [name, { plugin, onError }] of sorted) {
    try {
      if (plugin.detect(data)) {
        return { name, plugin };
      }
    } catch (err) {
      if (onError) {
        onError(err);
      }
      // Otherwise skip broken plugin silently
    }
  }
  return null;
}

/**
 * Get a registered plugin by name.
 */
export function getPlugin(name: string): FormatPlugin | undefined {
  return pluginRegistry.get(name.toLowerCase())?.plugin;
}

/**
 * List all registered plugin format names.
 */
export function getRegisteredFormats(): string[] {
  return [...pluginRegistry.keys()];
}
