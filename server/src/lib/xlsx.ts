import ExcelJS from 'exceljs';
import type { GridRow } from '@think/shared';

/** Reads the first worksheet into a grid with merged cells resolved to their master value. */
export async function readGrid(buffer: Buffer | ArrayBuffer): Promise<{ sheetName: string; grid: GridRow[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  const ws = wb.worksheets.find((w) => w.actualRowCount > 0) ?? wb.worksheets[0];
  if (!ws) throw new Error('Workbook has no worksheets');
  const grid: GridRow[] = [];
  const colCount = ws.columnCount;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: (string | number | null)[] = [];
    const masters: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      const src = cell.isMerged ? cell.master : cell;
      values.push(cellValue(src.value));
      masters.push(src.address);
    }
    grid.push({ row: r, values, masters });
  }
  return { sheetName: ws.name, grid };
}

function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return cellValue(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text);
  }
  return String(v);
}
