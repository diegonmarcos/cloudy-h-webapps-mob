import { describe, expect, it } from 'vitest';
import { calc, evaluate, format } from './engine';

describe('cloud-calc web engine (libqalculate approx 2 semantics)', () => {
  it('the standard pad', () => {
    expect(calc('1+2*3')).toBe('7');
    expect(calc('(1+2)*3')).toBe('9');
    expect(calc('7-10/4')).toBe('4.5');
    expect(calc('2^10')).toBe('1024');
    expect(calc('50%')).toBe('0.5');
    expect(calc('sqrt(16)+3^2')).toBe('13');
  });
  it('always decimal, ten significant digits (500/3 = 166.6666667)', () => {
    expect(calc('500/3')).toBe('166.6666667');
    expect(format(0.1 + 0.2)).toBe('0.3');
  });
  it('an open "( )" is closed at the end; implicit multiplication', () => {
    expect(calc('2(3+4')).toBe('14');
    expect(evaluate('2pi')).toBeCloseTo(2 * Math.PI, 12);
  });
  it('scientific functions in degrees by default', () => {
    expect(calc('sin(30)')).toBe('0.5');
    expect(calc('cos(0)')).toBe('1');
    expect(calc('sin(pi/2)', 'rad')).toBe('1');
    expect(calc('ln(e)')).toBe('1');
    expect(calc('5!')).toBe('120');
  });
  it('errors and edge values', () => {
    expect(calc('1+')).toBe('error');
    expect(calc('1/0')).toBe('∞');
    expect(calc('2^60')).toBe('1.152921505E18');
    expect(calc('2^-40')).toBe('9.094947018E-13');
  });
});
