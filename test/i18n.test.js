const i18n = require('../chrome/content/i18n');

beforeEach(() => i18n.reset());

describe('init + t', () => {
    test('returns string for known key', () => {
        i18n.init({ greeting: 'hello' });
        expect(i18n.t('greeting')).toBe('hello');
    });

    test('returns the key itself for unknown key (graceful fallback)', () => {
        i18n.init({});
        expect(i18n.t('missing.key')).toBe('missing.key');
    });

    test('returns key when init was never called', () => {
        expect(i18n.t('any')).toBe('any');
    });

    test('substitutes a single named placeholder', () => {
        i18n.init({ msg: '{count} entries exported' });
        expect(i18n.t('msg', { count: 5 })).toBe('5 entries exported');
    });

    test('substitutes multiple placeholders', () => {
        i18n.init({ msg: '{a} and {b}' });
        expect(i18n.t('msg', { a: 'foo', b: 'bar' })).toBe('foo and bar');
    });

    test('leaves unknown placeholders untouched', () => {
        i18n.init({ msg: 'Hello {name}, age {age}' });
        expect(i18n.t('msg', { name: 'andri' })).toBe('Hello andri, age {age}');
    });

    test('coerces non-string params via String()', () => {
        i18n.init({ msg: 'value: {x}' });
        expect(i18n.t('msg', { x: 42 })).toBe('value: 42');
    });

    test('handles repeated placeholders', () => {
        i18n.init({ msg: '{x}-{x}-{x}' });
        expect(i18n.t('msg', { x: 'a' })).toBe('a-a-a');
    });
});

describe('has', () => {
    test('true for known key', () => {
        i18n.init({ a: 'b' });
        expect(i18n.has('a')).toBe(true);
    });

    test('false for unknown key', () => {
        i18n.init({ a: 'b' });
        expect(i18n.has('c')).toBe(false);
    });
});

describe('reset', () => {
    test('clears messages', () => {
        i18n.init({ a: 'b' });
        i18n.reset();
        expect(i18n.has('a')).toBe(false);
        expect(i18n.t('a')).toBe('a');
    });
});
