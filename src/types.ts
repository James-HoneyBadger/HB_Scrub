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
 * Result of removeMetadata / removeMetadataSync
 */
export interface RemoveResult {
  data: Uint8Array;
  format: SupportedFormat;
  originalSize: number;
  cleanedSize: number;
  removedMetadata: string[];
  outputFormat?: SupportedFormat;
}

/**
 * Result of readMetadata()
 */
export interface ReadResult {
  metadata: MetadataMap;
  format: SupportedFormat;
  fileSize: number;
}

/**
 * Result of verifyClean()
 */
export interface VerifyResult {
  clean: boolean;
  format: SupportedFormat;
  remainingMetadata: string[];
}

/**
 * One file entry inside an AuditReport
 */
export interface AuditEntry {
  file: string;
  success: boolean;
  dryRun: boolean;
  format?: SupportedFormat;
  originalSize?: number;
  cleanedSize?: number;
  removedMetadata?: string[];
  outputPath?: string;
  error?: string;
}

/**
 * Aggregate report produced by processDir() / processGlob()
 */
export interface AuditReport {
  timestamp: string;
  totalFiles: number;
  successful: number;
  failed: number;
  skipped: number;
  totalOriginalBytes: number;
  totalCleanedBytes: number;
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
