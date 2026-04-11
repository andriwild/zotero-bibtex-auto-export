const H = require('../chrome/content/helpers');

describe('replaceExtension', () => {
    test('replaces simple extension', () => {
        expect(H.replaceExtension('/tmp/a.bib', '.ris')).toBe('/tmp/a.ris');
    });

    test('replaces when no directory prefix', () => {
        expect(H.replaceExtension('a.bib', '.csv')).toBe('a.csv');
    });

    test('ignores dots in directory names', () => {
        expect(H.replaceExtension('/tmp/dir.name/file.bib', '.ris'))
            .toBe('/tmp/dir.name/file.ris');
    });

    test('appends extension when file has none', () => {
        expect(H.replaceExtension('/tmp/noext', '.bib')).toBe('/tmp/noext.bib');
    });

    test('returns input unchanged for empty string', () => {
        expect(H.replaceExtension('', '.bib')).toBe('');
    });
});

describe('extensionForTranslatorLabel', () => {
    test.each([
        ['BibTeX', '.bib'],
        ['BibLaTeX', '.bib'],
        ['RIS', '.ris'],
        ['CSV', '.csv'],
        ['EndNote XML', '.xml'],
        ['CSL JSON', '.json'],
        ['Unknown Format', '.bib'],
        ['', '.bib'],
    ])('%s -> %s', (label, ext) => {
        expect(H.extensionForTranslatorLabel(label)).toBe(ext);
    });
});

describe('findFormatKeyByTranslatorID', () => {
    const translators = {
        bibtex: { id: 'a', label: 'BibTeX' },
        ris: { id: 'b', label: 'RIS' },
    };

    test('returns matching key', () => {
        expect(H.findFormatKeyByTranslatorID(translators, 'b')).toBe('ris');
    });

    test('returns null when no match', () => {
        expect(H.findFormatKeyByTranslatorID(translators, 'zzz')).toBeNull();
    });

    test('returns null for empty translators map', () => {
        expect(H.findFormatKeyByTranslatorID({}, 'a')).toBeNull();
    });
});

describe('parsePromptIndex', () => {
    test('converts 1-based input to 0-based index', () => {
        expect(H.parsePromptIndex('2', 5)).toBe(1);
    });

    test('accepts first and last valid values', () => {
        expect(H.parsePromptIndex('1', 5)).toBe(0);
        expect(H.parsePromptIndex('5', 5)).toBe(4);
    });

    test('rejects out-of-range values', () => {
        expect(H.parsePromptIndex('6', 5)).toBeNull();
        expect(H.parsePromptIndex('0', 5)).toBeNull();
    });

    test('rejects non-numeric and empty input', () => {
        expect(H.parsePromptIndex('abc', 5)).toBeNull();
        expect(H.parsePromptIndex('', 5)).toBeNull();
        expect(H.parsePromptIndex(null, 5)).toBeNull();
    });
});

describe('countBibEntries', () => {
    test('counts @ entries in BibTeX-style content', () => {
        expect(H.countBibEntries('@article{a}\n@book{b}\n@misc{c}')).toBe(3);
    });

    test('falls back to line count when no @ present', () => {
        expect(H.countBibEntries('line1\nline2\nline3\n')).toBe(3);
    });

    test('returns 0 for empty content', () => {
        expect(H.countBibEntries('')).toBe(0);
    });
});

describe('buildExportHeader', () => {
    test('includes timestamp and count for bib formats', () => {
        const h = H.buildExportHeader('bibtex', '2026-04-10T00:00:00Z', 5);
        expect(h).toContain('% Automatically exported: 2026-04-10T00:00:00Z');
        expect(h).toContain('% Number of entries: 5');
        expect(h.endsWith('\n\n')).toBe(true);
    });

    test('also matches biblatex (format string contains "bib")', () => {
        expect(H.buildExportHeader('biblatex', 't', 1)).not.toBe('');
    });

    test('returns empty string for non-bib formats', () => {
        expect(H.buildExportHeader('csv', 't', 1)).toBe('');
        expect(H.buildExportHeader('ris', 't', 1)).toBe('');
        expect(H.buildExportHeader('', 't', 1)).toBe('');
    });
});

