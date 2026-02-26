import { RemoveOptions } from '../types.js';
import { HeicProcessingError } from '../errors.js';
import * as buffer from '../binary/buffer.js';
import * as dataview from '../binary/dataview.js';

/**
 * HEIC/HEIF uses ISOBMFF (ISO Base Media File Format)
 * Instead of removing metadata (which requires complex offset recalculation),
 * we OVERWRITE metadata with zeros within known box structures only.
 * This preserves file structure and avoids corrupting compressed image data.
 */

/**
 * HEIC box structure
 */
interface HeicBox {
  type: string;
  offset: number;
  size: number;
  headerSize: number;
  dataOffset: number;
  dataSize: number;
}

/**
 * Parse box header at offset
 */
function parseBoxHeader(
  data: Uint8Array,
  offset: number
): { type: string; size: number; headerSize: number } | null {
  if (offset + 8 > data.length) {
    return null;
  }

  let size = dataview.readUint32BE(data, offset);
  const type = buffer.toAscii(data, offset + 4, 4);
  let headerSize = 8;

  // Extended size (64-bit)
  if (size === 1) {
    if (offset + 16 > data.length) {
      return null;
    }
    // Read 64-bit size (safe up to 2^53)
    const highBits = dataview.readUint32BE(data, offset + 8);
    const lowBits = dataview.readUint32BE(data, offset + 12);
    size = highBits * 0x100000000 + lowBits;
    headerSize = 16;
  } else if (size === 0) {
    // Box extends to end of file
    size = data.length - offset;
  }

  return { type, size, headerSize };
}

/**
 * Parse all top-level boxes
 */
function parseBoxes(data: Uint8Array): HeicBox[] {
  const boxes: HeicBox[] = [];
  let offset = 0;

  while (offset < data.length) {
    const header = parseBoxHeader(data, offset);
    if (!header) {
      break;
    }

    boxes.push({
      type: header.type,
      offset,
      size: header.size,
      headerSize: header.headerSize,
      dataOffset: offset + header.headerSize,
      dataSize: header.size - header.headerSize,
    });

    offset += header.size;
  }

  return boxes;
}

/**
 * Parse boxes within a container box
 */
function parseContainerBox(data: Uint8Array, parent: HeicBox): HeicBox[] {
  const boxes: HeicBox[] = [];
  let offset = parent.dataOffset;
  const end = parent.offset + parent.size;

  // Some containers have additional header bytes (e.g., meta has version + flags)
  if (parent.type === 'meta') {
    offset += 4; // Skip version (1) + flags (3)
  }

  while (offset < end) {
    const header = parseBoxHeader(data, offset);
    if (!header || header.size === 0 || offset + header.size > end) {
      break;
    }

    boxes.push({
      type: header.type,
      offset,
      size: header.size,
      headerSize: header.headerSize,
      dataOffset: offset + header.headerSize,
      dataSize: header.size - header.headerSize,
    });

    offset += header.size;
  }

  return boxes;
}

/**
 * Read a size value from data at offset, with the given byte size (0, 4, or 8)
 */
function readSizedValue(data: Uint8Array, offset: number, size: number): number {
  if (size === 4) {
    return dataview.readUint32BE(data, offset);
  } else if (size === 8) {
    const hi = dataview.readUint32BE(data, offset);
    const lo = dataview.readUint32BE(data, offset + 4);
    return hi * 0x100000000 + lo;
  }
  return 0;
}

/**
 * Find metadata item IDs by parsing the iinf (item information) box.
 * Returns separate sets for EXIF and XMP items.
 */
