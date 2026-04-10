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
