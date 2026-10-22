import { mergeDiagnosisCatalog } from './diagnosisCatalog';

describe('mergeDiagnosisCatalog', () => {
  test('combines the shared official list with facility custom diagnoses', () => {
    const catalog = mergeDiagnosisCatalog(
      [{ id: 'esv1-1A07', code: '1A07', name: 'Typhoid fever', active: true }],
      [{ id: 'local-uti', code: null, name: 'Urinary tract infection', active: true, official: false }]
    );

    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'official:esv1-1A07',
        code: '1A07',
        name: 'Typhoid fever',
        official: true,
      }),
      expect.objectContaining({
        id: 'local-uti',
        name: 'Urinary tract infection',
        official: false,
      }),
    ]);
  });

  test('hides an exact legacy official duplicate without discarding catalog conflicts', () => {
    const catalog = mergeDiagnosisCatalog(
      [{ id: 'esv1-1A07', code: '1A07', name: 'Typhoid fever', active: true }],
      [
        { id: 'esv1-1A07', code: '1A07', name: 'Typhoid fever', active: true, official: true },
        { id: 'old-version', code: '1A07', name: 'Typhoid (legacy label)', active: true, official: true },
      ]
    );

    expect(catalog).toHaveLength(2);
    expect(catalog.map(({ name }) => name)).toEqual([
      'Typhoid fever',
      'Typhoid (legacy label)',
    ]);
  });
});
