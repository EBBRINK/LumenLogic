// Magic-bytes (goal-import-meer-formaten, testnaad "PNG-magic-bytes-tests").
import { expect, test } from "vitest";
import { isJpegImage, isPngImage, isZipContainer } from "./magic";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14]);

test("isPngImage: echte PNG-handtekening → true", () => {
  expect(isPngImage(PNG)).toBe(true);
});

test("isPngImage: JPEG, zip, tekst, te kort en leeg → false", () => {
  expect(isPngImage(JPEG)).toBe(false);
  expect(isPngImage(ZIP)).toBe(false);
  expect(isPngImage(new TextEncoder().encode("code;aantal;merk"))).toBe(false);
  // 7 van de 8 handtekening-bytes: net te kort telt niet als PNG
  expect(isPngImage(PNG.slice(0, 7))).toBe(false);
  expect(isPngImage(new Uint8Array())).toBe(false);
});

test("isJpegImage: FF D8 → true, al het andere → false", () => {
  expect(isJpegImage(JPEG)).toBe(true);
  expect(isJpegImage(PNG)).toBe(false);
  expect(isJpegImage(new Uint8Array([0xff]))).toBe(false);
});

test("isZipContainer: PK\\x03\\x04 → true (xlsx/docx), andere bytes → false", () => {
  expect(isZipContainer(ZIP)).toBe(true);
  expect(isZipContainer(PNG)).toBe(false);
  // 'PK' alleen is geen lokale file header (bv. een lege zip eindigt op PK\x05\x06)
  expect(isZipContainer(new Uint8Array([0x50, 0x4b, 0x05, 0x06]))).toBe(false);
});
