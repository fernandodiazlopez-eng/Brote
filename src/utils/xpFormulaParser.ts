export type FormulaVariableName = 'pasos' | 'minutos';

type Token =
  | { type: 'number'; value: number }
  | { type: 'ident'; name: string }
  | { type: 'op'; op: '+' | '-' | '*' | '/' | '%' | '**' }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenizeFormula(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = '';
      let dotCount = 0;
      while (i < len && /[0-9.]/.test(input[i])) {
        if (input[i] === '.') dotCount += 1;
        if (dotCount > 1) throw new Error('Número inválido');
        numStr += input[i];
        i += 1;
      }
      if (numStr === '.') throw new Error('Número inválido');
      const parsed = Number(numStr);
      if (!Number.isFinite(parsed)) throw new Error('Número inválido');
      tokens.push({ type: 'number', value: parsed });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < len && /[a-zA-Z0-9_.]/.test(input[i])) {
        ident += input[i];
        i += 1;
      }
      tokens.push({ type: 'ident', name: ident });
      continue;
    }

    if (ch === '*' && input[i + 1] === '*') {
      tokens.push({ type: 'op', op: '**' });
      i += 2;
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%') {
      tokens.push({ type: 'op', op: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }

    if (ch === ',') {
      tokens.push({ type: 'comma' });
      i += 1;
      continue;
    }

    throw new Error(`Carácter no permitido: ${ch}`);
  }

  return tokens;
}

function applyMathFunction(rawName: string, args: number[]): number {
  const normalized = rawName.startsWith('Math.') ? rawName.slice(5) : rawName;

  switch (normalized) {
    case 'sqrt':
      if (args.length !== 1) throw new Error('sqrt requiere 1 argumento');
      return Math.sqrt(Math.max(0, args[0]));
    case 'floor':
      if (args.length !== 1) throw new Error('floor requiere 1 argumento');
      return Math.floor(args[0]);
    case 'ceil':
      if (args.length !== 1) throw new Error('ceil requiere 1 argumento');
      return Math.ceil(args[0]);
    case 'round':
      if (args.length !== 1) throw new Error('round requiere 1 argumento');
      return Math.round(args[0]);
    case 'trunc':
      if (args.length !== 1) throw new Error('trunc requiere 1 argumento');
      return Math.trunc(args[0]);
    case 'abs':
      if (args.length !== 1) throw new Error('abs requiere 1 argumento');
      return Math.abs(args[0]);
    case 'log':
      if (args.length !== 1) throw new Error('log requiere 1 argumento');
      return args[0] <= 0 ? 0 : Math.log(args[0]);
    case 'log10':
      if (args.length !== 1) throw new Error('log10 requiere 1 argumento');
      return args[0] <= 0 ? 0 : Math.log10(args[0]);
    case 'exp':
      if (args.length !== 1) throw new Error('exp requiere 1 argumento');
      return Math.exp(args[0]);
    case 'pow':
      if (args.length !== 2) throw new Error('pow requiere 2 argumentos');
      return Math.pow(args[0], args[1]);
    case 'min':
      if (args.length < 1) throw new Error('min requiere argumentos');
      return Math.min(...args);
    case 'max':
      if (args.length < 1) throw new Error('max requiere argumentos');
      return Math.max(...args);
    default:
      throw new Error(`Función desconocida: ${rawName}`);
  }
}

