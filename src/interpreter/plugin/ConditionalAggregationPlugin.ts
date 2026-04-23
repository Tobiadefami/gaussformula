/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {CellError, ErrorType} from '../../Cell'
import {Config} from '../../Config'
import {ErrorMessage} from '../../error-message'
import {Maybe} from '../../Maybe'
import {ProcedureAst} from '../../parser/Ast'
import {Condition, CriterionFunctionCompute} from '../CriterionFunctionCompute'
import {CriterionPackage} from '../Criterion'
import {InterpreterState} from '../InterpreterState'
import {
  DistributionNumber,
  getRawValue,
  InternalScalarValue,
  InterpreterValue,
  isExtendedNumber,
  RawInterpreterValue,
  RawScalarValue,
  SampledDistribution,
} from '../InterpreterValue'
import {SimpleRangeValue} from '../../SimpleRangeValue'
import {FunctionArgumentType, FunctionPlugin, FunctionPluginTypecheck, ImplementedFunctions} from './FunctionPlugin'
import {isUncertainValue, samplesForValue} from '../UncertaintyValue'

class AverageResult {
  public static empty = new AverageResult(0, 0)

  constructor(
    public readonly sum: number,
    public readonly count: number,
  ) {}

  public static single(arg: number): AverageResult {
    return new AverageResult(arg, 1)
  }

  public compose(other: AverageResult) {
    return new AverageResult(this.sum + other.sum, this.count + other.count)
  }

  public averageValue(): Maybe<number> {
    if (this.count > 0) {
      return this.sum / this.count
    } else {
      return undefined
    }
  }
}

/** Computes key for criterion function cache */
function conditionalAggregationFunctionCacheKey(functionName: string): (conditions: Condition[]) => string {
  return (conditions: Condition[]): string => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const conditionsStrings = conditions.map((c) => `${c.conditionRange.range!.sheet},${c.conditionRange.range!.start.col},${c.conditionRange.range!.start.row}`)
    return [functionName, ...conditionsStrings].join(',')
  }
}

function zeroForInfinite(value: InternalScalarValue) {
  if (isExtendedNumber(value) && !Number.isFinite(getRawValue(value))) {
    return 0
  } else {
    return value
  }
}

function mapToRawScalarValue(arg: InternalScalarValue): Maybe<CellError | RawScalarValue> {
  if (arg instanceof CellError) {
    return arg
  }

  if (isExtendedNumber(arg)) {
    return getRawValue(arg)
  }

  return undefined
}

