/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {AbsoluteCellRange, AbsoluteColumnRange, AbsoluteRowRange} from '../AbsoluteCellRange'

import {CellAddress} from './'
import {ColumnAddress} from './ColumnAddress'
import {RowAddress} from './RowAddress'
import {SimpleCellAddress} from '../Cell'

// Define a class that exists at runtime
export class RelativeDependency {
  // Base implementation that will be overridden
  public absolutize(baseAddress: SimpleCellAddress): any {
    throw new Error('Method not implemented.');
  }
}

export type RangeDependency = CellRangeDependency | ColumnRangeDependency | RowRangeDependency

// Create a dummy object for RangeDependency that can be exported at runtime
export const RangeDependency = {
  isCellRangeDependency: (dep: RelativeDependency): dep is CellRangeDependency => dep instanceof CellRangeDependency,
  isColumnRangeDependency: (dep: RelativeDependency): dep is ColumnRangeDependency => dep instanceof ColumnRangeDependency,
  isRowRangeDependency: (dep: RelativeDependency): dep is RowRangeDependency => dep instanceof RowRangeDependency
}

// Keep the type for TypeScript usage
export type RelativeDependencyType = AddressDependency | RangeDependency | NamedExpressionDependency

// Create a dummy object that can be exported at runtime
export const RelativeDependencyType = {
  isAddressDependency: (dep: RelativeDependency): dep is AddressDependency => dep instanceof AddressDependency,
  isCellRangeDependency: (dep: RelativeDependency): dep is CellRangeDependency => dep instanceof CellRangeDependency,
  isColumnRangeDependency: (dep: RelativeDependency): dep is ColumnRangeDependency => dep instanceof ColumnRangeDependency,
  isRowRangeDependency: (dep: RelativeDependency): dep is RowRangeDependency => dep instanceof RowRangeDependency,
  isNamedExpressionDependency: (dep: RelativeDependency): dep is NamedExpressionDependency => dep instanceof NamedExpressionDependency
}

export class AddressDependency extends RelativeDependency {
  constructor(
    public readonly dependency: CellAddress
  ) {
    super();
  }

  public absolutize(baseAddress: SimpleCellAddress) {
    return this.dependency.toSimpleCellAddress(baseAddress)
  }
}

export class CellRangeDependency extends RelativeDependency {
  constructor(
    public readonly start: CellAddress,
    public readonly end: CellAddress,
  ) {
    super();
  }

  public absolutize(baseAddress: SimpleCellAddress) {
    return new AbsoluteCellRange(
      this.start.toSimpleCellAddress(baseAddress),
      this.end.toSimpleCellAddress(baseAddress)
    )
  }
}

export class ColumnRangeDependency extends RelativeDependency {
  constructor(
    public readonly start: ColumnAddress,
    public readonly end: ColumnAddress,
  ) {
    super();
  }

  public absolutize(baseAddress: SimpleCellAddress) {
    const start = this.start.toSimpleColumnAddress(baseAddress)
    const end = this.end.toSimpleColumnAddress(baseAddress)
    return new AbsoluteColumnRange(start.sheet, start.col, end.col)
  }
}

export class RowRangeDependency extends RelativeDependency {
  constructor(
    public readonly start: RowAddress,
    public readonly end: RowAddress,
  ) {
    super();
  }

  public absolutize(baseAddress: SimpleCellAddress) {
    const start = this.start.toSimpleRowAddress(baseAddress)
    const end = this.end.toSimpleRowAddress(baseAddress)
    return new AbsoluteRowRange(start.sheet, start.row, end.row)
  }
}

export class NamedExpressionDependency extends RelativeDependency {
  constructor(
    public readonly name: string
  ) {
    super();
  }

  public absolutize(_baseAddress: SimpleCellAddress) {
    return this
  }
}
