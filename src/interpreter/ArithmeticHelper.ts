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
  LogNormalNumber,
  UniformNumber,
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
    if (
      left instanceof GaussianNumber || 
      right instanceof GaussianNumber ||
      left instanceof ConfidenceIntervalNumber ||
      right instanceof ConfidenceIntervalNumber ||
      left instanceof LogNormalNumber ||
      right instanceof LogNormalNumber ||
      left instanceof UniformNumber ||
      right instanceof UniformNumber
    ) {
      return this.powDistributions(left, right);
    }
    return Math.pow(getRawValue(left), getRawValue(right));
  };

  private powDistributions(
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

    // Handle log-normal distributions
    if (left instanceof LogNormalNumber) {
      if (this.preservesLogNormal('pow', left, right)) {
        // Power of log-normal preserves family: X^k where k is scalar
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => Math.pow(a, b));
        const { mu, sigma2 } = this.fitLogNormal(resultSamples);
        return new LogNormalNumber(mu, sigma2, this.config);
      } else {
        // Fall back to sampled distribution
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => Math.pow(a, b));
        return new SampledDistribution(resultSamples, this.config);
      }
    }

    // Handle uniform distributions - power doesn't preserve uniformity
    if (left instanceof UniformNumber || right instanceof UniformNumber) {
      const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => Math.pow(a, b));
      return new SampledDistribution(resultSamples, this.config);
    }
    
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
      left instanceof LogNormalNumber ||
      right instanceof LogNormalNumber ||
      left instanceof UniformNumber ||
      right instanceof UniformNumber ||
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

  /**
   * ========================================================================
   * Distribution Arithmetic Helper Functions for Sampling-Driven Operations
   * ========================================================================
   */

  /**
   * Performs element-wise binary operations on sample arrays, handling scalar broadcasting.
   * Returns the resulting sample array for Monte-Carlo propagation.
   */
  private elementwiseBinaryOp(
    left: ExtendedNumber,
    right: ExtendedNumber,
    op: (a: number, b: number) => number | null
  ): number[] {
    const leftSamples = this.getSamplesFromValue(left);
    const rightSamples = this.getSamplesFromValue(right);
    
    // Ensure both arrays have the same length
    const maxLength = Math.max(leftSamples.length, rightSamples.length);
    const resultSamples: number[] = [];
    
    for (let i = 0; i < maxLength; i++) {
      const leftVal = leftSamples[i % leftSamples.length];
      const rightVal = rightSamples[i % rightSamples.length];
      const result = op(leftVal, rightVal);
      if (result !== null) {
        resultSamples.push(result);
      }
    }
    
    return resultSamples;
  }

  /**
   * Fits log-normal distribution parameters from result samples.
   * Returns { mu, sigma2 } where mu = mean(log samples), sigma2 = var(log samples)
   */
  private fitLogNormal(resultSamples: number[]): { mu: number; sigma2: number } {
    // Filter out non-positive values as they can't be log-transformed
    const positiveSamples = resultSamples.filter(x => x > 0);
    
    if (positiveSamples.length === 0) {
      // Fallback for edge cases
      return { mu: 0, sigma2: 1 };
    }
    
    const logSamples = positiveSamples.map(x => Math.log(x));
    const mu = logSamples.reduce((a, b) => a + b, 0) / logSamples.length;
    const sigma2 = logSamples.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / logSamples.length;
    
    return { mu, sigma2 };
  }

  /**
   * Fits uniform distribution parameters from result samples.
   * Returns { a, b } where a = min(samples), b = max(samples)
   */
  private fitUniform(resultSamples: number[]): { a: number; b: number } {
    if (resultSamples.length === 0) {
      return { a: 0, b: 1 };
    }
    
    const a = Math.min(...resultSamples);
    const b = Math.max(...resultSamples);
    
    // Ensure b > a for valid uniform distribution
    if (b <= a) {
      return { a: a - 0.5, b: a + 0.5 };
    }
    
    return { a, b };
  }

  /**
   * Helper to extract samples from any extended number type
   */
  private getSamplesFromValue(value: ExtendedNumber): number[] {
    if (value instanceof GaussianNumber || 
        value instanceof SampledDistribution ||
        value instanceof LogNormalNumber ||
        value instanceof UniformNumber) {
      return value.getSamples();
    } else {
      // For scalar values, create an array with the same sample size
      const sampleSize = this.config.sampleSize || 10000;
      const scalarValue = getRawValue(value);
      return Array(sampleSize).fill(scalarValue);
    }
  }

  /**
   * Determines if an operation preserves the log-normal family
   */
  private preservesLogNormal(op: string, left: ExtendedNumber, right: ExtendedNumber): boolean {
    // Based on DISTRIBUTION_ARITHMETIC_LOGIC.json
    if (op === '*' || op === '/') {
      // Both operands should be log-normal, or one should be a positive scalar
      if (left instanceof LogNormalNumber && right instanceof LogNormalNumber) {
        return true;
      }
      if (left instanceof LogNormalNumber && typeof right === 'number' && right > 0) {
        return true;
      }
      if (right instanceof LogNormalNumber && typeof left === 'number' && left > 0) {
        return true;
      }
    }
    if (op === 'pow') {
      // X^k where X is log-normal and k is scalar
      return left instanceof LogNormalNumber && typeof right === 'number';
    }
    if (op === 'scale') {
      // c * X where c is positive scalar and X is log-normal
      return (left instanceof LogNormalNumber && typeof right === 'number' && right > 0) ||
             (right instanceof LogNormalNumber && typeof left === 'number' && left > 0);
    }
    return false;
  }

  /**
   * Determines if an operation preserves the uniform family
   */
  private preservesUniform(op: string, left: ExtendedNumber, right: ExtendedNumber): boolean {
    // Based on DISTRIBUTION_ARITHMETIC_LOGIC.json - only affine transforms preserve uniformity
    if (op === '+' || op === '-') {
      // U + c or c + U (scalar addition)
      return (left instanceof UniformNumber && typeof right === 'number') ||
             (right instanceof UniformNumber && typeof left === 'number');
    }
    if (op === '*' || op === '/') {
      // c * U or U * c (scalar multiplication)
      return (left instanceof UniformNumber && typeof right === 'number') ||
             (right instanceof UniformNumber && typeof left === 'number');
    }
    return false;
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

    // Handle log-normal distributions
    if (left instanceof LogNormalNumber || right instanceof LogNormalNumber) {
      // Addition doesn't preserve log-normal family - use sampling
      const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => a + b);
      return new SampledDistribution(resultSamples, this.config);
    }

    // Handle uniform distributions
    if (left instanceof UniformNumber || right instanceof UniformNumber) {
      if (this.preservesUniform('+', left, right)) {
        // Affine transform c + U or U + c
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => a + b);
        const { a, b } = this.fitUniform(resultSamples);
        return new UniformNumber(a, b, this.config);
      } else {
        // Fall back to sampled distribution
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => a + b);
        return new SampledDistribution(resultSamples, this.config);
      }
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
    if (arg instanceof ConfidenceIntervalNumber) {
      return new GaussianNumber(-arg.val, 0, this.config);
    }
    return cloneNumber(arg, -getRawValue(arg));
  };

  public unaryPlus = (arg: InternalScalarValue): InternalScalarValue => arg;

  public unaryPercent = (arg: ExtendedNumber): ExtendedNumber => {
    if (arg instanceof GaussianNumber) {
      return new GaussianNumber(arg.mean / 100, arg.variance / 10000);
    }
    if (arg instanceof ConfidenceIntervalNumber) {
      return new GaussianNumber(arg.val / 100, 0, this.config);
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
      rightArg instanceof SampledDistribution ||
      leftArg instanceof LogNormalNumber ||
      rightArg instanceof LogNormalNumber ||
      leftArg instanceof UniformNumber ||
      rightArg instanceof UniformNumber ||
      leftArg instanceof ConfidenceIntervalNumber ||
      rightArg instanceof ConfidenceIntervalNumber
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
    // Convert ConfidenceIntervalNumber to GaussianNumber for arithmetic
    if (left instanceof ConfidenceIntervalNumber) {
      left = left.toGaussian();
    }
    if (right instanceof ConfidenceIntervalNumber) {
      right = right.toGaussian();
    }

    // Handle log-normal distributions
    if (left instanceof LogNormalNumber || right instanceof LogNormalNumber) {
      // Subtraction doesn't preserve log-normal family - use sampling
      const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => a - b);
      return new SampledDistribution(resultSamples, this.config);
    }

    // Handle uniform distributions
    if (left instanceof UniformNumber || right instanceof UniformNumber) {
      if (this.preservesUniform('-', left, right)) {
        // Affine transform U - c or c - U
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => a - b);
        const { a, b } = this.fitUniform(resultSamples);
        return new UniformNumber(a, b, this.config);
      } else {
        // Fall back to sampled distribution
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => a - b);
        return new SampledDistribution(resultSamples, this.config);
      }
    }

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
      right instanceof SampledDistribution ||
      left instanceof LogNormalNumber ||
      right instanceof LogNormalNumber ||
      left instanceof UniformNumber ||
      right instanceof UniformNumber ||
      left instanceof ConfidenceIntervalNumber ||
      right instanceof ConfidenceIntervalNumber
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
    // Convert ConfidenceIntervalNumber to GaussianNumber for arithmetic
    if (left instanceof ConfidenceIntervalNumber) {
      left = left.toGaussian();
    }
    if (right instanceof ConfidenceIntervalNumber) {
      right = right.toGaussian();
    }

    // Handle log-normal distributions
    if (left instanceof LogNormalNumber || right instanceof LogNormalNumber) {
      if (this.preservesLogNormal('*', left, right)) {
        // Multiplication preserves log-normal family
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => 
          this.safeMultiplication(a, b));
        const { mu, sigma2 } = this.fitLogNormal(resultSamples);
        return new LogNormalNumber(mu, sigma2, this.config);
      } else {
        // Fall back to sampled distribution
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => 
          this.safeMultiplication(a, b));
        return new SampledDistribution(resultSamples, this.config);
      }
    }

    // Handle uniform distributions
    if (left instanceof UniformNumber || right instanceof UniformNumber) {
      if (this.preservesUniform('*', left, right)) {
        // Scalar multiplication - affine transform
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => 
          this.safeMultiplication(a, b));
        const { a, b } = this.fitUniform(resultSamples);
        return new UniformNumber(a, b, this.config);
      } else {
        // Fall back to sampled distribution
        const resultSamples = this.elementwiseBinaryOp(left, right, (a, b) => 
          this.safeMultiplication(a, b));
        return new SampledDistribution(resultSamples, this.config);
      }
    }

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
      right instanceof SampledDistribution ||
      left instanceof LogNormalNumber ||
      right instanceof LogNormalNumber ||
      left instanceof UniformNumber ||
      right instanceof UniformNumber ||
      left instanceof ConfidenceIntervalNumber ||
      right instanceof ConfidenceIntervalNumber
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
    // Convert ConfidenceIntervalNumber to GaussianNumber for arithmetic
    if (left instanceof ConfidenceIntervalNumber) {
      left = left.toGaussian();
    }
    if (right instanceof ConfidenceIntervalNumber) {
      right = right.toGaussian();
    }

    // Handle log-normal distributions
    if (left instanceof LogNormalNumber || right instanceof LogNormalNumber) {
      if (this.preservesLogNormal('/', left, right)) {
        // Division preserves log-normal family
        const resultSamples: number[] = [];
        const leftSamples = this.getSamplesFromValue(left);
        const rightSamples = this.getSamplesFromValue(right);
        
        for (let i = 0; i < leftSamples.length; i++) {
          const result = this.safeDivision(leftSamples[i], rightSamples[i % rightSamples.length]);
          if (result === null) {
            return new CellError(ErrorType.DIV_BY_ZERO);
          }
          resultSamples.push(result);
        }
        
        const { mu, sigma2 } = this.fitLogNormal(resultSamples);
        return new LogNormalNumber(mu, sigma2, this.config);
      } else {
        // Fall back to sampled distribution
        const resultSamples: number[] = [];
        const leftSamples = this.getSamplesFromValue(left);
        const rightSamples = this.getSamplesFromValue(right);
        
        for (let i = 0; i < leftSamples.length; i++) {
          const result = this.safeDivision(leftSamples[i], rightSamples[i % rightSamples.length]);
          if (result === null) {
            return new CellError(ErrorType.DIV_BY_ZERO);
          }
          resultSamples.push(result);
        }
        
        return new SampledDistribution(resultSamples, this.config);
      }
    }

    // Handle uniform distributions
    if (left instanceof UniformNumber || right instanceof UniformNumber) {
      if (this.preservesUniform('/', left, right)) {
        // Scalar division - affine transform
        const resultSamples: number[] = [];
        const leftSamples = this.getSamplesFromValue(left);
        const rightSamples = this.getSamplesFromValue(right);
        
        for (let i = 0; i < leftSamples.length; i++) {
          const result = this.safeDivision(leftSamples[i], rightSamples[i % rightSamples.length]);
          if (result === null) {
            return new CellError(ErrorType.DIV_BY_ZERO);
          }
          resultSamples.push(result);
        }
        
        const { a, b } = this.fitUniform(resultSamples);
        return new UniformNumber(a, b, this.config);
      } else {
        // Fall back to sampled distribution
        const resultSamples: number[] = [];
        const leftSamples = this.getSamplesFromValue(left);
        const rightSamples = this.getSamplesFromValue(right);
        
        for (let i = 0; i < leftSamples.length; i++) {
          const result = this.safeDivision(leftSamples[i], rightSamples[i % rightSamples.length]);
          if (result === null) {
            return new CellError(ErrorType.DIV_BY_ZERO);
          }
          resultSamples.push(result);
        }
        
        return new SampledDistribution(resultSamples, this.config);
      }
    }

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
      left instanceof SampledDistribution ||
      left instanceof LogNormalNumber ||
      left instanceof UniformNumber
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
      const rightDist = right as any;
      const rightSamples: number[] = rightDist.getSamples ? rightDist.getSamples() : (right instanceof GaussianNumber ? right.getSamples() : []);

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
      case NumberType.NUMBER_CONFIDENCE_INTERVAL:
        // For confidence intervals, convert to Gaussian for arithmetic operations
        // This maintains the uncertainty representation while allowing arithmetic
        return new GaussianNumber(value, 0, this.config);
   
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
    if (
      left instanceof GaussianNumber || 
      right instanceof GaussianNumber ||
      left instanceof ConfidenceIntervalNumber ||
      right instanceof ConfidenceIntervalNumber
    ) {
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
    // Convert ConfidenceIntervalNumber to GaussianNumber for comparison
    if (left instanceof ConfidenceIntervalNumber) {
      left = left.toGaussian();
    }
    if (right instanceof ConfidenceIntervalNumber) {
      right = right.toGaussian();
    }

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

  // If either operand is a Gaussian number or ConfidenceInterval, the result should be a Gaussian number
  if (
    leftType === NumberType.NUMBER_GAUSSIAN ||
    rightType === NumberType.NUMBER_GAUSSIAN ||
    leftType === NumberType.NUMBER_CONFIDENCE_INTERVAL ||
    rightType === NumberType.NUMBER_CONFIDENCE_INTERVAL
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

  // If either operand is a Gaussian number, SampledDistribution, or ConfidenceInterval, the result should be a SampledDistribution
  if (
    leftType === NumberType.NUMBER_GAUSSIAN ||
    rightType === NumberType.NUMBER_GAUSSIAN ||
    leftType === NumberType.NUMBER_SAMPLED ||
    rightType === NumberType.NUMBER_SAMPLED ||
    leftType === NumberType.NUMBER_CONFIDENCE_INTERVAL ||
    rightType === NumberType.NUMBER_CONFIDENCE_INTERVAL
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
