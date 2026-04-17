function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function readUInt24LE(buffer: Buffer, offset: number) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function detectPngDimensions(buffer: Buffer) {
  if (
    buffer.length < 24 ||
    buffer[0] !== 0x89 ||
    buffer[1] !== 0x50 ||
    buffer[2] !== 0x4e ||
    buffer[3] !== 0x47 ||
    buffer[4] !== 0x0d ||
    buffer[5] !== 0x0a ||
    buffer[6] !== 0x1a ||
    buffer[7] !== 0x0a ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return null;
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return isPositiveInteger(width) && isPositiveInteger(height) ? { width, height } : null;
}

function detectGifDimensions(buffer: Buffer) {
  if (buffer.length < 10) {
    return null;
  }

  const signature = buffer.toString("ascii", 0, 6);

  if (signature !== "GIF87a" && signature !== "GIF89a") {
    return null;
  }

  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);

  return isPositiveInteger(width) && isPositiveInteger(height) ? { width, height } : null;
}

function detectJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;

  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];

    if (marker === 0xd8 || marker === 0x01) {
      offset += 2;
      continue;
    }

    if (marker >= 0xd0 && marker <= 0xd9) {
      offset += 2;
      continue;
    }

    if (offset + 4 > buffer.length) {
      return null;
    }

    const segmentLength = buffer.readUInt16BE(offset + 2);

    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      return null;
    }

    const isStartOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]).has(
      marker,
    );

    if (isStartOfFrame) {
      if (offset + 9 > buffer.length) {
        return null;
      }

      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);

      return isPositiveInteger(width) && isPositiveInteger(height) ? { width, height } : null;
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function detectWebpDimensions(buffer: Buffer) {
  if (
    buffer.length < 30 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WEBP"
  ) {
    return null;
  }

  const chunkType = buffer.toString("ascii", 12, 16);

  if (chunkType === "VP8X") {
    const width = 1 + readUInt24LE(buffer, 24);
    const height = 1 + readUInt24LE(buffer, 27);

    return isPositiveInteger(width) && isPositiveInteger(height) ? { width, height } : null;
  }

  if (chunkType === "VP8L") {
    if (buffer.length < 25 || buffer[20] !== 0x2f) {
      return null;
    }

    const packed = buffer.readUInt32LE(21);
    const width = 1 + (packed & 0x3fff);
    const height = 1 + ((packed >> 14) & 0x3fff);

    return isPositiveInteger(width) && isPositiveInteger(height) ? { width, height } : null;
  }

  if (chunkType === "VP8 ") {
    if (
      buffer.length < 30 ||
      buffer[23] !== 0x9d ||
      buffer[24] !== 0x01 ||
      buffer[25] !== 0x2a
    ) {
      return null;
    }

    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;

    return isPositiveInteger(width) && isPositiveInteger(height) ? { width, height } : null;
  }

  return null;
}

export function detectImageDimensions(buffer: Buffer, mimeType?: string | null) {
  const normalizedMimeType = mimeType?.trim().toLowerCase();

  if (normalizedMimeType === "image/png") {
    return detectPngDimensions(buffer);
  }

  if (normalizedMimeType === "image/jpeg" || normalizedMimeType === "image/jpg") {
    return detectJpegDimensions(buffer);
  }

  if (normalizedMimeType === "image/gif") {
    return detectGifDimensions(buffer);
  }

  if (normalizedMimeType === "image/webp") {
    return detectWebpDimensions(buffer);
  }

  return detectPngDimensions(buffer) ?? detectJpegDimensions(buffer) ?? detectGifDimensions(buffer) ?? detectWebpDimensions(buffer);
}