describe('buildCollectionTree', () => {
    test('returns empty array for empty input', () => {
        expect(H.buildCollectionTree([])).toEqual([]);
    });

    test('returns empty array for non-array input', () => {
        expect(H.buildCollectionTree(null)).toEqual([]);
        expect(H.buildCollectionTree(undefined)).toEqual([]);
    });

    test('flat list with no parents → all roots, sorted alphabetically', () => {
        const input = [
            { key: 'B', parentKey: null, name: 'Beta' },
            { key: 'A', parentKey: null, name: 'Alpha' },
            { key: 'C', parentKey: null, name: 'Charlie' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots.map(n => n.item.name)).toEqual(['Alpha', 'Beta', 'Charlie']);
        expect(roots.every(n => n.children.length === 0)).toBe(true);
    });

    test('simple parent/child relationship', () => {
        const input = [
            { key: 'P', parentKey: null, name: 'Parent' },
            { key: 'C', parentKey: 'P', name: 'Child' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots).toHaveLength(1);
        expect(roots[0].item.name).toBe('Parent');
        expect(roots[0].children).toHaveLength(1);
        expect(roots[0].children[0].item.name).toBe('Child');
    });

    test('three levels deep', () => {
        const input = [
            { key: 'root', parentKey: null, name: 'Root' },
            { key: 'mid', parentKey: 'root', name: 'Middle' },
            { key: 'leaf', parentKey: 'mid', name: 'Leaf' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots).toHaveLength(1);
        expect(roots[0].children[0].children[0].item.name).toBe('Leaf');
    });

    test('children sorted alphabetically within each parent', () => {
        const input = [
            { key: 'p', parentKey: null, name: 'Parent' },
            { key: 'c1', parentKey: 'p', name: 'Zebra' },
            { key: 'c2', parentKey: 'p', name: 'Apple' },
            { key: 'c3', parentKey: 'p', name: 'Mango' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots[0].children.map(n => n.item.name)).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    test('sorting is case-insensitive', () => {
        const input = [
            { key: 'a', parentKey: null, name: 'alpha' },
            { key: 'B', parentKey: null, name: 'Bravo' },
            { key: 'c', parentKey: null, name: 'charlie' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots.map(n => n.item.name)).toEqual(['alpha', 'Bravo', 'charlie']);
    });

    test('orphan nodes (parentKey points to nothing) become roots', () => {
        const input = [
            { key: 'a', parentKey: null, name: 'Alpha' },
            { key: 'orphan', parentKey: 'does-not-exist', name: 'Orphan' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots).toHaveLength(2);
        expect(roots.map(n => n.item.name).sort()).toEqual(['Alpha', 'Orphan']);
    });

    test('multiple independent trees', () => {
        const input = [
            { key: 'a', parentKey: null, name: 'Tree A' },
            { key: 'a1', parentKey: 'a', name: 'A-Child' },
            { key: 'b', parentKey: null, name: 'Tree B' },
            { key: 'b1', parentKey: 'b', name: 'B-Child' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots).toHaveLength(2);
        expect(roots[0].item.name).toBe('Tree A');
        expect(roots[0].children).toHaveLength(1);
        expect(roots[1].item.name).toBe('Tree B');
        expect(roots[1].children).toHaveLength(1);
    });

    test('skips entries without a string key', () => {
        const input = [
            { key: 'valid', parentKey: null, name: 'Valid' },
            { parentKey: null, name: 'Missing key' },
            null,
            { key: 42, parentKey: null, name: 'Numeric key' },
        ];
        const roots = H.buildCollectionTree(input);
        expect(roots).toHaveLength(1);
        expect(roots[0].item.name).toBe('Valid');
    });

    test('handles missing name gracefully during sort', () => {
        const input = [
            { key: 'a', parentKey: null, name: 'Beta' },
            { key: 'b', parentKey: null },
            { key: 'c', parentKey: null, name: 'Alpha' },
        ];
        const roots = H.buildCollectionTree(input);
        // Missing name sorts as empty string — comes first
        expect(roots[0].item.key).toBe('b');
        expect(roots[1].item.name).toBe('Alpha');
        expect(roots[2].item.name).toBe('Beta');
    });
});

describe('parseCollectionItemNotifierID', () => {
    test('extracts the collection ID from a well-formed string', () => {
        expect(H.parseCollectionItemNotifierID('5-100')).toBe(5);
        expect(H.parseCollectionItemNotifierID('12-345')).toBe(12);
    });

    test('handles single-digit IDs', () => {
        expect(H.parseCollectionItemNotifierID('1-2')).toBe(1);
    });

    test('returns null for empty string', () => {
        expect(H.parseCollectionItemNotifierID('')).toBeNull();
    });

    test('returns null for non-string input', () => {
        expect(H.parseCollectionItemNotifierID(null)).toBeNull();
        expect(H.parseCollectionItemNotifierID(undefined)).toBeNull();
        expect(H.parseCollectionItemNotifierID(42)).toBeNull();
    });

    test('returns null for missing dash', () => {
        expect(H.parseCollectionItemNotifierID('12345')).toBeNull();
    });

    test('returns null for missing collection ID before dash', () => {
        expect(H.parseCollectionItemNotifierID('-100')).toBeNull();
    });

    test('returns null for non-numeric collection ID', () => {
        expect(H.parseCollectionItemNotifierID('abc-100')).toBeNull();
    });
});