function findMetadataItemIds(
  data: Uint8Array,
  metaChildren: HeicBox[]
): { exifIds: Set<number>; xmpIds: Set<number> } {
  const exifIds = new Set<number>();
  const xmpIds = new Set<number>();

  const iinfBox = metaChildren.find(b => b.type === 'iinf');
  if (!iinfBox) {
    return { exifIds, xmpIds };
  }

  let offset = iinfBox.dataOffset;
  const end = iinfBox.offset + iinfBox.size;
  if (offset + 4 > data.length) {
    return { exifIds, xmpIds };
  }

  const version = data[offset]!;
  offset += 4; // skip version (1) + flags (3)

  // entry count
  if (version === 0) {
    if (offset + 2 > data.length) {
      return { exifIds, xmpIds };
    }
    offset += 2; // uint16 count
  } else {
    if (offset + 4 > data.length) {
      return { exifIds, xmpIds };
    }
    offset += 4; // uint32 count
  }

  // Parse infe (item info entry) boxes
  while (offset < end) {
    const header = parseBoxHeader(data, offset);
    if (!header) {
      break;
    }
    if (offset + header.size > end) {
      break;
    }

    if (header.type === 'infe') {
      const infeData = offset + header.headerSize;
      if (infeData + 4 > data.length) {
        offset += header.size;
        continue;
      }

      const infeVersion = data[infeData]!;
      // skip version (1) + flags (3)
      const base = infeData + 4;

      if (infeVersion >= 2 && base + 8 <= data.length) {
        // v2+: item_id (2 bytes), item_protection_index (2 bytes), item_type (4 bytes)
        const itemId = dataview.readUint16BE(data, base);
        const itemType = buffer.toAscii(data, base + 4, 4);
        if (itemType === 'Exif') {
          exifIds.add(itemId);
        } else if (itemType === 'mime') {
          // Check if this is an XMP item by looking for "application/rdf+xml" after the item_type
          const afterType = base + 8;
          const remaining = buffer.toAscii(data, afterType, Math.min(40, data.length - afterType));
          if (remaining.includes('application/rdf+xml')) {
            xmpIds.add(itemId);
          }
        }
      }
    }

    offset += header.size;
  }

  return { exifIds, xmpIds };
}

/**
 * Find byte locations for given item IDs by parsing the iloc (item location) box
 */
function findItemLocations(
  data: Uint8Array,
  metaChildren: HeicBox[],
  targetIds: Set<number>
): Array<{ offset: number; length: number }> {
  const locations: Array<{ offset: number; length: number }> = [];
  if (targetIds.size === 0) {
    return locations;
  }

  const ilocBox = metaChildren.find(b => b.type === 'iloc');
  if (!ilocBox) {
    return locations;
  }

  let offset = ilocBox.dataOffset;
  if (offset + 8 > data.length) {
    return locations;
  }

  const version = data[offset]!;
  offset += 4; // skip version + flags

  // Size fields: offset_size (4 bits), length_size (4 bits), base_offset_size (4 bits), index_size (4 bits for v1/v2)
  const sizeByte1 = data[offset]!;
  const sizeByte2 = data[offset + 1]!;
  const offsetSize = (sizeByte1 >> 4) & 0x0f;
  const lengthSize = sizeByte1 & 0x0f;
  const baseOffsetSize = (sizeByte2 >> 4) & 0x0f;
  const indexSize = version >= 1 ? sizeByte2 & 0x0f : 0;
  offset += 2;

  // Item count
  let itemCount: number;
  if (version < 2) {
    if (offset + 2 > data.length) {
      return locations;
    }
    itemCount = dataview.readUint16BE(data, offset);
    offset += 2;
  } else {
    if (offset + 4 > data.length) {
      return locations;
    }
    itemCount = dataview.readUint32BE(data, offset);
    offset += 4;
  }

  const ilocEnd = ilocBox.offset + ilocBox.size;

  for (let i = 0; i < itemCount && offset < ilocEnd; i++) {
    // item_id
    let itemId: number;
    if (version < 2) {
      if (offset + 2 > data.length) {
        break;
      }
      itemId = dataview.readUint16BE(data, offset);
      offset += 2;
    } else {
      if (offset + 4 > data.length) {
        break;
      }
      itemId = dataview.readUint32BE(data, offset);
      offset += 4;
    }

    // construction_method (v1/v2 only, 2 bytes)
    if (version >= 1) {
      offset += 2;
    }

    // data_reference_index (2 bytes)
    offset += 2;

    // base_offset
    const baseOffset = readSizedValue(data, offset, baseOffsetSize);
    offset += baseOffsetSize;

    // extent_count (2 bytes)
    if (offset + 2 > data.length) {
      break;
    }
    const extentCount = dataview.readUint16BE(data, offset);
    offset += 2;

    for (let ext = 0; ext < extentCount; ext++) {
      // extent_index (v1/v2 with index_size)
      if (version >= 1) {
        offset += indexSize;
      }

      if (offset + offsetSize + lengthSize > data.length) {
        break;
      }

      const extentOffset = readSizedValue(data, offset, offsetSize);
      offset += offsetSize;

      const extentLength = readSizedValue(data, offset, lengthSize);
      offset += lengthSize;

      if (targetIds.has(itemId)) {
        const finalOffset = baseOffset + extentOffset;
        if (finalOffset + extentLength <= data.length && extentLength > 0) {
          locations.push({ offset: finalOffset, length: extentLength });
        }
      }
    }
  }

  return locations;
}

