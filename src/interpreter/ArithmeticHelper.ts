/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {
  CellError,
  CellValueTypeOrd,
  ErrorType,
  getCellValueType,
} from "../Cell";
import {
  ConfidenceIntervalNumber,
  CurrencyNumber,
  DateNumber,
  DateTimeNumber,
  EmptyValue,
  ExtendedNumber,
  GaussianNumber,
  InternalNoErrorScalarValue,
  InternalScalarValue,
  InterpreterValue,
  NumberType,
  NumberTypeWithFormat,
  PercentNumber,
  RawInterpreterValue,
  RawNoErrorScalarValue,
  RawScalarValue,
  SampledDistribution,
  TimeNumber,
  cloneNumber,
  getRawValue,
  getTypeFormatOfExtendedNumber,
  isExtendedNumber,
} from "./InterpreterValue";

import { Config } from "../Config";
import { DateTimeHelper } from "../DateTimeHelper";
import { ErrorMessage } from "../error-message";
import { InterpreterState } from "./InterpreterState";
import { Maybe } from "../Maybe";
import { NumberLiteralHelper } from "../NumberLiteralHelper";
import { SimpleRangeValue } from "../SimpleRangeValue";
import { collatorFromConfig } from "../StringHelper";

import Collator = Intl.Collator;

export type complex = [number, number];

const COMPLEX_NUMBER_SYMBOL = "i";
const complexParsingRegexp =
  /^\s*([+-]?)\s*(([\d\.,]+(e[+-]?\d+)?)\s*([ij]?)|([ij]))\s*(([+-])\s*([+-]?)\s*(([\d\.,]+(e[+-]?\d+)?)\s*([ij]?)|([ij])))?$/;

export class ArithmeticHelper {
  private readonly collator: Collator;
  private readonly actualEps: number;

  constructor(
    private readonly config: Config,
    private readonly dateTimeHelper: DateTimeHelper,
    private readonly numberLiteralsHelper: NumberLiteralHelper
  ) {
    this.collator = collatorFromConfig(config);
    this.actualEps = config.smartRounding ? config.precisionEpsilon : 0;
  }

  /**
   * ========================================================================
   * Near-Zero Value Handling for Gaussian and Sampled Distribution Arithmetic
   * ========================================================================
   *
   * When working with sampled distributions (Gaussian and SampledDistribution),
   * some samples may be very close to zero but not exactly zero. This can cause
   * numerical instability issues:
   *
   * 1. Division: Dividing by values very close to zero results in extremely
   *    large numbers that can cause overflow or precision loss
   * 2. Multiplication: Multiplying by near-zero values should snap to exact zero
   *    to maintain numerical stability
   *
   * Our approach:
   * - Use different epsilon thresholds for different operations
   * - For division: Use a more conservative threshold (1000x normal epsilon)
   *   to prevent numerical instability
   * - For multiplication: Use normal epsilon and snap to exact zero
   * - Check for overflow and non-finite results in division operations
   */

  /**
   * Check if a value is close enough to zero to be considered effectively zero
   * for numerical stability in operations like division and multiplication.
   *
   * For division operations, we use a more conservative threshold to prevent
   * numerical instability from very small denominators.
   */
  private isEffectivelyZero(
    value: number,
    forDivision: boolean = false
  ): boolean {
    if (forDivision) {
      // Use a larger threshold for division to prevent numerical instability
      // This is typically 1000x the normal epsilon to catch values that would
      // cause overflow or extreme numerical instability
      const divisionThreshold = Math.max(this.actualEps * 1000, 1e-12);
      return Math.abs(value) < divisionThreshold;
    } else {
      // For multiplication and other operations, use the normal epsilon
      const multiplicationThreshold = Math.max(this.actualEps, 1e-12);
      return Math.abs(value) < multiplicationThreshold;
    }
  }

  /**
   * Handle near-zero values in division operations to prevent numerical instability
   * Returns either the result or a marker for values that should be treated as zero
   */
  private safeDivision(numerator: number, denominator: number): number | null {
    if (denominator === 0 || this.isEffectivelyZero(denominator, true)) {
      return null; // Signal division by zero
    }

    const result = numerator / denominator;

    // Check for numerical overflow/instability
    if (
      !Number.isFinite(result) ||
      Math.abs(result) > Number.MAX_SAFE_INTEGER
    ) {
      return null; // Signal numerical instability
    }

    return result;
  }

  /**
   * Handle near-zero values in multiplication to avoid precision issues
   */
  private safeMultiplication(left: number, right: number): number {
    // If either value is effectively zero, return exact zero
    if (this.isEffectivelyZero(left) || this.isEffectivelyZero(right)) {
      return 0;
    }

    return left * right;
  }

  public eqMatcherFunction(
    pattern: string
  ): (arg: RawInterpreterValue) => boolean {
    const regexp = this.buildRegex(pattern);
    return (cellValue) =>
      typeof cellValue === "string" &&
      regexp.test(this.normalizeString(cellValue));
  }

  public neqMatcherFunction(
    pattern: string
  ): (arg: RawInterpreterValue) => boolean {
    const regexp = this.buildRegex(pattern);
    return (cellValue) => {
      return (
        !(typeof cellValue === "string") ||
        !regexp.test(this.normalizeString(cellValue))
      );
    };
  }

