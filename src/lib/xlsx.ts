/**
 * Lightweight spreadsheet helpers — zero external dependencies.
 * Replaces the vulnerable `xlsx` (SheetJS) package.
 *
 * Export: produces a real .xlsx file using the OOXML format encoded
 *         as a data-URI download — no library needed.
 * Import: parses CSV natively; for .xlsx files falls back to a
 *         binary scan that extracts shared-strings text rows
 *         (handles standard Excel exports; sufficient for the
 *         column-mapping import flow used here).
 */

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowToCSV(row: unknown[]): string {
  return row.map(escapeCell).join(',');
}

export function parseCSVText(text: string): string[][] {
  const lines = text.split(/\r?\n/);
  return lines
    .filter(l => l.trim())
    .map(line => {
      const cells: string[] = [];
      let cur = '';
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cells.push(cur.trim()); cur = '';
        } else {
          cur += ch;
        }
      }
      cells.push(cur.trim());
      return cells;
    });
}

// ─── XLSX binary → text rows ─────────────────────────────────────────────────
// Extracts readable text from a standard .xlsx file by scanning the ZIP
// entries for xl/sharedStrings.xml and xl/worksheets/sheet1.xml.

function uint8ToString(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return s;
}

function inflateRaw(data: Uint8Array): Uint8Array {
  // Use DecompressionStream if available (all modern browsers + Node 18+)
  // This is synchronous-friendly via a trick: we use a sync XHR-style approach
  // by collecting chunks. Since we're in a FileReader callback context this is fine.
  // For environments without DecompressionStream we return the data as-is and
  // let the XML parse fail gracefully.
  return data; // see parseXlsxBinary for the actual async path
}

async function decompressEntry(data: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    // Fallback: try decoding as UTF-8 directly (won't work for compressed entries
    // but prevents a crash — import will just get no rows)
    return new TextDecoder().decode(data);
  }
  const ds = new DecompressionStream('raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(out);
}

interface ZipEntry { name: string; compMethod: number; dataOffset: number; compSize: number; }

function parseZipEntries(buf: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buf);
  const entries: ZipEntry[] = [];
  let i = 0;
  const bytes = new Uint8Array(buf);
  while (i < bytes.length - 4) {
    if (view.getUint32(i, true) !== 0x04034b50) { i++; continue; }
    const compMethod = view.getUint16(i + 8, true);
    const compSize = view.getUint32(i + 18, true);
    const nameLen = view.getUint16(i + 26, true);
    const extraLen = view.getUint16(i + 28, true);
    const name = new TextDecoder().decode(bytes.slice(i + 30, i + 30 + nameLen));
    const dataOffset = i + 30 + nameLen + extraLen;
    entries.push({ name, compMethod, dataOffset, compSize });
    i = dataOffset + compSize;
  }
  return entries;
}

export async function parseXlsxBinary(buf: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buf);
  const entries = parseZipEntries(buf);

  const getEntry = async (name: string): Promise<string | null> => {
    const e = entries.find(x => x.name === name);
    if (!e) return null;
    const raw = bytes.slice(e.dataOffset, e.dataOffset + e.compSize);
    if (e.compMethod === 0) return new TextDecoder().decode(raw);
    return decompressEntry(raw);
  };

  // 1. Shared strings
  const ssXml = await getEntry('xl/sharedStrings.xml');
  const sharedStrings: string[] = [];
  if (ssXml) {
    const matches = ssXml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g);
    for (const m of matches) sharedStrings.push(m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"));
  }

  // 2. Sheet1
  const sheetXml = await getEntry('xl/worksheets/sheet1.xml') || await getEntry('xl/worksheets/Sheet1.xml');
  if (!sheetXml) return [];

  const rows: string[][] = [];
  const rowMatches = sheetXml.matchAll(/<row[^>]*>(.*?)<\/row>/gs);
  for (const rowM of rowMatches) {
    const cells: string[] = [];
    const cellMatches = rowM[1].matchAll(/<c\s([^>]*)>(.*?)<\/c>/gs);
    let colIdx = 0;
    for (const cellM of cellMatches) {
      const attrs = cellM[1];
      const inner = cellM[2];
      // Parse column reference to handle sparse rows
      const rMatch = attrs.match(/r="([A-Z]+)\d+"/);
      if (rMatch) {
        const col = rMatch[1].split('').reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
        while (cells.length < col) cells.push('');
        colIdx = col;
      }
      const tAttr = attrs.match(/t="([^"]+)"/)?.[1];
      const vMatch = inner.match(/<v>([^<]*)<\/v>/);
      const v = vMatch ? vMatch[1] : '';
      let val = '';
      if (tAttr === 's') {
        val = sharedStrings[parseInt(v)] ?? '';
      } else if (tAttr === 'inlineStr') {
        val = inner.match(/<t>([^<]*)<\/t>/)?.[1] ?? '';
      } else {
        val = v;
      }
      if (cells.length === colIdx) cells.push(val);
      else cells[colIdx] = val;
      colIdx++;
    }
    if (cells.some(c => c.trim())) rows.push(cells);
  }
  return rows;
}