/**
 * Find metadata locations using both structured box parsing and iloc/iinf.
 * Only searches within known metadata structures, never scans raw mdat.
 */
function findMetadataLocations(data: Uint8Array): {
  exif: Array<{ offset: number; length: number }>;
  xmp: Array<{ offset: number; length: number }>;
} {
  const exif: Array<{ offset: number; length: number }> = [];
  const xmp: Array<{ offset: number; length: number }> = [];
  const boxes = parseBoxes(data);

  // Find meta box
  const metaBox = boxes.find(b => b.type === 'meta');
  if (!metaBox) {
    return { exif, xmp };
  }

  // Parse meta container
  const metaChildren = parseContainerBox(data, metaBox);

  // Method 1: Find Exif boxes in ipco (item property container)
  const iprpBox = metaChildren.find(b => b.type === 'iprp');
  if (iprpBox) {
    const iprpChildren = parseContainerBox(data, iprpBox);
    const ipcoBox = iprpChildren.find(b => b.type === 'ipco');
    if (ipcoBox) {
      const ipcoChildren = parseContainerBox(data, ipcoBox);
      for (const box of ipcoChildren) {
        if (box.type === 'Exif') {
          exif.push({
            offset: box.dataOffset,
            length: box.dataSize,
          });
        }
      }
    }
  }

  // Method 2: Find Exif and XMP items via iinf/iloc
  const { exifIds, xmpIds } = findMetadataItemIds(data, metaChildren);

  const exifItemLocations = findItemLocations(data, metaChildren, exifIds);
  for (const loc of exifItemLocations) {
    const alreadyFound = exif.some(
      existing => existing.offset === loc.offset && existing.length === loc.length
    );
    if (!alreadyFound) {
      exif.push(loc);
    }
  }

  const xmpItemLocations = findItemLocations(data, metaChildren, xmpIds);
  for (const loc of xmpItemLocations) {
    xmp.push(loc);
  }

  // Also check for Exif boxes directly in meta children
  for (const child of metaChildren) {
    if (child.type === 'Exif') {
      const alreadyFound = exif.some(
        loc => loc.offset === child.dataOffset && loc.length === child.dataSize
      );
      if (!alreadyFound) {
        exif.push({
          offset: child.dataOffset,
          length: child.dataSize,
        });
      }
    }
  }

  return { exif, xmp };
}

/**
 * Find ICC color profile locations within the box hierarchy.
 */
function findColorProfileLocations(data: Uint8Array): Array<{ offset: number; length: number }> {
  const locations: Array<{ offset: number; length: number }> = [];
  const boxes = parseBoxes(data);

  const metaBox = boxes.find(b => b.type === 'meta');
  if (!metaBox) {
    return locations;
  }

  const metaChildren = parseContainerBox(data, metaBox);
  const iprpBox = metaChildren.find(b => b.type === 'iprp');
  if (iprpBox) {
    const iprpChildren = parseContainerBox(data, iprpBox);
    const ipcoBox = iprpChildren.find(b => b.type === 'ipco');
    if (ipcoBox) {
      const ipcoChildren = parseContainerBox(data, ipcoBox);
      for (const box of ipcoChildren) {
        if (box.type === 'colr' || box.type === 'iCCP') {
          locations.push({
            offset: box.dataOffset,
            length: box.dataSize,
          });
        }
      }
    }
  }

  return locations;
}