  public searchString(pattern: string, text: string): number {
    const regexp = this.buildRegex(pattern, false);
    const result = regexp.exec(text);
    return result?.index ?? -1;
  }

  public requiresRegex(pattern: string): boolean {
    if (!this.config.useRegularExpressions && !this.config.useWildcards) {
      return !this.config.matchWholeCell;
    }
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern.charAt(i);
      if (
        isWildcard(c) ||
        (this.config.useRegularExpressions && needsEscape(c))
      ) {
        return true;
      }
    }
    return false;
  }

  public lt = (
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): boolean => {
    return this.compare(left, right) < 0;
  };

  public leq = (
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): boolean => {
    return this.compare(left, right) <= 0;
  };

  public gt = (
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): boolean => {
    return this.compare(left, right) > 0;
  };

  public geq = (
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): boolean => {
    return this.compare(left, right) >= 0;
  };

  public eq = (
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): boolean => {
    return this.compare(left, right) === 0;
  };

  public neq = (
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): boolean => {
    return this.compare(left, right) !== 0;
  };

  public floatCmp(leftArg: ExtendedNumber, rightArg: ExtendedNumber): number {
    const left = getRawValue(leftArg);
    const right = getRawValue(rightArg);
    const mod = 1 + this.actualEps;
    if (right >= 0 && left * mod >= right && left <= right * mod) {
      return 0;
    } else if (right <= 0 && left * mod <= right && left >= right * mod) {
      return 0;
    } else if (left > right) {
      return 1;
    } else {
      return -1;
    }
  }

  public pow = (left: ExtendedNumber, right: ExtendedNumber) => {
    if (left instanceof GaussianNumber || right instanceof GaussianNumber) {
      return this.powGaussians(left, right);
    }
    return Math.pow(getRawValue(left), getRawValue(right));
  };

  private powGaussians(
    left: ExtendedNumber,
    right: ExtendedNumber
  ): GaussianNumber {
    const leftMean =
      left instanceof GaussianNumber ? left.mean : getRawValue(left);
    const rightMean =
      right instanceof GaussianNumber ? right.mean : getRawValue(right);
    const leftVariance = left instanceof GaussianNumber ? left.variance : 0;
    const rightVariance = right instanceof GaussianNumber ? right.variance : 0;

    // For x^y where x is Gaussian, we propagate the uncertainty
    // This is an approximation - in reality, the uncertainty would be more complex
    const mean = Math.pow(leftMean, rightMean);
    const variance =
      Math.abs(rightMean * Math.pow(leftMean, rightMean - 1)) * leftVariance;

    return new GaussianNumber(mean, variance);
  }

  public addWithEpsilonRaw = (left: number, right: number): number => {
    const ret = left + right;
    if (Math.abs(ret) < this.actualEps * Math.abs(left)) {
      return 0;
    } else {
      return ret;
    }
  };

  public addWithEpsilon = (
    left: ExtendedNumber,
    right: ExtendedNumber
  ): ExtendedNumber => {
    if (
      left instanceof GaussianNumber ||
      right instanceof GaussianNumber ||
      left instanceof SampledDistribution ||
      right instanceof SampledDistribution ||
      left instanceof ConfidenceIntervalNumber ||
      right instanceof ConfidenceIntervalNumber
    ) {
      return this.addDistributions(left, right);
    }
    const typeOfResult = inferExtendedNumberTypeAdditive(left, right);
    return this.ExtendedNumberFactory(
      this.addWithEpsilonRaw(getRawValue(left), getRawValue(right)),
      typeOfResult
    );
  };

  private calculateMeanAndVariance(samples: number[]): {
    mean: number;
    variance: number;
  } {
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const variance =
      samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / samples.length;
    return { mean, variance };
  }

  private addDistributions(
    left: ExtendedNumber,
    right: ExtendedNumber
  ): ExtendedNumber {
    // Convert ConfidenceIntervalNumber to GaussianNumber for arithmetic
    if (left instanceof ConfidenceIntervalNumber) {
      left = left.toGaussian();
    }
    if (right instanceof ConfidenceIntervalNumber) {
      right = right.toGaussian();
    }
    if (
      (left instanceof GaussianNumber || left instanceof SampledDistribution) &&
      (right instanceof GaussianNumber || right instanceof SampledDistribution)
    ) {
      const leftSamples = left.getSamples();
      const rightSamples = right.getSamples();
      const resultSamples = leftSamples.map((val, i) => val + rightSamples[i]);

      if (left instanceof GaussianNumber && right instanceof GaussianNumber) {
        // Addition preserves normality, so we can return a GaussianNumber
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    } else if (
      left instanceof GaussianNumber ||
      left instanceof SampledDistribution
    ) {
      const rightValue = getRawValue(right);
      const leftSamples = left.getSamples();
      const resultSamples = leftSamples.map((val) => val + rightValue);

      if (left instanceof GaussianNumber) {
        // Addition with scalar preserves normality
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    } else {
      const leftValue = getRawValue(left);
      const rightSamples = (right as GaussianNumber).getSamples();
      const resultSamples = rightSamples.map((val) => leftValue + val);

      if (right instanceof GaussianNumber) {
        // Addition with scalar preserves normality
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    }
  }

  public unaryMinus = (arg: ExtendedNumber): ExtendedNumber => {
    if (arg instanceof GaussianNumber) {
      return new GaussianNumber(-arg.mean, arg.variance);
    }
    return cloneNumber(arg, -getRawValue(arg));
  };

  public unaryPlus = (arg: InternalScalarValue): InternalScalarValue => arg;

  public unaryPercent = (arg: ExtendedNumber): ExtendedNumber => {
    if (arg instanceof GaussianNumber) {
      return new GaussianNumber(arg.mean / 100, arg.variance / 10000);
    }
    return new PercentNumber(getRawValue(arg) / 100);
  };

  public concat = (left: string, right: string): string => {
    return left.concat(right);
  };

  public nonstrictadd = (
    left: RawScalarValue,
    right: RawScalarValue
  ): number | CellError => {
    if (left instanceof CellError) {
      return left;
    } else if (right instanceof CellError) {
      return right;
    } else if (typeof left === "number") {
      if (typeof right === "number") {
        return this.addWithEpsilonRaw(left, right);
      } else {
        return left;
      }
    } else if (typeof right === "number") {
      return right;
    } else {
      return 0;
    }
  };

  /**
   * Subtracts two numbers
   *
   * Implementation of subtracting which is used in interpreter.
   *
   * @param left - left operand of subtraction
   * @param right - right operand of subtraction
   * @param eps - precision of comparison
   */
  public subtract = (
    leftArg: ExtendedNumber,
    rightArg: ExtendedNumber
  ): ExtendedNumber => {
    if (
      leftArg instanceof GaussianNumber ||
      rightArg instanceof GaussianNumber ||
      leftArg instanceof SampledDistribution ||
      rightArg instanceof SampledDistribution
    ) {
      return this.subtractDistributions(leftArg, rightArg);
    }
    const typeOfResult = inferExtendedNumberTypeAdditive(leftArg, rightArg);
    const left = getRawValue(leftArg);
    const right = getRawValue(rightArg);
    let ret = left - right;
    if (Math.abs(ret) < this.actualEps * Math.abs(left)) {
      ret = 0;
    }
    return this.ExtendedNumberFactory(ret, typeOfResult);
  };

  private subtractDistributions(
    left: ExtendedNumber,
    right: ExtendedNumber
  ): ExtendedNumber {
    if (
      (left instanceof GaussianNumber || left instanceof SampledDistribution) &&
      (right instanceof GaussianNumber || right instanceof SampledDistribution)
    ) {
      const leftSamples = left.getSamples();
      const rightSamples = right.getSamples();
      const resultSamples = leftSamples.map((val, i) => val - rightSamples[i]);
      if (left instanceof GaussianNumber && right instanceof GaussianNumber) {
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    } else if (
      left instanceof GaussianNumber ||
      left instanceof SampledDistribution
    ) {
      const rightValue = getRawValue(right);
      const leftSamples = left.getSamples();
      const resultSamples = leftSamples.map((val) => val - rightValue);
      if (left instanceof GaussianNumber) {
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    } else {
      const leftValue = getRawValue(left);
      const rightSamples = (right as GaussianNumber).getSamples();
      const resultSamples = rightSamples.map((val) => leftValue - val);
      if (right instanceof GaussianNumber) {
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    }
  }

  public multiply = (
    left: ExtendedNumber,
    right: ExtendedNumber
  ): ExtendedNumber => {
    if (
      left instanceof GaussianNumber ||
      right instanceof GaussianNumber ||
      left instanceof SampledDistribution ||
      right instanceof SampledDistribution
    ) {
      return this.multiplyDistributions(left, right);
    }
    const typeOfResult = inferExtendedNumberTypeMultiplicative(left, right);
    return this.ExtendedNumberFactory(
      this.safeMultiplication(getRawValue(left), getRawValue(right)),
      typeOfResult
    );
  };

  private multiplyDistributions(
    left: ExtendedNumber,
    right: ExtendedNumber
  ): ExtendedNumber {
    if (
      (left instanceof GaussianNumber || left instanceof SampledDistribution) &&
      (right instanceof GaussianNumber || right instanceof SampledDistribution)
    ) {
      const leftSamples = left.getSamples();
      const rightSamples = right.getSamples();
      const resultSamples = leftSamples.map((val, i) =>
        this.safeMultiplication(val, rightSamples[i])
      );

      return new SampledDistribution(resultSamples);
    } else if (
      left instanceof GaussianNumber ||
      left instanceof SampledDistribution
    ) {
      const rightValue = getRawValue(right);
      const leftSamples = left.getSamples();
      const resultSamples = leftSamples.map((val) =>
        this.safeMultiplication(val, rightValue)
      );
      if (left instanceof GaussianNumber) {
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    } else {
      const leftValue = getRawValue(left);
      const rightSamples = (right as GaussianNumber).getSamples();
      const resultSamples = rightSamples.map((val) =>
        this.safeMultiplication(leftValue, val)
      );
      if (right instanceof GaussianNumber) {
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    }
  }

  public divide = (
    left: ExtendedNumber,
    right: ExtendedNumber
  ): ExtendedNumber | CellError => {
    if (
      left instanceof GaussianNumber ||
      right instanceof GaussianNumber ||
      left instanceof SampledDistribution ||
      right instanceof SampledDistribution
    ) {
      return this.divideDistributions(left, right);
    }
    const rightValue = getRawValue(right);
    if (rightValue === 0 || this.isEffectivelyZero(rightValue, true)) {
      return new CellError(ErrorType.DIV_BY_ZERO);
    }
    const typeOfResult = inferExtendedNumberTypeMultiplicative(left, right);
    const result = this.safeDivision(getRawValue(left), rightValue);
    if (result === null) {
      return new CellError(ErrorType.DIV_BY_ZERO);
    }
    return this.ExtendedNumberFactory(result, typeOfResult);
  };

  private divideDistributions(
    left: ExtendedNumber,
    right: ExtendedNumber
  ): ExtendedNumber | CellError {
    if (
      (left instanceof GaussianNumber || left instanceof SampledDistribution) &&
      (right instanceof GaussianNumber || right instanceof SampledDistribution)
    ) {
      const leftSamples = left.getSamples();
      const rightSamples = right.getSamples();

      // Check for division by zero or near-zero values
      const resultSamples: number[] = [];
      for (let i = 0; i < leftSamples.length; i++) {
        const result = this.safeDivision(leftSamples[i], rightSamples[i]);
        if (result === null) {
          return new CellError(ErrorType.DIV_BY_ZERO);
        }
        resultSamples.push(result);
      }

      // Division of two Gaussians does not preserve normality
      return new SampledDistribution(resultSamples);
    } else if (
      left instanceof GaussianNumber ||
      left instanceof SampledDistribution
    ) {
      const rightValue = getRawValue(right);
      if (rightValue === 0 || this.isEffectivelyZero(rightValue, true)) {
        return new CellError(ErrorType.DIV_BY_ZERO);
      }

      const leftSamples = left.getSamples();
      const resultSamples = leftSamples.map((val) => {
        const result = this.safeDivision(val, rightValue);
        return result === null ? 0 : result; // This shouldn't happen since we checked rightValue above
      });
      if (left instanceof GaussianNumber) {
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    } else {
      const leftValue = getRawValue(left);
      const rightSamples = (right as GaussianNumber).getSamples();

      // Check for division by zero or near-zero values
      const resultSamples: number[] = [];
      for (let i = 0; i < rightSamples.length; i++) {
        const result = this.safeDivision(leftValue, rightSamples[i]);
        if (result === null) {
          return new CellError(ErrorType.DIV_BY_ZERO);
        }
        resultSamples.push(result);
      }

      if (right instanceof GaussianNumber) {
        const { mean, variance } = this.calculateMeanAndVariance(resultSamples);
        return new GaussianNumber(mean, variance);
      } else {
        return new SampledDistribution(resultSamples);
      }
    }
  }

  public coerceScalarToNumberOrError(
    arg: InternalScalarValue
  ): ExtendedNumber | CellError {
    if (arg instanceof CellError) {
      return arg;
    }
    return (
      this.coerceToMaybeNumber(arg) ??
      new CellError(ErrorType.VALUE, ErrorMessage.NumberCoercion)
    );
  }

  public coerceToMaybeNumber(arg: InternalScalarValue): Maybe<ExtendedNumber> {
    return (
      this.coerceNonDateScalarToMaybeNumber(arg) ??
      (typeof arg === "string"
        ? this.dateTimeHelper.dateStringToDateNumber(arg)
        : undefined)
    );
  }

  public coerceNonDateScalarToMaybeNumber(
    arg: InternalScalarValue
  ): Maybe<ExtendedNumber> {
    if (arg === EmptyValue) {
      return 0;
    } else if (typeof arg === "string") {
      if (arg === "") {
        return 0;
      }

      const maybePercentNumber = this.coerceStringToMaybePercentNumber(arg);
      if (maybePercentNumber !== undefined) {
        return maybePercentNumber;
      }

      const maybeCurrencyNumber = this.coerceStringToMaybeCurrencyNumber(arg);
      if (maybeCurrencyNumber !== undefined) {
        return maybeCurrencyNumber;
      }

      return this.numberLiteralsHelper.numericStringToMaybeNumber(arg.trim());
    } else if (isExtendedNumber(arg)) {
      return arg;
    } else if (typeof arg === "boolean") {
      return Number(arg);
    } else {
      return undefined;
    }
  }

  private coerceStringToMaybePercentNumber(
    input: string
  ): Maybe<PercentNumber> {
    const trimmedInput = input.trim();

    if (trimmedInput.endsWith("%")) {
      const numOfPercents = trimmedInput
        .slice(0, trimmedInput.length - 1)
        .trim();
      const parsedNumOfPercents: number | any =
        this.numberLiteralsHelper.numericStringToMaybeNumber(numOfPercents);
      if (parsedNumOfPercents !== undefined) {
        return new PercentNumber(parsedNumOfPercents / 100);
      }
    }

    return undefined;
  }

  private coerceStringToMaybeCurrencyNumber(
    input: string
  ): Maybe<CurrencyNumber> {
    const matchedCurrency = this.currencyMatcher(input.trim());

    if (matchedCurrency !== undefined) {
      const [currencySymbol, currencyValue] = matchedCurrency;
      const parsedCurrencyValue: number | any =
        this.numberLiteralsHelper.numericStringToMaybeNumber(currencyValue);
      if (parsedCurrencyValue !== undefined) {
        return new CurrencyNumber(parsedCurrencyValue, currencySymbol);
      }
    }

    return undefined;
  }

  private currencyMatcher(token: string): Maybe<[string, string]> {
    for (const currency of this.config.currencySymbol) {
      if (token.startsWith(currency)) {
        return [currency, token.slice(currency.length).trim()];
      }
      if (token.endsWith(currency)) {
        return [
          currency,
          token.slice(0, token.length - currency.length).trim(),
        ];
      }
    }
    return undefined;
  }

  public coerceComplexExactRanges(
    args: InterpreterValue[]
  ): complex[] | CellError {
    const vals: (complex | SimpleRangeValue)[] = [];
    for (const arg of args) {
      if (arg instanceof SimpleRangeValue) {
        vals.push(arg);
      } else if (arg !== EmptyValue) {
        const coerced = this.coerceScalarToComplex(arg);
        if (coerced instanceof CellError) {
          return coerced;
        } else {
          vals.push(coerced);
        }
      }
    }
    const expandedVals: complex[] = [];
    for (const val of vals) {
      if (val instanceof SimpleRangeValue) {
        const arr = this.manyToExactComplex(val.valuesFromTopLeftCorner());
        if (arr instanceof CellError) {
          return arr;
        } else {
          expandedVals.push(...arr);
        }
      } else {
        expandedVals.push(val);
      }
    }
    return expandedVals;
  }

  public manyToExactComplex = (
    args: InternalScalarValue[]
  ): complex[] | CellError => {
    const ret: complex[] = [];
    for (const arg of args) {
      if (arg instanceof CellError) {
        return arg;
      } else if (isExtendedNumber(arg) || typeof arg === "string") {
        const coerced = this.coerceScalarToComplex(arg);
        if (!(coerced instanceof CellError)) {
          ret.push(coerced);
        }
      }
    }
    return ret;
  };

  public coerceNumbersExactRanges = (
    args: InterpreterValue[]
  ): number[] | CellError => this.manyToNumbers(args, this.manyToExactNumbers);

  public coerceNumbersCoerceRangesDropNulls = (
    args: InterpreterValue[]
  ): number[] | CellError =>
    this.manyToNumbers(args, this.manyToCoercedNumbersDropNulls);

  public manyToExactNumbers = (
    args: InternalScalarValue[]
  ): number[] | CellError => {
    const ret: number[] = [];
    for (const arg of args) {
      if (arg instanceof CellError) {
        return arg;
      } else if (isExtendedNumber(arg)) {
        ret.push(getRawValue(arg));
      }
    }
    return ret;
  };

  public manyToOnlyNumbersDropNulls = (
    args: InterpreterValue[]
  ): number[] | CellError => {
    const ret: number[] = [];
    for (const arg of args) {
      if (arg instanceof CellError) {
        return arg;
      } else if (isExtendedNumber(arg)) {
        ret.push(getRawValue(arg));
      } else if (arg !== EmptyValue) {
        return new CellError(ErrorType.VALUE, ErrorMessage.NumberExpected);
      }
    }
    return ret;
  };

  public manyToCoercedNumbersDropNulls = (
    args: InternalScalarValue[]
  ): number[] | CellError => {
    const ret: number[] = [];
    for (const arg of args) {
      if (arg instanceof CellError) {
        return arg;
      }
      if (arg === EmptyValue) {
        continue;
      }
      const coerced = this.coerceScalarToNumberOrError(arg);
      if (isExtendedNumber(coerced)) {
        ret.push(getRawValue(coerced));
      }
    }
    return ret;
  };

  public coerceScalarToComplex(arg: InternalScalarValue): complex | CellError {
    if (arg instanceof CellError) {
      return arg;
    } else if (arg === EmptyValue) {
      return [0, 0];
    } else if (isExtendedNumber(arg)) {
      return [getRawValue(arg), 0];
    } else if (typeof arg === "string") {
      return this.coerceStringToComplex(arg);
    } else {
      return new CellError(ErrorType.NUM, ErrorMessage.ComplexNumberExpected);
    }
  }

  public ExtendedNumberFactory(
    value: number,
    typeFormat: NumberTypeWithFormat
  ): ExtendedNumber {
    const { type, format } = typeFormat;
    switch (type) {
      case NumberType.NUMBER_RAW:
        return value;
      case NumberType.NUMBER_CURRENCY: {
        return new CurrencyNumber(
          value,
          format ?? this.config.currencySymbol[0]
        );
      }
      case NumberType.NUMBER_DATE:
        return new DateNumber(value, format);
      case NumberType.NUMBER_DATETIME:
        return new DateTimeNumber(value, format);
      case NumberType.NUMBER_TIME:
        return new TimeNumber(value, format);
      case NumberType.NUMBER_PERCENT:
        return new PercentNumber(value, format);
      case NumberType.NUMBER_GAUSSIAN:
        return new GaussianNumber(value, 0, this.config);
      case NumberType.NUMBER_SAMPLED:
        // For sampled distributions, create a new one with a single sample
        return new SampledDistribution([value], this.config);
      default:
        throw new Error(`Unsupported number type: ${type}`);
    }
  }

  private buildRegex(pattern: string, matchWholeCell: boolean = true): RegExp {
    pattern = this.normalizeString(pattern);
    let regexpStr;
    let useWildcards = this.config.useWildcards;
    let useRegularExpressions = this.config.useRegularExpressions;
    if (useRegularExpressions) {
      try {
        RegExp(pattern);
      } catch (e) {
        useRegularExpressions = false;
        useWildcards = false;
      }
    }
    if (useRegularExpressions) {
      regexpStr = escapeNoCharacters(pattern, this.config.caseSensitive);
    } else if (useWildcards) {
      regexpStr = escapeNonWildcards(pattern, this.config.caseSensitive);
    } else {
      regexpStr = escapeAllCharacters(pattern, this.config.caseSensitive);
    }
    if (this.config.matchWholeCell && matchWholeCell) {
      return RegExp("^(" + regexpStr + ")$");
    } else {
      return RegExp(regexpStr);
    }
  }

  private normalizeString(str: string): string {
    if (!this.config.caseSensitive) {
      str = str.toLowerCase();
    }
    if (!this.config.accentSensitive) {
      str = normalizeString(str, "nfd").replace(/[\u0300-\u036f]/g, "");
    }
    return str;
  }

  public compare(
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): number {
    if (left instanceof GaussianNumber || right instanceof GaussianNumber) {
      return this.compareGaussians(left, right);
    }

    if (typeof left === "string" || typeof right === "string") {
      const leftTmp =
        typeof left === "string"
          ? this.dateTimeHelper.dateStringToDateNumber(left)
          : left;
      const rightTmp =
        typeof right === "string"
          ? this.dateTimeHelper.dateStringToDateNumber(right)
          : right;
      if (isExtendedNumber(leftTmp) && isExtendedNumber(rightTmp)) {
        return this.floatCmp(leftTmp, rightTmp);
      }
    }

    if (left === EmptyValue) {
      left = coerceEmptyToValue(right);
    } else if (right === EmptyValue) {
      right = coerceEmptyToValue(left);
    }

    if (typeof left === "string" && typeof right === "string") {
      return this.stringCmp(left, right);
    } else if (typeof left === "boolean" && typeof right === "boolean") {
      return numberCmp(
        coerceBooleanToNumber(left),
        coerceBooleanToNumber(right)
      );
    } else if (isExtendedNumber(left) && isExtendedNumber(right)) {
      return this.floatCmp(left, right);
    } else if (left === EmptyValue && right === EmptyValue) {
      return 0;
    } else {
      return numberCmp(
        CellValueTypeOrd(getCellValueType(left)),
        CellValueTypeOrd(getCellValueType(right))
      );
    }
  }

  private compareGaussians(
    left: InternalNoErrorScalarValue,
    right: InternalNoErrorScalarValue
  ): number {
    if (left instanceof GaussianNumber && right instanceof GaussianNumber) {
      return this.floatCmp(left, right);
    }

    // If either value is not a Gaussian number, convert them to numbers first
    const leftNum = typeof left === "number" ? left : 0;
    const rightNum = typeof right === "number" ? right : 0;

    return this.floatCmp(
      new GaussianNumber(leftNum, 0),
      new GaussianNumber(rightNum, 0)
    );
  }

  private stringCmp(left: string, right: string): number {
    return this.collator.compare(left, right);
  }

  private manyToNumbers(
    args: InterpreterValue[],
    rangeFn: (args: InternalScalarValue[]) => number[] | CellError
  ): number[] | CellError {
    const vals: (number | SimpleRangeValue)[] = [];
    for (const arg of args) {
      if (arg instanceof SimpleRangeValue) {
        vals.push(arg);
      } else {
        const coerced = getRawValue(this.coerceScalarToNumberOrError(arg));
        if (coerced instanceof CellError) {
          return coerced;
        } else {
          vals.push(coerced);
        }
      }
    }
    const expandedVals: number[] = [];
    for (const val of vals) {
      if (val instanceof SimpleRangeValue) {
        const arr = rangeFn(val.valuesFromTopLeftCorner());
        if (arr instanceof CellError) {
          return arr;
        } else {
          expandedVals.push(...arr);
        }
      } else {
        expandedVals.push(val);
      }
    }
    return expandedVals;
  }

  private coerceStringToComplex(arg: string): complex | CellError {
    const match = complexParsingRegexp.exec(arg);
    if (match === null) {
      return new CellError(ErrorType.NUM, ErrorMessage.ComplexNumberExpected);
    }

    let val1;
    if (match[6] !== undefined) {
      val1 = (match[1] === "-" ? [0, -1] : [0, 1]) as complex;
    } else {
      val1 = this.parseComplexToken(match[1] + match[3], match[5]);
    }

    if (val1 instanceof CellError) {
      return val1;
    }

    if (match[8] === undefined) {
      return val1;
    }

    let val2;
    if (match[14] !== undefined) {
      val2 = (match[9] === "-" ? [0, -1] : [0, 1]) as complex;
    } else {
      val2 = this.parseComplexToken(match[9] + match[11], match[13]);
    }
    if (val2 instanceof CellError) {
      return val2;
    }
    if (match[5] !== "" || match[13] === "") {
      return new CellError(ErrorType.NUM, ErrorMessage.ComplexNumberExpected);
    }

    if (match[8] === "+") {
      return [val1[0] + val2[0], val1[1] + val2[1]];
    } else {
      return [val1[0] - val2[0], val1[1] - val2[1]];
    }
  }

  private parseComplexToken(arg: string, mod: string): complex | CellError {
    const val = getRawValue(this.coerceNonDateScalarToMaybeNumber(arg));
    if (val === undefined) {
      return new CellError(ErrorType.NUM, ErrorMessage.ComplexNumberExpected);
    }
    if (mod === "") {
      return [val, 0];
    } else {
      return [0, val];
    }
  }
}

export function coerceComplexToString(
  [re, im]: complex,
  symb?: string
): string | CellError {
  if (!isFinite(re) || !isFinite(im)) {
    return new CellError(ErrorType.NUM, ErrorMessage.NaN);
  }
  symb = symb ?? COMPLEX_NUMBER_SYMBOL;
  if (im === 0) {
    return `${re}`;
  }
  const imStr = `${im === -1 || im === 1 ? "" : Math.abs(im)}${symb}`;
  if (re === 0) {
    return `${im < 0 ? "-" : ""}${imStr}`;
  }
  return `${re}${im < 0 ? "-" : "+"}${imStr}`;
}

export function coerceToRange(arg: InterpreterValue): SimpleRangeValue {
  if (arg instanceof SimpleRangeValue) {
    return arg;
  } else {
    return SimpleRangeValue.fromScalar(arg);
  }
}

export function coerceToRangeNumbersOrError(
  arg: InterpreterValue
): SimpleRangeValue | CellError | null {
  if (
    (arg instanceof SimpleRangeValue && arg.hasOnlyNumbers()) ||
    arg instanceof CellError
  ) {
    return arg;
  } else if (isExtendedNumber(arg)) {
    return SimpleRangeValue.fromScalar(arg);
  } else {
    return null;
  }
}

export function coerceBooleanToNumber(arg: boolean): number {
  return Number(arg);
}

export function coerceEmptyToValue(
  arg: InternalNoErrorScalarValue
): RawNoErrorScalarValue {
  if (typeof arg === "string") {
    return "";
  } else if (isExtendedNumber(arg)) {
    return 0;
  } else if (typeof arg === "boolean") {
    return false;
  } else {
    return EmptyValue;
  }
}

/**
 * Coerce scalar value to boolean if possible, or error if value is an error
 *
 * @param arg
 */
export function coerceScalarToBoolean(
  arg: InternalScalarValue
): boolean | CellError | undefined {
  if (arg instanceof CellError || typeof arg === "boolean") {
    return arg;
  } else if (arg === EmptyValue) {
    return false;
  } else if (isExtendedNumber(arg)) {
    return getRawValue(arg) !== 0;
  } else {
    const argUppered = arg.toUpperCase();
    if (argUppered === "TRUE") {
      return true;
    } else if (argUppered === "FALSE") {
      return false;
    } else if (argUppered === "") {
      return false;
    } else {
      return undefined;
    }
  }
}

export function coerceScalarToString(
  arg: InternalScalarValue
): string | CellError {
  if (arg instanceof CellError || typeof arg === "string") {
    return arg;
  } else if (arg === EmptyValue) {
    return "";
  } else if (isExtendedNumber(arg)) {
    return getRawValue(arg).toString();
  } else {
    return arg ? "TRUE" : "FALSE";
  }
}

export function zeroIfEmpty(arg: RawNoErrorScalarValue): RawNoErrorScalarValue {
  return arg === EmptyValue ? 0 : arg;
}

export function numberCmp(
  leftArg: ExtendedNumber,
  rightArg: ExtendedNumber
): number {
  const left = getRawValue(leftArg);
  const right = getRawValue(rightArg);
  if (left > right) {
    return 1;
  } else if (left < right) {
    return -1;
  } else {
    return 0;
  }
}

export function isNumberOverflow(arg: number): boolean {
  return isNaN(arg) || arg === Infinity || arg === -Infinity;
}

export function fixNegativeZero(arg: number): number {
  if (arg === 0) {
    return 0;
  } else {
    return arg;
  }
}

function isWildcard(c: string): boolean {
  return ["*", "?"].includes(c);
}

const escapedCharacters = [
  "{",
  "}",
  "[",
  "]",
  "(",
  ")",
  "<",
  ">",
  "=",
  ".",
  "+",
  "-",
  ",",
  "\\",
  "$",
  "^",
  "!",
];

function needsEscape(c: string): boolean {
  return escapedCharacters.includes(c);
}

function escapeNonWildcards(pattern: string, caseSensitive: boolean): string {
  let str = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === "~") {
      if (i == pattern.length - 1) {
        str += "~";
        continue;
      }
      const d = pattern.charAt(i + 1);
      if (isWildcard(d) || needsEscape(d)) {
        str += "\\" + d;
        i++;
      } else {
        str += d;
        i++;
      }
    } else if (isWildcard(c)) {
      str += "." + c;
    } else if (needsEscape(c)) {
      str += "\\" + c;
    } else if (caseSensitive) {
      str += c;
    } else {
      str += c.toLowerCase();
    }
  }
  return str;
}

function escapeAllCharacters(pattern: string, caseSensitive: boolean): string {
  let str = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (isWildcard(c) || needsEscape(c)) {
      str += "\\" + c;
    } else if (caseSensitive) {
      str += c;
    } else {
      str += c.toLowerCase();
    }
  }
  return str;
}

function escapeNoCharacters(pattern: string, caseSensitive: boolean): string {
  let str = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (isWildcard(c) || needsEscape(c)) {
      str += c;
    } else if (caseSensitive) {
      str += c;
    } else {
      str += c.toLowerCase();
    }
  }
  return str;
}

function inferExtendedNumberTypeAdditive(
  leftArg: ExtendedNumber,
  rightArg: ExtendedNumber
): NumberTypeWithFormat {
  const { type: leftType, format: leftFormat } =
    getTypeFormatOfExtendedNumber(leftArg);
  const { type: rightType, format: rightFormat } =
    getTypeFormatOfExtendedNumber(rightArg);

  // If either operand is a Gaussian number, the result should be a Gaussian number
  if (
    leftType === NumberType.NUMBER_GAUSSIAN ||
    rightType === NumberType.NUMBER_GAUSSIAN
  ) {
    return { type: NumberType.NUMBER_GAUSSIAN };
  }

  if (leftType === NumberType.NUMBER_RAW) {
    return { type: rightType, format: rightFormat };
  }
  if (rightType === NumberType.NUMBER_RAW) {
    return { type: leftType, format: leftFormat };
  }
  if (
    (leftType === NumberType.NUMBER_DATETIME ||
      leftType === NumberType.NUMBER_DATE) &&
    (rightType === NumberType.NUMBER_DATETIME ||
      rightType === NumberType.NUMBER_DATE)
  ) {
    return { type: NumberType.NUMBER_RAW };
  }
  if (leftType === NumberType.NUMBER_TIME) {
    if (rightType === NumberType.NUMBER_DATE) {
      return {
        type: NumberType.NUMBER_DATETIME,
        format: `${rightFormat} ${leftFormat}`,
      };
    }
    if (rightType === NumberType.NUMBER_DATETIME) {
      return { type: NumberType.NUMBER_DATETIME, format: rightFormat };
    }
  }
  if (rightType === NumberType.NUMBER_TIME) {
    if (leftType === NumberType.NUMBER_DATE) {
      return {
        type: NumberType.NUMBER_DATETIME,
        format: `${leftFormat} ${rightFormat}`,
      };
    }
    if (leftType === NumberType.NUMBER_DATETIME) {
      return { type: NumberType.NUMBER_DATETIME, format: leftFormat };
    }
  }
  return { type: leftType, format: leftFormat };
}

function inferExtendedNumberTypeMultiplicative(
  leftArg: ExtendedNumber,
  rightArg: ExtendedNumber
): NumberTypeWithFormat {
  let { type: leftType, format: leftFormat } =
    getTypeFormatOfExtendedNumber(leftArg);
  let { type: rightType, format: rightFormat } =
    getTypeFormatOfExtendedNumber(rightArg);

  // If either operand is a Gaussian number or SampledDistribution, the result should be a SampledDistribution
  if (
    leftType === NumberType.NUMBER_GAUSSIAN ||
    rightType === NumberType.NUMBER_GAUSSIAN ||
    leftType === NumberType.NUMBER_SAMPLED ||
    rightType === NumberType.NUMBER_SAMPLED
  ) {
    return { type: NumberType.NUMBER_SAMPLED };
  }

  if (leftType === NumberType.NUMBER_PERCENT) {
    leftType = NumberType.NUMBER_RAW;
    leftFormat = undefined;
  }
  if (rightType === NumberType.NUMBER_PERCENT) {
    rightType = NumberType.NUMBER_RAW;
    rightFormat = undefined;
  }
  if (leftType === NumberType.NUMBER_RAW) {
    return { type: rightType, format: rightFormat };
  }
  if (rightType === NumberType.NUMBER_RAW) {
    return { type: leftType, format: leftFormat };
  }
  return { type: NumberType.NUMBER_RAW };
}

export function forceNormalizeString(str: string): string {
  return normalizeString(str.toLowerCase(), "nfd").replace(
    /[\u0300-\u036f]/g,
    ""
  );
}

export function coerceRangeToScalar(
  arg: SimpleRangeValue,
  state: InterpreterState
): Maybe<InternalScalarValue> {
  if (arg.isAdHoc()) {
    return arg.data[0]?.[0];
  }
  const range = arg.range!;
  if (state.formulaAddress.sheet === range.sheet) {
    if (range.width() === 1) {
      const offset = state.formulaAddress.row - range.start.row;
      if (offset >= 0 && offset < range.height()) {
        return arg.data[offset][0];
      }
    } else if (range.height() === 1) {
      const offset = state.formulaAddress.col - range.start.col;
      if (offset >= 0 && offset < range.width()) {
        return arg.data[0][offset];
      }
    }
  }
  return undefined;
}

type NormalizationForm = "nfc" | "nfd" | "nfkc" | "nfkd";

export function normalizeString(str: string, form: NormalizationForm): string {
  return str.normalize(form.toUpperCase());
}
