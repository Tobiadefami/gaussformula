/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import { CellError, ErrorType } from "./Cell";
import {
  ConfidenceIntervalNumber,
  CurrencyNumber,
  DateNumber,
  DateTimeNumber,
  ExtendedNumber,
  PercentNumber,
  SampledDistribution,
  TimeNumber,
  cloneNumber,
  getRawValue,
} from "./interpreter/InterpreterValue";
import { DateTimeHelper, timeToNumber } from "./DateTimeHelper";
import {
  fixNegativeZero,
  isNumberOverflow,
} from "./interpreter/ArithmeticHelper";

import { Config } from "./Config";
import { ErrorMessage } from "./error-message";
import { Maybe } from "./Maybe";
import { NumberLiteralHelper } from "./NumberLiteralHelper";
import { UnableToParseError } from "./errors";

export type RawCellContent =
  | Date
  | string
  | number
  | boolean
  | null
  | undefined;

export namespace CellContent {
  export class Number {
    constructor(public readonly value: ExtendedNumber) {
      this.value = cloneNumber(
        this.value,
        fixNegativeZero(getRawValue(this.value))
      );
    }
  }

  export class String {
    constructor(public readonly value: string) {}
  }

  export class Boolean {
    constructor(public readonly value: boolean) {}
  }

  export class Empty {
    private static instance: Empty;

    public static getSingletonInstance() {
      if (!Empty.instance) {
        Empty.instance = new Empty();
      }
      return Empty.instance;
    }
  }

  export class Formula {
    constructor(public readonly formula: string) {}
  }

  export class Error {
    public readonly value: CellError;

    constructor(errorType: ErrorType, message?: string) {
      this.value = new CellError(errorType, message);
    }
  }

  export type Type = Number | String | Boolean | Empty | Formula | Error;
}

/**
 * Checks whether string looks like formula or not.
 *
 * @param text - formula
 */
export function isFormula(text: string): boolean {
  return text.startsWith("=");
}

export function isBoolean(text: string): boolean {
  const tl = text.toLowerCase();
  return tl === "true" || tl === "false";
}

export function isError(
  text: string,
  errorMapping: Record<string, ErrorType>
): boolean {
  const upperCased = text.toUpperCase();
  const errorRegex = /#[A-Za-z0-9\/]+[?!]?/;
  return (
    errorRegex.test(upperCased) &&
    Object.prototype.hasOwnProperty.call(errorMapping, upperCased)
  );
}

export class CellContentParser {
  constructor(
    private readonly config: Config,
    private readonly dateHelper: DateTimeHelper,
    private readonly numberLiteralsHelper: NumberLiteralHelper
  ) {}

  public parse(content: RawCellContent): CellContent.Type {
    if (content === undefined || content === null) {
      return CellContent.Empty.getSingletonInstance();
    } else if (typeof content === "number") {
      if (isNumberOverflow(content)) {
        return new CellContent.Error(ErrorType.NUM, ErrorMessage.ValueLarge);
      } else {
        return new CellContent.Number(content);
      }
    } else if (typeof content === "boolean") {
      return new CellContent.Boolean(content);
    } else if (content instanceof Date) {
      const dateVal = this.dateHelper.dateToNumber({
        day: content.getDate(),
        month: content.getMonth() + 1,
        year: content.getFullYear(),
      });
      const timeVal = timeToNumber({
        hours: content.getHours(),
        minutes: content.getMinutes(),
        seconds: content.getSeconds() + content.getMilliseconds() / 1000,
      });
      const val = dateVal + timeVal;
      if (val < 0) {
        return new CellContent.Error(ErrorType.NUM, ErrorMessage.DateBounds);
      }
      if (val % 1 === 0) {
        return new CellContent.Number(new DateNumber(val, "Date()"));
      } else if (val < 1) {
        return new CellContent.Number(new TimeNumber(val, "Date()"));
      } else {
        return new CellContent.Number(new DateTimeNumber(val, "Date()"));
      }
    } else if (typeof content === "string") {
      if (isBoolean(content)) {
        return new CellContent.Boolean(content.toLowerCase() === "true");
      } else if (isFormula(content)) {
        return new CellContent.Formula(content);
      } else if (isError(content, this.config.errorMapping)) {
        return new CellContent.Error(
          this.config.errorMapping[content.toUpperCase()]
        );
      }

      // Try to parse as confidence interval - support multiple formats
      // CI[lower, upper], [lower, upper], or "lower to upper"
      
      // Format 1: CI[20, 50]
      let confidenceIntervalMatch =
        /^CI\s*\[\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\]$/i.exec(content);
      
      // Format 2: [20, 50]
      if (!confidenceIntervalMatch) {
        confidenceIntervalMatch =
          /^\[\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*\]$/.exec(content);
      }
      
      // Format 3: 20 to 50 (range style)
      if (!confidenceIntervalMatch) {
        confidenceIntervalMatch =
          /^([+-]?\d*\.?\d+)\s+to\s+([+-]?\d*\.?\d+)$/i.exec(content);
      }
      
      if (confidenceIntervalMatch) {
        const lower = Number(confidenceIntervalMatch[1]);
        const upper = Number(confidenceIntervalMatch[2]);
        if (!isNaN(lower) && !isNaN(upper) && lower <= upper) {
          return new CellContent.Number(
            new ConfidenceIntervalNumber(lower, upper, 95)
          );
        }
      }

      // Try to parse as SampledDistribution
      const sampledMatch =
        /^S\(\u03BC=([+-]?\d*\.?\d+),\s*\u03C3\u00B2=([+-]?\d*\.?\d+)\)$/.exec(
          content
        );
      if (sampledMatch) {
        const mean = Number(sampledMatch[1]);
        const variance = Number(sampledMatch[2]);
        if (!isNaN(mean) && !isNaN(variance)) {
          const sampledDistribution = SampledDistribution.fromMeanAndVariance(
            mean,
            variance,
            this.config
          );
          return new CellContent.Number(sampledDistribution);
        }
      }

      let trimmedContent = content.trim();
      let mode = 0;
      let currency;
      if (trimmedContent.endsWith("%")) {
        mode = 1;
        trimmedContent = trimmedContent.slice(0, trimmedContent.length - 1);
      } else {
        const res = this.currencyMatcher(trimmedContent);
        if (res !== undefined) {
          mode = 2;
          [currency, trimmedContent] = res;
        }
      }

      const val: number | any =
        this.numberLiteralsHelper.numericStringToMaybeNumber(trimmedContent);
      if (val !== undefined) {
        let parseAsNum;
        if (mode === 1) {
          parseAsNum = new PercentNumber(val / 100);
        } else if (mode === 2) {
          parseAsNum = new CurrencyNumber(val, currency as string);
        } else {
          parseAsNum = val;
        }
        return new CellContent.Number(parseAsNum);
      }
      const parsedDateNumber =
        this.dateHelper.dateStringToDateNumber(trimmedContent);
      if (parsedDateNumber !== undefined) {
        return new CellContent.Number(parsedDateNumber);
      } else {
        return new CellContent.String(
          content.startsWith("'") ? content.slice(1) : content
        );
      }
    } else {
      throw new UnableToParseError(content);
    }
  }

  private currencyMatcher(token: string): Maybe<[string, string]> {
    for (const currency of this.config.currencySymbol) {
      if (token.startsWith(currency)) {
        return [currency, token.slice(currency.length)];
      }
      if (token.endsWith(currency)) {
        return [currency, token.slice(0, token.length - currency.length)];
      }
    }
    return undefined;
  }
}