function evaluateParsedTokens(
  tokens: Token[],
  varName: FormulaVariableName,
  varValue: number
): number {
  if (tokens.length === 0) throw new Error('Fórmula vacía');
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => {
    const t = tokens[pos];
    pos += 1;
    return t;
  };

  function parseExpression(): number {
    let left = parseTerm();
    while (true) {
      const next = peek();
      if (next && next.type === 'op' && (next.op === '+' || next.op === '-')) {
        consume();
        const right = parseTerm();
        left = next.op === '+' ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (true) {
      const next = peek();
      if (
        next &&
        next.type === 'op' &&
        (next.op === '*' || next.op === '/' || next.op === '%')
      ) {
        consume();
        const right = parsePower();
        if (next.op === '*') {
          left *= right;
        } else if (next.op === '/') {
          if (right === 0) throw new Error('División por cero');
          left /= right;
        } else {
          if (right === 0) throw new Error('Módulo por cero');
          left %= right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    const next = peek();
    if (next && next.type === 'op' && next.op === '**') {
      consume();
      const exponent = parsePower();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parseUnary(): number {
    const next = peek();
    if (next && next.type === 'op' && (next.op === '+' || next.op === '-')) {
      consume();
      const val = parseUnary();
      return next.op === '-' ? -val : val;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const tok = peek();
    if (!tok) throw new Error('Expresión incompleta');

    if (tok.type === 'number') {
      consume();
      return tok.value;
    }

    if (tok.type === 'lparen') {
      consume();
      const inner = parseExpression();
      const closing = peek();
      if (!closing || closing.type !== 'rparen') {
        throw new Error('Falta cerrar paréntesis');
      }
      consume();
      return inner;
    }

    if (tok.type === 'ident') {
      consume();
      const afterIdent = peek();
      if (afterIdent && afterIdent.type === 'lparen') {
        consume(); // '('
        const args: number[] = [];
        const maybeClose = peek();
        if (maybeClose && maybeClose.type === 'rparen') {
          consume();
        } else {
          while (true) {
            args.push(parseExpression());
            const sep = peek();
            if (sep && sep.type === 'comma') {
              consume();
              continue;
            }
            if (sep && sep.type === 'rparen') {
              consume();
              break;
            }
            throw new Error('Paréntesis o argumento inválido');
          }
        }
        return applyMathFunction(tok.name, args);
      }

      const lowered = tok.name.toLowerCase();
      const matchesVariable =
        varName === 'pasos'
          ? lowered === 'pasos' || lowered === 'steps'
          : lowered === 'minutos' || lowered === 'minutes';

      if (matchesVariable) {
        return varValue;
      }
      if (tok.name === 'Math.PI' || tok.name === 'PI') {
        return Math.PI;
      }
      if (tok.name === 'Math.E' || tok.name === 'E') {
        return Math.E;
      }
      throw new Error(`UNKNOWN_VAR:${tok.name}`);
    }

    throw new Error('Sintaxis inválida');
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error('Sintaxis inválida');
  }
  if (!Number.isFinite(result)) {
    throw new Error('Resultado no numérico');
  }
  return result;
}

const TOKEN_CACHE = new Map<string, Token[]>();

function getCachedTokens(trimmedFormula: string): Token[] {
  const cached = TOKEN_CACHE.get(trimmedFormula);
  if (cached) return cached;
  const parsed = tokenizeFormula(trimmedFormula);
  if (TOKEN_CACHE.size >= 64) {
    TOKEN_CACHE.clear();
  }
  TOKEN_CACHE.set(trimmedFormula, parsed);
  return parsed;
}

function translateFormulaError(
  rawMessage: string,
  varName: FormulaVariableName,
  language: 'es' | 'en'
): string {
  if (rawMessage.startsWith('UNKNOWN_VAR:')) {
    const ident = rawMessage.slice('UNKNOWN_VAR:'.length);
    if (language === 'en') {
      const hint = varName === 'pasos' ? 'steps' : 'minutes';
      return `Unknown variable: ${ident} (use ${hint})`;
    }
    return `Variable no reconocida: ${ident} (usa ${varName})`;
  }

  if (language !== 'en') return rawMessage;

  if (rawMessage === 'Fórmula vacía') return 'Empty formula';
  if (rawMessage === 'Número inválido') return 'Invalid number';
  if (rawMessage === 'División por cero') return 'Division by zero';
  if (rawMessage === 'Módulo por cero') return 'Modulo by zero';
  if (rawMessage === 'Expresión incompleta') return 'Incomplete expression';
  if (rawMessage === 'Falta cerrar paréntesis') return 'Missing closing parenthesis';
  if (rawMessage === 'Paréntesis o argumento inválido') return 'Invalid parenthesis or argument';
  if (rawMessage === 'Sintaxis inválida') return 'Invalid syntax';
  if (rawMessage === 'Resultado no numérico') return 'Non-numeric result';
  if (rawMessage.startsWith('Carácter no permitido:')) {
    return rawMessage.replace('Carácter no permitido:', 'Invalid character:');
  }
  if (rawMessage.startsWith('Función desconocida:')) {
    return rawMessage.replace('Función desconocida:', 'Unknown function:');
  }
  return rawMessage
    .replace('requiere 1 argumento', 'requires 1 argument')
    .replace('requiere 2 argumentos', 'requires 2 arguments')
    .replace('requiere argumentos', 'requires arguments');
}

export function validateXpFormula(
  formula: string,
  varName: FormulaVariableName,
  language: 'es' | 'en' = 'es'
): { valid: boolean; sampleXp?: number; error?: string } {
  try {
    const trimmed = formula.trim();
    if (!trimmed) {
      return {
        valid: false,
        error: language === 'en' ? 'Empty formula' : 'Fórmula vacía',
      };
    }
    const tokens = getCachedTokens(trimmed);
    const sampleInput = varName === 'pasos' ? 10000 : 45;
    const raw = evaluateParsedTokens(tokens, varName, sampleInput);
    return {
      valid: true,
      sampleXp: Math.min(100_000, Math.max(0, Math.floor(raw))),
    };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Fórmula inválida';
    return {
      valid: false,
      error: translateFormulaError(rawMessage, varName, language),
    };
  }
}

export function evaluateXpFormula(
  formula: string,
  varName: FormulaVariableName,
  value: number,
  fallbackFormula: string
): number {
  const safeVal = Math.max(0, value);
  if (safeVal === 0) return 0;

  const trimmed = formula.trim();

  // Fast-path directo en JS nativo para las fórmulas predeterminadas más frecuentes
  if (
    varName === 'pasos' &&
    (trimmed === 'Math.floor(Math.sqrt(pasos))' || trimmed === 'Math.floor(Math.sqrt(steps))')
  ) {
    return Math.floor(Math.sqrt(safeVal));
  }
  if (varName === 'minutos') {
    if (
      trimmed === 'Math.floor(30 * Math.sqrt(minutos))' ||
      trimmed === 'Math.floor(30 * Math.sqrt(minutes))'
    ) {
      return Math.floor(30 * Math.sqrt(safeVal));
    }
    if (
      trimmed === 'Math.floor(25 * Math.sqrt(minutos))' ||
      trimmed === 'Math.floor(25 * Math.sqrt(minutes))'
    ) {
      return Math.floor(25 * Math.sqrt(safeVal));
    }
  }

  try {
    const tokens = getCachedTokens(trimmed);
    const raw = evaluateParsedTokens(tokens, varName, safeVal);
    return Math.min(100_000, Math.max(0, Math.floor(raw)));
  } catch {
    try {
      const fallbackTokens = getCachedTokens(fallbackFormula.trim());
      const rawFallback = evaluateParsedTokens(fallbackTokens, varName, safeVal);
      return Math.min(100_000, Math.max(0, Math.floor(rawFallback)));
    } catch {
      return 0;
    }
  }
}