export class ConditionalAggregationPlugin extends FunctionPlugin implements FunctionPluginTypecheck<ConditionalAggregationPlugin> {
  public static implementedFunctions: ImplementedFunctions = {
    SUMIF: {
      method: 'sumif',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.RANGE, optionalArg: true},
      ],
    },
    COUNTIF: {
      method: 'countif',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ],
    },
    AVERAGEIF: {
      method: 'averageif',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
        {argumentType: FunctionArgumentType.RANGE, optionalArg: true},
      ],
    },
    SUMIFS: {
      method: 'sumifs',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ],
      repeatLastArgs: 2,
    },
    COUNTIFS: {
      method: 'countifs',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ],
      repeatLastArgs: 2,
    },
    MINIFS: {
      method: 'minifs',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ],
      repeatLastArgs: 2,
    },
    MAXIFS: {
      method: 'maxifs',
      parameters: [
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.RANGE},
        {argumentType: FunctionArgumentType.NOERROR, passSubtype: true},
      ],
      repeatLastArgs: 2,
    },
  }

  /**
   * Corresponds to SUMIF(Range, Criterion, SumRange)
   *
   * Range is the range to which criterion is to be applied.
   * Criterion is the criteria used to choose which cells will be included in sum.
   * SumRange is the range on which adding will be performed.
   * @param ast
   * @param state
   */
  public sumif(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const functionName = 'SUMIF'

    const computeFn = (
      conditionRange: SimpleRangeValue,
      criterion: InternalScalarValue,
      values: Maybe<SimpleRangeValue>
    ) => {
      const valuesRange = values ?? conditionRange
      const sampledResult = this.computeSampleAwareConditionalAggregationFunction<RawScalarValue>(
        valuesRange,
        [conditionRange, criterion] as [SimpleRangeValue, InternalScalarValue],
        0,
        (left, right) => this.arithmeticHelper.nonstrictadd(left, right) as RawScalarValue,
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
        (result) => result instanceof CellError ? result : typeof result === 'number' ? result : 0,
      )

      return sampledResult ?? this.computeConditionalAggregationFunction<RawScalarValue>(
        valuesRange,
        [conditionRange, normalizeCriterionForScalarPath(criterion)],
        functionName,
        0,
        (left, right) => this.arithmeticHelper.nonstrictadd(left, right),
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
      )
    }

    return this.runFunction(ast.args, state, this.metadata(functionName), computeFn)
  }

  public sumifs(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const functionName = 'SUMIFS'

    const computeFn = (values: SimpleRangeValue, ...args: unknown[]) => {
      const sampledResult = this.computeSampleAwareConditionalAggregationFunction<RawScalarValue>(
        values,
        args as (SimpleRangeValue | InternalScalarValue)[],
        0,
        (left, right) => this.arithmeticHelper.nonstrictadd(left, right) as RawScalarValue,
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
        (result) => result instanceof CellError ? result : typeof result === 'number' ? result : 0,
      )

      return sampledResult ?? this.computeConditionalAggregationFunction<RawScalarValue>(
        values,
        args as RawInterpreterValue[],
        functionName,
        0,
        (left, right) => this.arithmeticHelper.nonstrictadd(left, right),
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
      )
    }

    return this.runFunction(ast.args, state, this.metadata(functionName), computeFn)
  }

  public averageif(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const functionName = 'AVERAGEIF'

    const computeFn = (
      conditionRange: SimpleRangeValue,
      criterion: InternalScalarValue,
      values: Maybe<SimpleRangeValue>
    ) => {
      const valuesRange = values ?? conditionRange
      const sampledResult = this.computeSampleAwareConditionalAggregationFunction<AverageResult>(
        valuesRange,
        [conditionRange, criterion] as [SimpleRangeValue, InternalScalarValue],
        AverageResult.empty,
        (left, right) => left.compose(right),
        (arg) => isExtendedNumber(arg) ? AverageResult.single(getRawValue(arg)) : AverageResult.empty,
        (result) => result.averageValue() ?? new CellError(ErrorType.DIV_BY_ZERO),
      )
      if (sampledResult !== undefined) {
        return sampledResult
      }

      const averageResult = this.computeConditionalAggregationFunction<AverageResult>(
        valuesRange,
        [conditionRange, normalizeCriterionForScalarPath(criterion)],
        functionName,
        AverageResult.empty,
        (left, right) => left.compose(right),
        (arg) => isExtendedNumber(arg) ? AverageResult.single(getRawValue(arg)) : AverageResult.empty,
        )

      if (averageResult instanceof CellError) {
        return averageResult
      } else {
        return averageResult.averageValue() || new CellError(ErrorType.DIV_BY_ZERO)
      }
    }

    return this.runFunction(ast.args, state, this.metadata(functionName), computeFn)
  }

  /**
   * Corresponds to COUNTIF(Range, Criterion)
   *
   * Range is the range to which criterion is to be applied.
   * Criterion is the criteria used to choose which cells will be included in sum.
   *
   * Returns number of cells on which criteria evaluate to true.
   * @param ast
   * @param state
   */
  public countif(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const functionName = 'COUNTIF'

    const computeFn = (conditionRange: SimpleRangeValue, criterion: InternalScalarValue) => {
      const sampledResult = this.computeSampleAwareConditionalAggregationFunction<number>(
        conditionRange,
        [conditionRange, criterion] as [SimpleRangeValue, InternalScalarValue],
        0,
        (left, right) => left + right,
        () => 1,
        (result) => result,
      )

      return sampledResult ?? this.computeConditionalAggregationFunction<number>(
        conditionRange,
        [conditionRange, normalizeCriterionForScalarPath(criterion)],
        functionName,
        0,
        (left, right) => left + right,
        () => 1,
      )
    }

    return this.runFunction(ast.args, state, this.metadata(functionName), computeFn)
  }

  public countifs(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const functionName = 'COUNTIFS'

    const computeFn = (...args: unknown[]) => {
      const sampledResult = this.computeSampleAwareConditionalAggregationFunction<number>(
        args[0] as SimpleRangeValue,
        args as (SimpleRangeValue | InternalScalarValue)[],
        0,
        (left, right) => left + right,
        () => 1,
        (result) => result,
      )

      return sampledResult ?? this.computeConditionalAggregationFunction<number>(
        args[0] as SimpleRangeValue,
        args as RawInterpreterValue[],
        functionName,
        0,
        (left, right) => left + right,
        () => 1,
      )
    }

    return this.runFunction(ast.args, state, this.metadata(functionName), computeFn)
  }

  public minifs(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const functionName = 'MINIFS'

    const composeFunction = (left: RawScalarValue, right: RawScalarValue): RawScalarValue => {
      if (right === undefined || left === undefined) {
        return right === undefined ? left : right
      }

      return Math.min(left as number, right as number)
    }

    const computeFn = (values: SimpleRangeValue, ...args: unknown[]) => {
      const sampledResult = this.computeSampleAwareConditionalAggregationFunction<RawScalarValue>(
        values,
        args as (SimpleRangeValue | InternalScalarValue)[],
        Number.POSITIVE_INFINITY,
        composeFunction,
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
        (result) => {
          const normalized = zeroForInfinite(result)
          return normalized instanceof CellError ? normalized : typeof normalized === 'number' ? normalized : 0
        },
      )
      if (sampledResult !== undefined) {
        return sampledResult
      }

      const minResult = this.computeConditionalAggregationFunction<RawScalarValue>(
        values,
        args as RawInterpreterValue[],
        functionName,
        Number.POSITIVE_INFINITY,
        composeFunction,
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
      )

      return zeroForInfinite(minResult)
    }

    return this.runFunction(ast.args, state, this.metadata(functionName), computeFn)
  }

  public maxifs(ast: ProcedureAst, state: InterpreterState): InterpreterValue {
    const functionName = 'MAXIFS'

    const composeFunction = (left: RawScalarValue, right: RawScalarValue): RawScalarValue => {
      if (right === undefined || left === undefined) {
        return right === undefined ? left : right
      }

      return Math.max(left as number, right as number)
    }

    const computeFn = (values: SimpleRangeValue, ...args: unknown[]) => {
      const sampledResult = this.computeSampleAwareConditionalAggregationFunction<RawScalarValue>(
        values,
        args as (SimpleRangeValue | InternalScalarValue)[],
        Number.NEGATIVE_INFINITY,
        composeFunction,
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
        (result) => {
          const normalized = zeroForInfinite(result)
          return normalized instanceof CellError ? normalized : typeof normalized === 'number' ? normalized : 0
        },
      )
      if (sampledResult !== undefined) {
        return sampledResult
      }

      const maxResult = this.computeConditionalAggregationFunction<RawScalarValue>(
        values,
        args as RawInterpreterValue[],
        functionName,
        Number.NEGATIVE_INFINITY,
        composeFunction,
        mapToRawScalarValue as (arg: InternalScalarValue) => RawScalarValue,
      )

      return zeroForInfinite(maxResult)
    }

    return this.runFunction(ast.args, state, this.metadata(functionName), computeFn)
  }

  private computeConditionalAggregationFunction<T>(
    valuesRange: SimpleRangeValue,
    conditionArgs: RawInterpreterValue[],
    functionName: string,
    reduceInitialValue: T,
    composeFunction: (left: T, right: T) => T,
    mapFunction: (arg: InternalScalarValue) => T
  ): T | CellError {
    const conditions: Condition[] = []
    for (let i = 0; i < conditionArgs.length; i += 2) {
      const conditionArg = conditionArgs[i] as SimpleRangeValue
      const criterionPackage = this.interpreter.criterionBuilder.fromCellValue(conditionArgs[i + 1] as RawScalarValue, this.arithmeticHelper)
      if (criterionPackage === undefined) {
        return new CellError(ErrorType.VALUE, ErrorMessage.BadCriterion)
      }
      conditions.push(new Condition(conditionArg, criterionPackage))
    }

    return new CriterionFunctionCompute<T>(
      this.interpreter,
      conditionalAggregationFunctionCacheKey(functionName),
      reduceInitialValue,
      composeFunction,
      mapFunction,
    ).compute(valuesRange, conditions)
  }

  private computeSampleAwareConditionalAggregationFunction<T>(
    valuesRange: SimpleRangeValue,
    conditionArgs: (SimpleRangeValue | InternalScalarValue)[],
    reduceInitialValue: T,
    composeFunction: (left: T, right: T) => T,
    mapFunction: (arg: InternalScalarValue) => T,
    finalizeResult: (result: T) => number | CellError,
  ): SampledDistribution | CellError | undefined {
    const conditions = this.parseSampleAwareConditions(valuesRange, conditionArgs)
    if (conditions instanceof CellError || conditions === undefined) {
      return conditions
    }

    const valueEntries = valuesRange.valuesFromTopLeftCorner()
    const valueSamples = valueEntries.map((value) => sampleAwareConditionalValue(value, this.config))
    const sampleCount = maxConditionalSampleCount(valueSamples, conditions, this.config.sampleSize)
    const resultSamples: number[] = []

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
      const criterionPackages: CriterionPackage[] = []

      for (const condition of conditions) {
        const sampledCriterion = condition.criterionSamples[sampleIndex % condition.criterionSamples.length]
        const criterionValue = sampleAwareCriterionValue(sampledCriterion)
        if (criterionValue instanceof CellError) {
          return criterionValue
        }

        const criterionPackage = this.interpreter.criterionBuilder.fromCellValue(criterionValue, this.arithmeticHelper)
        if (criterionPackage === undefined) {
          return new CellError(ErrorType.VALUE, ErrorMessage.BadCriterion)
        }
        criterionPackages.push(criterionPackage)
      }

      let result = reduceInitialValue
      for (let valueIndex = 0; valueIndex < valueEntries.length; valueIndex++) {
        const matchesAllCriteria = conditions.every((condition, conditionIndex) => {
          const sampledConditionValue = condition.rangeSamples[valueIndex][sampleIndex % condition.rangeSamples[valueIndex].length]
          return criterionPackages[conditionIndex].lambda(getRawValue(sampledConditionValue))
        })

        if (!matchesAllCriteria) {
          continue
        }

        const sampledValue = valueSamples[valueIndex][sampleIndex % valueSamples[valueIndex].length]
        const mappedValue = mapFunction(sampledValue)
        if (mappedValue instanceof CellError) {
          return mappedValue
        }

        result = composeFunction(result, mappedValue)
      }

      const finalized = finalizeResult(result)
      if (finalized instanceof CellError) {
        return finalized
      }
      resultSamples.push(finalized === 0 ? 0 : finalized)
    }

    return new SampledDistribution(resultSamples, this.config)
  }

  private parseSampleAwareConditions(
    valuesRange: SimpleRangeValue,
    conditionArgs: (SimpleRangeValue | InternalScalarValue)[],
  ): SampleAwareCondition[] | CellError | undefined {
    const conditions: SampleAwareCondition[] = []
    let hasUncertainty = containsUncertainty(valuesRange.valuesFromTopLeftCorner())

    for (let i = 0; i < conditionArgs.length; i += 2) {
      const conditionRange = conditionArgs[i] as SimpleRangeValue
      if (!conditionRange.sameDimensionsAs(valuesRange)) {
        return new CellError(ErrorType.VALUE, ErrorMessage.EqualLength)
      }

      const criterion = conditionArgs[i + 1] as InternalScalarValue
      if (criterion instanceof CellError) {
        return criterion
      }

      const rangeEntries = conditionRange.valuesFromTopLeftCorner()
      const criterionValue = sampleAwareCriterionValue(criterion)
      if (criterionValue instanceof CellError) {
        return criterionValue
      }

      const criterionPackage = this.interpreter.criterionBuilder.fromCellValue(criterionValue, this.arithmeticHelper)
      if (criterionPackage === undefined) {
        return new CellError(ErrorType.VALUE, ErrorMessage.BadCriterion)
      }

      hasUncertainty = hasUncertainty || containsUncertainty(rangeEntries) || isUncertainValue(criterion)
      conditions.push({
        criterionSamples: sampleAwareConditionalValue(criterion, this.config),
        rangeSamples: rangeEntries.map((entry) => sampleAwareConditionalValue(entry, this.config)),
      })
    }

    return hasUncertainty ? conditions : undefined
  }
}

