// The web stand-in for Cloud Calc's expression mode (Android: libqalculate through JNI). Same key semantics as the declared
// pad (build.json ui.modes[standard|scientific].keys): + - * / ^ % ( ) . sqrt( and the scientific functions; results print
// like libqalculate with approx 2 ("always decimal": 500/3 -> 166.6666667, ten significant digits, no trailing zeros).
export type Angle = 'deg' | 'rad' | 'grad';
type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'id'; v: string } | { t: '(' } | { t: ')' } | { t: ',' };

const FUNCS: Record<string, (x: number, a: Angle) => number> = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, log10: Math.log10, log2: Math.log2, exp: Math.exp,
  sin: (x, a) => Math.sin(toRad(x, a)), cos: (x, a) => Math.cos(toRad(x, a)), tan: (x, a) => Math.tan(toRad(x, a)),
  asin: (x, a) => fromRad(Math.asin(x), a), acos: (x, a) => fromRad(Math.acos(x), a), atan: (x, a) => fromRad(Math.atan(x), a),
};
const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };
const toRad = (x: number, a: Angle) => (a === 'deg' ? (x * Math.PI) / 180 : a === 'grad' ? (x * Math.PI) / 200 : x);
const fromRad = (x: number, a: Angle) => (a === 'deg' ? (x * 180) / Math.PI : a === 'grad' ? (x * 200) / Math.PI : x);

export function tokenize(src: string): Tok[] {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√/g, 'sqrt');
  const out: Tok[] = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const id = /^[a-zπ][a-z0-9]*/i.exec(s.slice(i));
    if (id) { out.push({ t: 'id', v: id[0].toLowerCase() }); i += id[0].length; continue; }
    if ('+-*/^%!'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: '(' }); i++; continue; }
    if (c === ')') { out.push({ t: ')' }); i++; continue; }
    if (c === ',' || c === ';') { out.push({ t: ',' }); i++; continue; }
    throw new Error(`unexpected '${c}'`);
  }
  return out;
}

function binary(op: string, a: number, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': return a / b;
    case '^': return Math.pow(a, b);
  }
  throw new Error(`operator ${op}`);
}

/** Evaluate [src]. An unclosed "(" is closed at the end, as the pad's "( )" key leaves it open. */
export function evaluate(src: string, angle: Angle = 'deg'): number {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const expr = (): number => {
    let v = term();
    for (let t = peek(); t && t.t === 'op' && (t.v === '+' || t.v === '-'); t = peek()) { p++; v = binary(t.v, v, term()); }
    return v;
  };
  const term = (): number => {
    let v = power();
    for (let t = peek(); t; t = peek()) {
      if (t.t === 'op' && (t.v === '*' || t.v === '/')) { p++; v = binary(t.v, v, power()); continue; }
      // implicit multiplication: 2(3), 2pi, (1)(2), 2sqrt(4)
      if (t.t === 'num' || t.t === 'id' || t.t === '(') { v = v * power(); continue; }
      break;
    }
    return v;
  };
  const power = (): number => {
    const b = unary();
    const t = peek();
    if (t && t.t === 'op' && t.v === '^') { p++; return binary('^', b, power()); }
    return b;
  };
  const unary = (): number => {
    const t = peek();
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) { p++; const v = unary(); return t.v === '-' ? -v : v; }
    return postfix();
  };
  const postfix = (): number => {
    let v = atom();
    for (let t = peek(); t && t.t === 'op' && (t.v === '%' || t.v === '!'); t = peek()) {
      p++;
      v = t.v === '%' ? v / 100 : factorial(v);
    }
    return v;
  };
  const atom = (): number => {
    const t = toks[p++];
    if (!t) throw new Error('incomplete expression');
    if (t.t === 'num') return t.v;
    if (t.t === '(') { const v = expr(); if (peek()?.t === ')') p++; return v; }
    if (t.t === 'id') {
      if (t.v in CONSTS) return CONSTS[t.v];
      const f = FUNCS[t.v];
      if (!f) throw new Error(`unknown ${t.v}`);
      if (peek()?.t === '(') { p++; const v = expr(); if (peek()?.t === ')') p++; return f(v, angle); }
      return f(power(), angle);
    }
    throw new Error('syntax error');
  };
  const v = expr();
  if (p < toks.length) throw new Error('syntax error');
  return v;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** libqalculate approx 2 printing: ten significant digits, trailing zeros dropped, exponent form outside 1e-9..1e15. */
export function format(v: number): string {
  if (Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e15 || a < 1e-9) return v.toExponential(9).replace(/(\.\d*?)0+e/, '$1e').replace('.e', 'e').replace('e+', 'E').replace('e-', 'E-');
  return String(parseFloat(v.toPrecision(10)));
}

export function calc(src: string, angle: Angle = 'deg'): string {
  try { return format(evaluate(src, angle)); } catch { return 'error'; }
}
