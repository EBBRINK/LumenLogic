// Magic-bytes-checks (goal-import-meer-formaten, Bouwer A stap 2): het gedeclareerde
// mime-type is altijd client-input — de bytes zelf moeten het waarmaken vóór ze worden
// opgeslagen of een parser/vision-API in gaan. Gegeneraliseerd uit lib/repo/ocr.ts
// (isJpegImage stond daar; die export blijft daar bestaan als re-export zodat bestaande
// aanroepers niets merken).

// JPEG begint altijd met FF D8 (SOI).
export function isJpegImage(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

// PNG-handtekening: 89 50 4E 47 0D 0A 1A 0A (8 bytes, PNG-spec §5.2).
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export function isPngImage(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((b, i) => bytes[i] === b)
  );
}

// PK-zip-container: 50 4B ('PK') gevolgd door 03 04 (lokale file header). Zowel xlsx
// als docx zijn zip-containers — dit zegt dus "kán een Office-bestand zijn", niet wélk;
// de extensie/mime kiest de parser, deze check weert alleen niet-zip-bytes.
export function isZipContainer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}
