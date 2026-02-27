import { RemoveOptions } from '../types.js';
import { CorruptedFileError } from '../errors.js';
import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';
import { FILE_SIGNATURES } from '../signatures.js';
import { parseGpsIfd, parseExifIfd, readEntryValue } from '../exif/reader.js';
import type { MetadataMap } from '../types.js';

/**
 * Tags to remove (metadata-related)
 */
const TAGS_TO_REMOVE: Set<number> = new Set([
  270, // ImageDescription
  271, // Make
  272, // Model
  274, // Orientation — removed by default; preserved if preserveOrientation is set
  305, // Software
  306, // DateTime
  315, // Artist
  33432, // Copyright
  34665, // ExifIFDPointer - Remove entire EXIF IFD
  34853, // GPSInfoIFDPointer - Remove entire GPS IFD
  34675, // ICCProfile — removed by default; preserved if preserveColorProfile is set
  700, // XMP
]);

/**
 * Tags to optionally keep
 */
const OPTIONAL_KEEP_TAGS = {
  orientation: 274, // Orientation
  iccProfile: 34675, // ICCProfile
  copyright: 33432, // Copyright
};

/**
 * TIFF IFD entry structure
 */
interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  valueOffset: number; // Or inline value if fits in 4 bytes
  rawValueBytes: Uint8Array; // Original 4 bytes
}

/**
 * TIFF type sizes
 */
const TYPE_SIZES: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  6: 1, // SBYTE
  7: 1, // UNDEFINED
  8: 2, // SSHORT
  9: 4, // SLONG
  10: 8, // SRATIONAL
  11: 4, // FLOAT
  12: 8, // DOUBLE
};

/**
 * Parse TIFF header
 */
function parseHeader(data: Uint8Array): { littleEndian: boolean; ifdOffset: number } {
  if (data.length < 8) {
    throw new CorruptedFileError('File too small to be a valid TIFF');
  }

  let littleEndian: boolean;
  if (buffer.startsWith(data, FILE_SIGNATURES.TIFF_LE)) {
    littleEndian = true;
  } else if (buffer.startsWith(data, FILE_SIGNATURES.TIFF_BE)) {
    littleEndian = false;
  } else {
    throw new CorruptedFileError('Invalid TIFF: missing TIFF signature');
  }

  const ifdOffset = dataview.readUint32(data, 4, littleEndian);

  return { littleEndian, ifdOffset };
}

/**
 * Parse IFD entries
 */
function parseIfd(
  data: Uint8Array,
  offset: number,
  littleEndian: boolean
): { entries: IfdEntry[]; nextIfdOffset: number } {
  if (offset + 2 > data.length) {
    throw new CorruptedFileError('Invalid TIFF: truncated IFD', offset);
  }

  const numEntries = dataview.readUint16(data, offset, littleEndian);
  offset += 2;

  const entries: IfdEntry[] = [];

  for (let i = 0; i < numEntries; i++) {
    if (offset + 12 > data.length) {
      throw new CorruptedFileError('Invalid TIFF: truncated IFD entry', offset);
    }

    const tag = dataview.readUint16(data, offset, littleEndian);
    const type = dataview.readUint16(data, offset + 2, littleEndian);
    const count = dataview.readUint32(data, offset + 4, littleEndian);
    const rawValueBytes = data.slice(offset + 8, offset + 12);
    const valueOffset = dataview.readUint32(data, offset + 8, littleEndian);

    entries.push({ tag, type, count, valueOffset, rawValueBytes });
    offset += 12;
  }

  // Next IFD offset
  let nextIfdOffset = 0;
  if (offset + 4 <= data.length) {
    nextIfdOffset = dataview.readUint32(data, offset, littleEndian);
  }

  return { entries, nextIfdOffset };
}

/**
 * Zero out a sub-IFD and all the data it references.
 * Used to erase EXIF and GPS sub-IFD bodies after their pointer tags are removed.
 */
