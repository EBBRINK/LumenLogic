// CSV → rijen (goal-import-meer-formaten, Bouwer A stap 2).
//
// Delimiter-sniffing over ';' / ',' / tab: Excel-NL exporteert puntkomma's, Excel-EN
// komma's, en geplakte kolommen komen als tabs. We tellen per kandidaat het aantal
// scheidingstekens BUITEN aanhalingstekens op de eerste niet-lege regels; de kandidaat
// met de meeste (en > 0) wint. Quotes volgens het Excel-dialect: "a;b" is één cel,
// "" binnen quotes is een letterlijke ".
import type { TableRows } from "./parse-rows";

const CANDIDATES = [";", ",", "\t"] as const;
const SNIFF_LINES = 20;

function countOutsideQuotes(line: string, delim: string): number {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === delim) n++;
  }
  return n;
}

export function sniffDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, SNIFF_LINES);
  let best: string = ";";
  let bestTotal = 0;
  for (const d of CANDIDATES) {
    const total = lines.reduce((n, l) => n + countOutsideQuotes(l, d), 0);
    if (total > bestTotal) {
      best = d;
      bestTotal = total;
    }
  }
  return best;
}

// Kleine, dialect-getrouwe CSV-lezer. Rijgrenzen zijn heilig: een newline BINNEN
// quotes blijft binnen zijn cel (en dus binnen zijn rij) — er is nergens een join
// over rijen heen.
export function rowsFromCsv(text: string): TableRows {
  // BOM van Excel-exports strippen, anders heet de eerste kolomkop "﻿code".
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = sniffDelimiter(src);

  const rows: TableRows = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    // een geheel lege rij bewaren we wél (rijnummers moeten blijven kloppen met het
    // bronbestand), behalve de allerlaatste na een afsluitende newline
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (ch === delim) {
      pushCell();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) pushRow();
  return rows;
}
