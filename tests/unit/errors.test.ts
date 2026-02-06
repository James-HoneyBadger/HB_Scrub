import { describe, it, expect } from 'vitest';
import {
  PicscrubError,
  InvalidFormatError,
  CorruptedFileError,
  UnsupportedFormatError,
  SvgParseError,
  HeicProcessingError,
  BufferOverflowError,
} from '../../src/errors';

describe('Error Classes', () => {
  describe('PicscrubError', () => {
    it('should be the base error class', () => {
      const error = new PicscrubError('test message');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('PicscrubError');
      expect(error.message).toBe('test message');
    });
  });

  describe('InvalidFormatError', () => {
    it('should use default message when none provided', () => {
      const error = new InvalidFormatError();

      expect(error).toBeInstanceOf(PicscrubError);
      expect(error.name).toBe('InvalidFormatError');
      expect(error.message).toBe('Invalid or unsupported image format');
    });

    it('should use custom message when provided', () => {
      const error = new InvalidFormatError('Custom error message');

      expect(error.message).toBe('Custom error message');
    });
  });

  describe('CorruptedFileError', () => {
    it('should include offset in message when provided', () => {
      const error = new CorruptedFileError('File is corrupted', 1024);

      expect(error).toBeInstanceOf(PicscrubError);
      expect(error.name).toBe('CorruptedFileError');
      expect(error.message).toBe('File is corrupted at offset 1024');
    });

    it('should have offset property', () => {
      const error = new CorruptedFileError('File is corrupted', 512);

      expect(error.offset).toBe(512);
    });

    it('should work without offset', () => {
      const error = new CorruptedFileError('File is corrupted');

      expect(error.message).toBe('File is corrupted');
      expect(error.offset).toBeUndefined();
    });
  });

  describe('UnsupportedFormatError', () => {
    it('should include format in message', () => {
      const error = new UnsupportedFormatError('bmp');

      expect(error).toBeInstanceOf(PicscrubError);
      expect(error.name).toBe('UnsupportedFormatError');
      expect(error.message).toBe('Unsupported format: bmp');
    });

    it('should have format property', () => {
      const error = new UnsupportedFormatError('psd');

      expect(error.format).toBe('psd');
    });
  });

  describe('SvgParseError', () => {
    it('should prefix message with "SVG parse error:"', () => {
      const error = new SvgParseError('invalid XML structure');

      expect(error).toBeInstanceOf(PicscrubError);
      expect(error.name).toBe('SvgParseError');
      expect(error.message).toBe('SVG parse error: invalid XML structure');
    });
  });

  describe('HeicProcessingError', () => {
    it('should prefix message with "HEIC processing error:"', () => {
      const error = new HeicProcessingError('decoder not loaded');

      expect(error).toBeInstanceOf(PicscrubError);
      expect(error.name).toBe('HeicProcessingError');
      expect(error.message).toBe('HEIC processing error: decoder not loaded');
    });
  });

  describe('BufferOverflowError', () => {
    it('should include requested and available bytes in message', () => {
      const error = new BufferOverflowError(100, 50);

      expect(error).toBeInstanceOf(PicscrubError);
      expect(error.name).toBe('BufferOverflowError');
      expect(error.message).toBe('Buffer overflow: requested 100 bytes but only 50 available');
    });

    it('should have requested and available properties', () => {
      const error = new BufferOverflowError(200, 100);

      expect(error.requested).toBe(200);
      expect(error.available).toBe(100);
    });
  });
});
