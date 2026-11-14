// Minimal CSV parser for the project's own data files (quoted fields, commas in quotes, CRLF).

function splitLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * @param {string} text
 * @param {{ numeric?: string[], boolean?: string[] }} [types] columns to convert
 * @returns {object[]}
 */
export function parseCsv(text, { numeric = [], boolean = [] } = {}) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = splitLine(lines[0]);
  const numSet = new Set(numeric);
  const boolSet = new Set(boolean);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const row = {};
    header.forEach((col, i) => {
      const raw = cells[i] ?? '';
      if (numSet.has(col)) row[col] = raw === '' ? null : Number(raw);
      else if (boolSet.has(col)) row[col] = raw === 'True' || raw === 'true';
      else row[col] = raw;
    });
    return row;
  });
}
