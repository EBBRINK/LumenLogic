"use server";

// No-op server-action voor screenshot-tests: componenten die een form-action verwachten
// krijgen een geldige server-referentie zonder bijwerking.
export async function noopAction(): Promise<void> {}

// No-op OCR-actions voor screenshot-tests van de upload-kaart: geldige server-
// referenties met de juiste return-vorm, zonder database of vision-call.
export async function noopStartOcrAction(): Promise<{ error: string }> {
  return { error: "OCR is not available in this test." };
}
export async function noopOcrPageAction(): Promise<{ error: string }> {
  return { error: "OCR is not available in this test." };
}
