/**
 * Base error class for picscrub errors
 */
export class PicscrubError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PicscrubError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the input data is not a valid image format
 */
export class InvalidFormatError extends PicscrubError {
  constructor(message = 'Invalid or unsupported image format') {
    super(message);
    this.name = 'InvalidFormatError';
  }
}

/**
 * Thrown when the image file is corrupted or malformed
 */
export class CorruptedFileError extends PicscrubError {
  public readonly offset: number | undefined;

  constructor(message: string, offset?: number) {
    super(offset !== undefined ? `${message} at offset ${offset}` : message);
    this.name = 'CorruptedFileError';
    this.offset = offset;
  }
}

/**
 * Thrown when attempting to read beyond buffer bounds
 */
export class BufferOverflowError extends PicscrubError {
  public readonly requested: number;
  public readonly available: number;

  constructor(requested: number, available: number) {
    super(`Buffer overflow: requested ${requested} bytes but only ${available} available`);
    this.name = 'BufferOverflowError';
    this.requested = requested;
    this.available = available;
  }
}

/**
 * Thrown when an unsupported format is encountered
 */
export class UnsupportedFormatError extends PicscrubError {
  public readonly format: string;

  constructor(format: string) {
    super(`Unsupported format: ${format}`);
    this.name = 'UnsupportedFormatError';
    this.format = format;
  }
}

/**
 * Thrown when HEIC processing fails
 */
export class HeicProcessingError extends PicscrubError {
  constructor(message: string) {
    super(`HEIC processing error: ${message}`);
    this.name = 'HeicProcessingError';
  }
}

/**
 * Thrown when SVG parsing fails
 */
export class SvgParseError extends PicscrubError {
  constructor(message: string) {
    super(`SVG parse error: ${message}`);
    this.name = 'SvgParseError';
  }
}