function zeroSubIfd(result: Uint8Array, ifdOffset: number, littleEndian: boolean): void {
  if (ifdOffset === 0 || ifdOffset + 2 > result.length) {
    return;
  }
  try {
    const numEntries = dataview.readUint16(result, ifdOffset, littleEndian);
    if (numEntries > 512) {
      return; // sanity limit for corrupt data
    }

    // Zero non-inline value data referenced from each entry
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      if (entryOffset + 12 > result.length) {
        break;
      }

      const type = dataview.readUint16(result, entryOffset + 2, littleEndian);
      const count = dataview.readUint32(result, entryOffset + 4, littleEndian);
      const typeSize = TYPE_SIZES[type] ?? 1;
      const valueSize = typeSize * count;

      if (valueSize > 4) {
        const valueOffset = dataview.readUint32(result, entryOffset + 8, littleEndian);
        const end = Math.min(valueOffset + valueSize, result.length);
        for (let j = valueOffset; j < end; j++) {
          result[j] = 0;
        }
      }
    }

    // Zero the IFD structure itself (entries + next-IFD pointer)
    const ifdEnd = Math.min(ifdOffset + 2 + numEntries * 12 + 4, result.length);
    for (let i = ifdOffset; i < ifdEnd; i++) {
      result[i] = 0;
    }
  } catch {
    // Ignore errors for malformed sub-IFDs
  }
}

/**
 * Check if tag should be kept
 */
function shouldKeepTag(tag: number, options: RemoveOptions): boolean {
  // Keep orientation if requested
  if (tag === OPTIONAL_KEEP_TAGS.orientation && options.preserveOrientation === true) {
    return true;
  }

  // Keep ICC profile if requested
  if (tag === OPTIONAL_KEEP_TAGS.iccProfile && options.preserveColorProfile === true) {
    return true;
  }

  // Keep copyright if requested
  if (tag === OPTIONAL_KEEP_TAGS.copyright && options.preserveCopyright === true) {
    return true;
  }

  // Remove known metadata tags
  if (TAGS_TO_REMOVE.has(tag)) {
    return false;
  }

  // Keep everything else (image data tags)
  return true;
}

/**
 * Get value size for an IFD entry
 */
function getValueSize(entry: IfdEntry): number {
  const typeSize = TYPE_SIZES[entry.type] ?? 1;
  return typeSize * entry.count;
}

/**
 * Check if value is stored inline (fits in 4 bytes)
 */
function isInlineValue(entry: IfdEntry): boolean {
  return getValueSize(entry) <= 4;
}

/**
 * Remove metadata from TIFF image
 *
 * Uses in-place modification: copies the file, rewrites IFD0 with only
 * kept entries, and zeros out removed metadata data. This preserves all
 * existing offsets (strip data, tile data, subsequent IFDs, SubIFDs).
 */
export function remove(data: Uint8Array, options: RemoveOptions = {}): Uint8Array {
  const { littleEndian, ifdOffset } = parseHeader(data);
  const ifd0 = parseIfd(data, ifdOffset, littleEndian);

  const removedEntries: IfdEntry[] = [];
  const filteredEntries = ifd0.entries.filter(entry => {
    const keep = shouldKeepTag(entry.tag, options);
    if (!keep) {
      removedEntries.push(entry);
    }
    return keep;
  });

  // If nothing was filtered, return a copy
  if (removedEntries.length === 0) {
    return new Uint8Array(data);
  }

  // Make a copy to modify in-place
  const result = new Uint8Array(data);

  // Zero out data for removed entries (erase metadata content)
  for (const entry of removedEntries) {
    if (!isInlineValue(entry)) {
      const valueSize = getValueSize(entry);
      const start = entry.valueOffset;
      const end = Math.min(start + valueSize, result.length);
      for (let i = start; i < end; i++) {
        result[i] = 0;
      }
    } else if (entry.tag === 34665 || entry.tag === 34853) {
      // Pointer tags (ExifIFD, GPSInfoIFD) store the sub-IFD offset as an inline
      // 4-byte LONG value. Without zeroing the pointed-to IFD the metadata remains
      // in the file body even though the pointer tag is gone.
      zeroSubIfd(result, entry.valueOffset, littleEndian);
    }
  }

  // Rewrite IFD0 in-place with only kept entries
  // The new IFD is smaller or equal so it always fits at the same location.
  let pos = ifdOffset;
  dataview.writeUint16(result, pos, filteredEntries.length, littleEndian);
  pos += 2;

  for (const entry of filteredEntries) {
    dataview.writeUint16(result, pos, entry.tag, littleEndian);
    dataview.writeUint16(result, pos + 2, entry.type, littleEndian);
    dataview.writeUint32(result, pos + 4, entry.count, littleEndian);
    result.set(entry.rawValueBytes, pos + 8);
    pos += 12;
  }

  // Preserve the original next IFD offset (keeps secondary IFDs intact)
  dataview.writeUint32(result, pos, ifd0.nextIfdOffset, littleEndian);
  pos += 4;

  // Zero out remaining space from the old (larger) IFD entries
  const originalIfdEnd = ifdOffset + 2 + ifd0.entries.length * 12 + 4;
  for (let i = pos; i < originalIfdEnd; i++) {
    result[i] = 0;
  }

  return result;
}

