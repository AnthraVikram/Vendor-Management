import { describe, expect, it } from 'vitest';
import { phoneKey, phoneMatches } from '../../src/lib/phone';

const vendor = (id: string, phone: string, alternatePhone: string | null = null) => ({ id, name: `Vendor ${id}`, phone, alternatePhone });

describe('phone matching (FR-030)', () => {
  it('ignores spaces, tabs, and dashes', () => {
    expect(phoneKey('98765 43210')).toBe(phoneKey('98765-43210'));
    expect(phoneKey(' 98765\t43210 ')).toBe(phoneKey('9876543210'));
    expect(phoneMatches({ phone: '98765 43210' }, [vendor('a', '98765-43210')])).toEqual([{ id: 'a', name: 'Vendor a' }]);
    expect(phoneMatches({ phone: ' 98765\t43210 ' }, [vendor('a', '9876543210')])).toEqual([{ id: 'a', name: 'Vendor a' }]);
  });

  it('compares phone and alternate phone in both directions', () => {
    expect(phoneMatches({ phone: '91111 22222' }, [vendor('a', '90000 00000', '91111-22222')])).toEqual([{ id: 'a', name: 'Vendor a' }]);
    expect(phoneMatches({ phone: '90000 99999', alternatePhone: '91111 22222' }, [vendor('a', '91111-22222')])).toEqual([
      { id: 'a', name: 'Vendor a' },
    ]);
  });

  it('never matches an empty or dash-only number', () => {
    expect(phoneMatches({ phone: '--' }, [vendor('a', '--'), vendor('b', '')])).toEqual([]);
    expect(phoneMatches({ phone: '' }, [vendor('a', ''), vendor('b', '--')])).toEqual([]);
    expect(phoneMatches({ phone: '98765 43210', alternatePhone: '' }, [vendor('a', '90000 00000', '')])).toEqual([]);
  });

  it('does not match different digits', () => {
    expect(phoneMatches({ phone: '98765 43211' }, [vendor('a', '98765 43210')])).toEqual([]);
  });

  it('returns every matching vendor once', () => {
    const others = [vendor('a', '98765 43210', '91111 22222'), vendor('b', '93333 44444'), vendor('c', '0', '98765-43210')];
    expect(phoneMatches({ phone: '98765-43210', alternatePhone: '91111-22222' }, others)).toEqual([
      { id: 'a', name: 'Vendor a' },
      { id: 'c', name: 'Vendor c' },
    ]);
  });
});
