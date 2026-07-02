// Minimale, correcte CSV-parser (RFC 4180): quotes, dubbele-quote-escapes,
// embedded newlines en komma's binnen velden. De brondata is een Postgres-CSV-export
// mét ingesloten newlines in tekstvelden — regel-splitsen kan dus níet.
//
// Streaming via generator: verwerkt de volledige string maar levert rij-voor-rij,
// zodat de aanroeper kan batchen zonder alle 211k rijen als objecten vast te houden.

export function* iterRows(text: string): Generator<string[]> {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // is er iets aan de huidige rij begonnen?

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      started = true;
    } else if (c === ",") {
      fields.push(field);
      field = "";
      started = true;
    } else if (c === "\n") {
      fields.push(field);
      yield fields.slice();
      fields.length = 0;
      field = "";
      started = false;
    } else if (c === "\r") {
      // negeer: \r\n → \n hierboven
    } else {
      field += c;
      started = true;
    }
  }
  // laatste rij zonder afsluitende newline
  if (started || field.length > 0 || fields.length > 0) {
    fields.push(field);
    yield fields.slice();
  }
}

// Rijen als objecten gemapt op de header. Leeg veld ("") → null.
export function* iterRecords(
  text: string,
): Generator<Record<string, string | null>> {
  let headers: string[] | null = null;
  for (const row of iterRows(text)) {
    if (!headers) {
      headers = row;
      continue;
    }
    // sla volledig lege staartregel over
    if (row.length === 1 && row[0] === "") continue;
    const rec: Record<string, string | null> = {};
    for (let i = 0; i < headers.length; i++) {
      const v = row[i];
      rec[headers[i]] = v === undefined || v === "" ? null : v;
    }
    yield rec;
  }
}
