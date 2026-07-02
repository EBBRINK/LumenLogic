"use server";

// No-op server-action voor screenshot-tests: componenten die een form-action verwachten
// krijgen een geldige server-referentie zonder bijwerking.
export async function noopAction(): Promise<void> {}
