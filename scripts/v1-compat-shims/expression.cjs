'use strict';

const VALID_UNITS = new Set(['year', 'month', 'week', 'day', 'hour', 'minute', 'second']);

function splitArguments(input) {
  const parts = [];
  let current = '';
  let quote = null;

  for (const char of input) {
    if ((char === '"' || char === '\'') && quote === null) {
      quote = char;
      current += char;
      continue;
    }
    if (char === quote) {
      quote = null;
      current += char;
      continue;
    }
    if (char === ',' && quote === null) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function parseArgument(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1);
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return `$${value}`;
}

class ExpressionCompiler {
  compile(expression) {
    const source = String(expression ?? '').trim();
    const match = source.match(/^([A-Z_]+)\((.*)\)$/);
    if (!match) {
      throw new Error(`Unsupported expression: ${source}`);
    }

    const [, fnName, rawArgs] = match;
    const args = splitArguments(rawArgs).map(parseArgument);

    switch (fnName) {
      case 'DATE_ADD': {
        if (args.length !== 3) {
          throw new Error('DATE_ADD requires 3 arguments');
        }
        const [startDate, amount, unit] = args;
        if (!VALID_UNITS.has(unit)) {
          throw new Error(`Invalid time unit: ${unit}`);
        }
        return { $dateAdd: { startDate, amount, unit } };
      }
      case 'DATE_SUBTRACT': {
        if (args.length !== 3) {
          throw new Error('DATE_SUBTRACT requires 3 arguments');
        }
        const [startDate, amount, unit] = args;
        if (!VALID_UNITS.has(unit)) {
          throw new Error(`Invalid time unit: ${unit}`);
        }
        return { $dateSubtract: { startDate, amount, unit } };
      }
      case 'DATE_DIFF': {
        if (args.length !== 3) {
          throw new Error('DATE_DIFF requires 3 arguments');
        }
        const [endDate, startDate, unit] = args;
        if (!VALID_UNITS.has(unit)) {
          throw new Error(`Invalid time unit: ${unit}`);
        }
        return { $dateDiff: { startDate, endDate, unit } };
      }
      case 'DATE_TO_STRING': {
        if (args.length !== 2) {
          throw new Error('DATE_TO_STRING requires 2 arguments');
        }
        const [date, format] = args;
        return { $dateToString: { date, format } };
      }
      case 'DATE_FROM_STRING': {
        if (args.length < 1 || args.length > 2) {
          throw new Error('DATE_FROM_STRING requires 1 or 2 arguments');
        }
        const [dateString, format] = args;
        const payload = { dateString };
        if (format !== undefined) {
          payload.format = format;
        }
        return { $dateFromString: payload };
      }
      default:
        throw new Error(`Unsupported expression function: ${fnName}`);
    }
  }
}

module.exports = { ExpressionCompiler };
