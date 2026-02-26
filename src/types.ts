/**
 * Supported image/document formats for metadata removal
 */
export type SupportedFormat =
  | 'jpeg'
  | 'png'
  | 'webp'
  | 'gif'
  | 'svg'
  | 'tiff'
  | 'heic'
  | 'avif'
  | 'dng'
  | 'raw'
  | 'pdf'
  | 'mp4'
  | 'mov'
  | 'unknown';

/**
 * GPS precision levels for redaction (truncation instead of full removal)
 */
export type GpsRedactPrecision =
  | 'exact'   // keep full precision — no change
  | 'city'    // ±1 km  (~2 decimal degree places)
  | 'region'  // ±11 km (~1 decimal degree place)
  | 'country' // ±111 km (integer degree)
  | 'remove'; // strip GPS entirely (default)

/**
 * Named metadata field identifiers used by remove/keep options
 */
export type MetadataFieldName =
  | 'GPS'
  | 'EXIF'
  | 'XMP'
  | 'ICC Profile'
  | 'IPTC'
  | 'Copyright'
  | 'Orientation'
  | 'Make'
  | 'Model'
  | 'Software'
  | 'DateTime'
  | 'Artist'
  | 'Comment'
  | 'Adobe'
  | 'Thumbnail'
  | 'Title'
  | 'Description'
  | string;

/**
 * Fields to inject into the output after metadata removal
 */
export interface MetadataInjectOptions {
  copyright?: string;
  software?: string;
  artist?: string;
  imageDescription?: string;
  /** ISO 8601 or TIFF "YYYY:MM:DD HH:MM:SS" */
  dateTime?: string;
}

/**
 * GPS coordinates as decimal degrees
 */
export interface GpsCoordinates {
  /** Positive = North */
  latitude: number;
  /** Positive = East */
  longitude: number;
  altitude?: number;
  speed?: number;
  direction?: number;
  dateStamp?: string;
}

/**
 * Structured EXIF camera/exposure data
 */
export interface ExifData {
  dateTimeOriginal?: string;
  dateTimeDigitized?: string;
  exposureTime?: string;
  fNumber?: number;
  iso?: number;
  focalLength?: number;
  flash?: boolean;
  lensModel?: string;
  lensManufacturer?: string;
  colorSpace?: number;
  pixelWidth?: number;
  pixelHeight?: number;
  whiteBalance?: number;
  exposureMode?: number;
  exposureProgram?: number;
}

/**
 * Fully structured metadata for a file
 */
export interface MetadataMap {
  format: SupportedFormat;
  make?: string;
  model?: string;
  software?: string;
  imageDescription?: string;
  artist?: string;
  copyright?: string;
  dateTime?: string;
  orientation?: number;
  exif?: ExifData;
  gps?: GpsCoordinates;
  hasXmp?: boolean;
  hasIcc?: boolean;
  hasIptc?: boolean;
  hasThumbnail?: boolean;
  raw?: Record<string, unknown>;
}

/**
 * Options for the removeMetadata family of functions
 */
export interface RemoveOptions {
  // Legacy preserve flags
  preserveOrientation?: boolean;
  preserveColorProfile?: boolean;
  preserveCopyright?: boolean;
  preserveTitle?: boolean;
  preserveDescription?: boolean;

  /**
   * Selective denylist: remove ONLY these named fields.
   * Everything NOT listed is preserved automatically.
   */
  remove?: MetadataFieldName[];

  /**
   * Allowlist: always keep these fields, overriding remove/defaults.
   */
  keep?: MetadataFieldName[];

  /**
   * Truncate GPS coordinates instead of stripping them.
   * 'city' ≈ 1 km | 'region' ≈ 11 km | 'country' ≈ 111 km | 'remove' = strip (default)
   */
  gpsRedact?: GpsRedactPrecision;

  /**
   * Inject these fields into the cleaned output (JPEG, PNG).
   */
  inject?: MetadataInjectOptions;
}

/**
 * Result returned by `removeMetadata` / `removeMetadataSync`.
 */
export interface RemoveResult {
  /** Cleaned image/document bytes — write these to disk or a Blob. */
  data: Uint8Array;
  /** Detected input format. */
  format: SupportedFormat;
  /** Original file size in bytes. */
  originalSize: number;
  /** Cleaned file size in bytes. */
  cleanedSize: number;
  /** Names of metadata types that were removed (e.g. `['EXIF','GPS','XMP']`). */
  removedMetadata: string[];
  /**
   * Set when the output format differs from the input format.
   * Currently only set when a RAW file is converted to its embedded JPEG preview.
   */
  outputFormat?: SupportedFormat;
}

/**
 * Result returned by `readMetadata` / `readMetadataSync`.
 */
export interface ReadResult {
  /** Structured metadata extracted from the file. */
  metadata: MetadataMap;
  /** Detected file format. */
  format: SupportedFormat;
  /** File size in bytes. */
  fileSize: number;
}

/**
 * Result returned by `verifyClean` / `verifyCleanSync`.
 */
export interface VerifyResult {
  /** `true` when no known metadata types were detected. */
  clean: boolean;
  /** Detected file format. */
  format: SupportedFormat;
  /** Metadata type names still present (empty when `clean` is `true`). */
  remainingMetadata: string[];
}

/**
 * One file entry inside an `AuditReport`.
 * Produced for every file attempted by `processDir` / `processFiles`.
 */
export interface AuditEntry {
  /** Absolute input path. */
  file: string;
  /** Whether the file was processed successfully. */
  success: boolean;
  /** `true` when the run was a dry-run — no bytes were written. */
  dryRun: boolean;
  format?: SupportedFormat;
  originalSize?: number;
  cleanedSize?: number;
  /** Metadata type names that were removed. */
  removedMetadata?: string[];
  /** Absolute path of the output file (absent for dry-runs). */
  outputPath?: string;
  /** Error message when `success` is `false`. */
  error?: string;
}

/**
 * Aggregate report produced by `processDir()` / `processFiles()`.
 * Suitable for writing to a JSON file for audit trails.
 */
export interface AuditReport {
  /** ISO 8601 timestamp of when the run started. */
  timestamp: string;
  totalFiles: number;
  successful: number;
  failed: number;
  /** Files skipped because of `dryRun: true` or `skipExisting: true`. */
  skipped: number;
  totalOriginalBytes: number;
  totalCleanedBytes: number;
  /** Bytes removed across all files (`totalOriginalBytes − totalCleanedBytes`). */
  totalBytesRemoved: number;
  entries: AuditEntry[];
}

/**
 * Options for batch / directory processing
 */
export interface BatchOptions extends RemoveOptions {
  inPlace?: boolean;
  outputDir?: string;
  suffix?: string;
  concurrency?: number;
  skipExisting?: boolean;
  dryRun?: boolean;
  backupSuffix?: string;
  include?: string[];
  exclude?: string[];
}

/**
 * Result of processDir() / processGlob()
 */
export interface BatchResult {
  successful: AuditEntry[];
  failed: AuditEntry[];
  report: AuditReport;
}