type SampleAwareCondition = {
  criterionSamples: InternalScalarValue[],
  rangeSamples: InternalScalarValue[][],
}

const containsUncertainty = (values: InternalScalarValue[]): boolean =>
  values.some((value) => isUncertainValue(value))

const sampleAwareConditionalValue = (
  value: InternalScalarValue,
  config: Config,
): InternalScalarValue[] => {
  if (value instanceof CellError) {
    return Array.from({length: config.sampleSize}, () => value)
  }

  if (isUncertainValue(value)) {
    return samplesForValue(value, config)
  }

  return Array.from({length: config.sampleSize}, () => value)
}

const normalizeCriterionForScalarPath = (criterion: InternalScalarValue): RawScalarValue =>
  isExtendedNumber(criterion) ? getRawValue(criterion) : criterion

const sampleAwareCriterionValue = (value: InternalScalarValue): RawScalarValue | CellError => {
  if (value instanceof CellError) {
    return value
  }

  return isExtendedNumber(value) ? getRawValue(value) : value
}

const maxConditionalSampleCount = (
  valueSamples: InternalScalarValue[][],
  conditions: SampleAwareCondition[],
  fallbackSampleSize: number,
): number => {
  let sampleCount = fallbackSampleSize

  for (const samples of valueSamples) {
    sampleCount = Math.max(sampleCount, samples.length)
  }

  for (const condition of conditions) {
    sampleCount = Math.max(sampleCount, condition.criterionSamples.length)
    for (const samples of condition.rangeSamples) {
      sampleCount = Math.max(sampleCount, samples.length)
    }
  }

  return sampleCount
}