/**
 * Get human-readable tag name
 */
function getTagName(tag: number): string {
  const names: Record<number, string> = {
    270: 'ImageDescription',
    271: 'Make',
    272: 'Model',
    274: 'Orientation',
    305: 'Software',
    306: 'DateTime',
    315: 'Artist',
    700: 'XMP',
    33432: 'Copyright',
    34665: 'EXIF',
    34675: 'ICC Profile',
    34853: 'GPS',
  };
  return names[tag] ?? `Tag ${tag}`;
}

/**
 * Get list of metadata types present in the image
 */
export function getMetadataTypes(data: Uint8Array): string[] {
  const { littleEndian, ifdOffset } = parseHeader(data);
  const ifd0 = parseIfd(data, ifdOffset, littleEndian);

  const types: string[] = [];

  for (const entry of ifd0.entries) {
    if (TAGS_TO_REMOVE.has(entry.tag)) {
      types.push(getTagName(entry.tag));
    }
  }

  return [...new Set(types)];
}

/**
 * Read structured metadata from a TIFF image without modifying it.
 */
export function read(data: Uint8Array): Partial<MetadataMap> {
  const out: Partial<MetadataMap> = {};
  try {
    const { littleEndian: le, ifdOffset } = parseHeader(data);
    const { entries } = parseIfd(data, ifdOffset, le);

    const str = (tag: number) => {
      const e = entries.find(x => x.tag === tag);
      if (!e) {
        return undefined;
      }
      return readEntryValue(data, e, le) as string | undefined;
    };
    const num = (tag: number) => {
      const e = entries.find(x => x.tag === tag);
      if (!e) {
        return undefined;
      }
      return readEntryValue(data, e, le) as number | undefined;
    };

    const make = str(271);
    if (make) {
      out.make = make;
    }
    const model = str(272);
    if (model) {
      out.model = model;
    }
    const software = str(305);
    if (software) {
      out.software = software;
    }
    const desc = str(270);
    if (desc) {
      out.imageDescription = desc;
    }
    const artist = str(315);
    if (artist) {
      out.artist = artist;
    }
    const copy = str(33432);
    if (copy) {
      out.copyright = copy;
    }
    const dt = str(306);
    if (dt) {
      out.dateTime = dt;
    }
    const orient = num(274);
    if (orient !== undefined) {
      out.orientation = orient;
    }
    if (entries.find(x => x.tag === 34675)) {
      out.hasIcc = true;
    }
    if (entries.find(x => x.tag === 700)) {
      out.hasXmp = true;
    }

    const exifPtr = entries.find(x => x.tag === 34665);
    if (exifPtr && !isInlineValue(exifPtr)) {
      out.exif = parseExifIfd(data, exifPtr.valueOffset, le);
    }
    const gpsPtr = entries.find(x => x.tag === 34853);
    if (gpsPtr && !isInlineValue(gpsPtr)) {
      const gps = parseGpsIfd(data, gpsPtr.valueOffset, le);
      if (gps) {
        out.gps = gps;
      }
    }
  } catch {
    /* ignore corrupt files */
  }
  return out;
}

export const tiff = {
  remove,
  getMetadataTypes,
  parseHeader,
  parseIfd,
  read,
};

export default tiff;