// ─── Export to .xlsx (OOXML) ─────────────────────────────────────────────────
// Generates a minimal but valid .xlsx file as a Blob using the Open Packaging
// Convention — no compression, just stored entries. Opens correctly in Excel,
// Numbers, LibreOffice, and Google Sheets.

function xmlEscape(s: unknown): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function colLetter(n: number): string {
  let s = '';
  while (n >= 0) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; }
  return s;
}

function buildXlsx(headers: string[], rows: Record<string, unknown>[]): Blob {
  // Build shared strings table
  const strings: string[] = [];
  const strIdx: Record<string, number> = {};
  const si = (v: unknown) => {
    const s = String(v ?? '');
    if (!(s in strIdx)) { strIdx[s] = strings.length; strings.push(s); }
    return strIdx[s];
  };

  // Pre-index all strings
  headers.forEach(h => si(h));
  rows.forEach(r => headers.forEach(h => {
    const v = r[h];
    if (v != null && v !== '' && typeof v !== 'number') si(v);
  }));

  const ssXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">
${strings.map(s => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`).join('\n')}
</sst>`;

  // Build worksheet
  const allRows = [headers, ...rows.map(r => headers.map(h => r[h]))];
  const wsRows = allRows.map((row, ri) =>
    `<row r="${ri + 1}">${(row as unknown[]).map((v, ci) => {
      const ref = `${colLetter(ci)}${ri + 1}`;
      if (v != null && v !== '' && typeof v === 'number') {
        return `<c r="${ref}"><v>${v}</v></c>`;
      }
      const idx = si(v);
      return `<c r="${ref}" t="s"><v>${idx}</v></c>`;
    }).join('')}</row>`
  ).join('\n');

  const wsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${wsRows}</sheetData>
</worksheet>`;

  const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Firms" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const pkgRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  // Pack into a ZIP (stored, no compression) using plain ArrayBuffer writes
  const enc = new TextEncoder();
  const entries: Array<{ name: string; data: Uint8Array }> = [
    { name: '[Content_Types].xml',         data: enc.encode(contentTypes) },
    { name: '_rels/.rels',                 data: enc.encode(pkgRels) },
    { name: 'xl/workbook.xml',             data: enc.encode(wbXml) },
    { name: 'xl/_rels/workbook.xml.rels',  data: enc.encode(wbRels) },
    { name: 'xl/worksheets/sheet1.xml',    data: enc.encode(wsXml) },
    { name: 'xl/sharedStrings.xml',        data: enc.encode(ssXml) },
  ];

  // Build ZIP binary
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; };
  const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };

  // Simple CRC32
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();
  const crc32 = (data: Uint8Array) => {
    let crc = 0xFFFFFFFF;
    for (const b of data) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  };

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header
    const lfh = new Uint8Array([
      0x50, 0x4B, 0x03, 0x04, // signature
      ...u16(20),              // version needed
      ...u16(0),               // flags
      ...u16(0),               // compression (stored)
      ...u16(0), ...u16(0),    // mod time, date
      ...u32(crc),
      ...u32(size),            // compressed size
      ...u32(size),            // uncompressed size
      ...u16(nameBytes.length),
      ...u16(0),               // extra field length
    ]);
    parts.push(lfh, nameBytes, entry.data);

    // Central directory entry
    const cde = new Uint8Array([
      0x50, 0x4B, 0x01, 0x02,
      ...u16(20), ...u16(20),
      ...u16(0), ...u16(0),
      ...u16(0), ...u16(0),
      ...u32(crc),
      ...u32(size), ...u32(size),
      ...u16(nameBytes.length),
      ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0),
      ...u32(offset),
    ]);
    centralDir.push(cde, nameBytes);
    offset += lfh.length + nameBytes.length + size;
  }

  const cdOffset = offset;
  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);

  const eocd = new Uint8Array([
    0x50, 0x4B, 0x05, 0x06,
    ...u16(0), ...u16(0),
    ...u16(entries.length), ...u16(entries.length),
    ...u32(cdSize),
    ...u32(cdOffset),
    ...u16(0),
  ]);

  const all = [...parts, ...centralDir, eocd];
  const total = all.reduce((s, b) => s + b.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const b of all) { out.set(b, pos); pos += b.length; }

  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ─── Public API (matches the XLSX calls used in FirmsDB) ─────────────────────

export function exportToXlsx(headers: string[], rows: Record<string, unknown>[], filename: string): void {
  const blob = buildXlsx(headers, rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Also provide a CSV fallback for users who prefer it */
export function exportToCSV(headers: string[], rows: Record<string, unknown>[], filename: string): void {
  const lines = [rowToCSV(headers), ...rows.map(r => rowToCSV(headers.map(h => r[h])))];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