/**
 * Overwrite data regions with zeros (anonymization)
 */
function overwriteWithZeros(
  data: Uint8Array,
  locations: Array<{ offset: number; length: number }>
): void {
  for (const loc of locations) {
    const end = Math.min(loc.offset + loc.length, data.length);
    for (let i = loc.offset; i < end; i++) {
      data[i] = 0;
    }
  }
}

/**
 * Remove (anonymize) metadata from HEIC image
 *
 * Uses lossless anonymization: overwrites metadata with zeros within
 * known box structures only, preserving all file offsets and the main
 * image data (HEVC in mdat) completely untouched.
 */
export function remove(data: Uint8Array, options: RemoveOptions = {}): Uint8Array {
  // Validate HEIC format
  if (data.length < 12) {
    throw new HeicProcessingError('File too small to be valid HEIC');
  }

  // Check for ftyp box
  const ftypType = buffer.toAscii(data, 4, 4);
  if (ftypType !== 'ftyp') {
    throw new HeicProcessingError('Missing ftyp box');
  }

  // Make a copy to modify (we don't mutate the input)
  const result = new Uint8Array(data);

  // Find and anonymize EXIF and XMP data (only within known structures)
  const { exif: exifLocations, xmp: xmpLocations } = findMetadataLocations(data);
  if (exifLocations.length > 0) {
    overwriteWithZeros(result, exifLocations);
  }
  if (xmpLocations.length > 0) {
    overwriteWithZeros(result, xmpLocations);
  }

  // Anonymize color profiles unless preserveColorProfile is set
  if (options.preserveColorProfile !== true) {
    const colorProfileLocations = findColorProfileLocations(data);
    if (colorProfileLocations.length > 0) {
      overwriteWithZeros(result, colorProfileLocations);
    }
  }

  return result;
}

/**
 * Get list of metadata types present in the image
 */
export function getMetadataTypes(data: Uint8Array): string[] {
  const types: string[] = [];

  const { exif: exifLocations, xmp: xmpLocations } = findMetadataLocations(data);

  if (exifLocations.length > 0) {
    types.push('EXIF');

    // Check for GPS within EXIF
    for (const loc of exifLocations) {
      const end = Math.min(loc.offset + loc.length, data.length);
      const exifData = data.slice(loc.offset, end);
      // Tag 0x8825 (GPSInfo IFD pointer) may be BE [0x88,0x25] or LE [0x25,0x88]
      if (
        buffer.indexOf(exifData, [0x88, 0x25]) !== -1 ||
        buffer.indexOf(exifData, [0x25, 0x88]) !== -1
      ) {
        types.push('GPS');
        break;
      }
    }
  }

  if (xmpLocations.length > 0) {
    types.push('XMP');
  }

  const colorProfileLocations = findColorProfileLocations(data);
  if (colorProfileLocations.length > 0) {
    types.push('ICC Profile');
  }

  return [...new Set(types)];
}

import { readExifBlock } from '../exif/reader.js';
import type { MetadataMap } from '../types.js';

/**
 * Read structured metadata from a HEIC/HEIF file without modifying it.
 */
export function read(data: Uint8Array): Partial<MetadataMap> {
  const out: Partial<MetadataMap> = {};
  try {
    const { exif: locs } = findMetadataLocations(data);
    for (const loc of locs) {
      const slice = data.slice(loc.offset, Math.min(loc.offset + loc.length, data.length));
      readExifBlock(slice, out);
    }
  } catch { /* ignore */ }
  return out;
}

export const heic = {
  remove,
  getMetadataTypes,
  read,
};

export default heic;
