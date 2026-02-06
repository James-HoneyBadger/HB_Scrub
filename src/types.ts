/**
 * Supported image formats for metadata removal
 */
export type SupportedFormat =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'svg'
  | 'tiff'
  | 'heic'
  | 'dng'
  | 'raw'
  | 'unknown';

/**
 * Options for metadata removal
 */
export interface RemoveOptions {
  /** Keep EXIF orientation tag (rotation info) */
  preserveOrientation?: boolean;
  /** Keep ICC color profile */
  preserveColorProfile?: boolean;
  /** Keep copyright notice */
  preserveCopyright?: boolean;
  /** SVG: Keep <title> element */
  preserveTitle?: boolean;
  /** SVG: Keep <desc> element */
  preserveDescription?: boolean;
}

/**
 * Result of metadata removal operation
 */
export interface RemoveResult {
  /** Cleaned image data */
  data: Uint8Array;
  /** Detected format */
  format: SupportedFormat;
  /** Original file size in bytes */
  originalSize: number;
  /** Cleaned file size in bytes */
  cleanedSize: number;
  /** List of removed metadata types */
  removedMetadata: string[];
  /** When the output format differs from input (e.g., RAW → JPEG preview) */
  outputFormat?: SupportedFormat;
}
