import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importInventory } from '@think/shared';
import { readGrid } from './lib/xlsx.ts';

const file = new URL('./data/FLS Equipment - INDIA.xlsx', import.meta.url);

test('imports every unit from the FLS inventory', async () => {
  const { sheetName, grid } = await readGrid(await readFile(file));
  const res = importInventory(grid, { sheetName });
  assert.equal(res.declaredTotal, 331);
  assert.equal(res.units.length, 331);
  assert.equal(res.asOfDate, '2026-07-30');
  const by = (site: string, type?: string) => res.units.filter((u) => u.site === site && (!type || u.equipmentType === type));
  assert.equal(by('ETV Parcel 9', 'wheelchair').filter((u) => u.manufacturer === 'Med Star').length, 21);
  assert.equal(by('ETV Parcel 9', 'scoop_stretcher').length, 26);
  assert.equal(by('ETV Parcel 9', 'folding_stretcher').length, 2);
  assert.equal(by('Platina 3', 'wheelchair').length, 3);
  assert.equal(by('Platina 3', 'scoop_stretcher').length, 4);
  assert.equal(by('Platina 3', 'scoop_stretcher').filter((u) => u.model === 'PG-10SS').length, 2);
  assert.equal(by('PTP', 'scoop_stretcher').length, 6);
  assert.equal(by('Magma', 'wheelchair').every((u) => u.dataFlags.includes('MAKE_AMBIGUOUS')), true);
  const etv5 = by('ETV Parcel 5', 'wheelchair');
  assert.equal(etv5.filter((u) => u.ageRaw && u.installDate === '2018-07-30').length, 4);
  assert.equal(by('Windsor', 'wheelchair')[0].status, 'out_of_service');
  assert.equal(by('NKP', 'wheelchair')[0].installDate, '2023-05-12');
  const gift = by('Gift City');
  assert.equal(gift[0].city, 'Gandhinagar');
  const cities = new Set(res.units.map((u) => u.city));
  assert.deepEqual([...cities].sort(), ['Bengaluru', 'Delhi', 'Gandhinagar', 'Hyderabad', 'Mumbai', 'Noida', 'Pune']);
  console.log(res.issues);
});
