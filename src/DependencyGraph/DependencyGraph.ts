/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {AbsoluteCellRange, SimpleCellRange, simpleCellRange} from '../AbsoluteCellRange'
import {
  ArrayVertex,
  CellVertex,
  EmptyCellVertex,
  FormulaCellVertex,
  ParsingErrorVertex,
  RangeVertex,
  ValueCellVertex,
  Vertex,
} from './'
import {Ast, NamedExpressionDependency, collectDependencies} from '../parser'
import {CellError, ErrorType, SimpleCellAddress, isSimpleCellAddress, simpleCellAddress} from '../Cell'
import {ColumnsSpan, RowsSpan, Span} from '../Span'
import {DependencyQuery, Graph} from './Graph'
import {
  EmptyValue,
  InternalScalarValue,
  InterpreterValue,
  RawScalarValue,
  getRawValue
} from '../interpreter/InterpreterValue'
import {StatType, Statistics} from '../statistics'

import {AddressMapping} from './AddressMapping/AddressMapping'
import {ArrayMapping} from './ArrayMapping'
import {ArraySize} from '../ArraySize'
import {CellDependency} from '../CellDependency'
import {Config} from '../Config'
import {ContentChanges} from '../ContentChanges'
import {ErrorMessage} from '../error-message'
import {FormulaVertex} from './FormulaCellVertex'
import {FunctionRegistry} from '../interpreter/FunctionRegistry'
import {LazilyTransformingAstService} from '../LazilyTransformingAstService'
import {Maybe} from '../Maybe'
import {NamedExpressions} from '../NamedExpressions'
import {RangeMapping} from './RangeMapping'
import {RawAndParsedValue} from './ValueCellVertex'
import {RawCellContent} from '../CellContentParser'
import {SheetMapping} from './SheetMapping'
import {SimpleRangeValue} from '../SimpleRangeValue'
import {TopSortResult} from './TopSort'
import {absolutizeDependencies} from '../absolutizeDependencies'
import {collectAddressesDependentToRange} from './collectAddressesDependentToRange'

export class DependencyGraph {
  public readonly graph: Graph<Vertex>
  private changes: ContentChanges = ContentChanges.empty()

  constructor(
    public readonly addressMapping: AddressMapping,
    public readonly rangeMapping: RangeMapping,
    public readonly sheetMapping: SheetMapping,
    public readonly arrayMapping: ArrayMapping,
    public readonly stats: Statistics,
    public readonly lazilyTransformingAstService: LazilyTransformingAstService,
    public readonly functionRegistry: FunctionRegistry,
    public readonly namedExpressions: NamedExpressions,
  ) {
    this.graph = new Graph<Vertex>(this.dependencyQueryVertices)
  }

  /**
   * Invariants:
   * - empty cell has associated EmptyCellVertex if and only if it is a dependency (possibly indirect, through range) to some formula
   */

  public static buildEmpty(lazilyTransformingAstService: LazilyTransformingAstService, config: Config, functionRegistry: FunctionRegistry, namedExpressions: NamedExpressions, stats: Statistics) {
    return new DependencyGraph(
      new AddressMapping(config.chooseAddressMappingPolicy),
      new RangeMapping(),
      new SheetMapping(config.translationPackage),
      new ArrayMapping(),
      stats,
      lazilyTransformingAstService,
      functionRegistry,
      namedExpressions
    )
  }

  public setFormulaToCell(address: SimpleCellAddress, ast: Ast, dependencies: CellDependency[], size: ArraySize, hasVolatileFunction: boolean, hasStructuralChangeFunction: boolean): ContentChanges {
    const newVertex = FormulaVertex.fromAst(ast, address, size, this.lazilyTransformingAstService.version())
    this.exchangeOrAddFormulaVertex(newVertex)
    this.processCellDependencies(dependencies, newVertex)
    this.graph.markNodeAsDirty(newVertex)
    if (hasVolatileFunction) {
      this.markAsVolatile(newVertex)
    }
    if (hasStructuralChangeFunction) {
      this.markAsDependentOnStructureChange(newVertex)
    }
    this.correctInfiniteRangesDependency(address)
    return this.getAndClearContentChanges()
  }

  public setParsingErrorToCell(address: SimpleCellAddress, errorVertex: ParsingErrorVertex): ContentChanges {
    const vertex = this.shrinkPossibleArrayAndGetCell(address)
    this.exchangeOrAddGraphNode(vertex, errorVertex)
    this.addressMapping.setCell(address, errorVertex)
    this.graph.markNodeAsDirty(errorVertex)
    this.correctInfiniteRangesDependency(address)
    return this.getAndClearContentChanges()
  }

  public setValueToCell(address: SimpleCellAddress, value: RawAndParsedValue): ContentChanges {
    const vertex = this.shrinkPossibleArrayAndGetCell(address)

    if (vertex instanceof ArrayVertex) {
      this.arrayMapping.removeArray(vertex.getRange())
    }

    if (vertex instanceof ValueCellVertex) {
      const oldValues = vertex.getValues()
      if (oldValues.rawValue !== value.rawValue) {
        vertex.setValues(value)
        this.graph.markNodeAsDirty(vertex)
      }
    } else {
      const newVertex = new ValueCellVertex(value.parsedValue, value.rawValue)
      this.exchangeOrAddGraphNode(vertex, newVertex)
      this.addressMapping.setCell(address, newVertex)
      this.graph.markNodeAsDirty(newVertex)
    }

    this.correctInfiniteRangesDependency(address)

    return this.getAndClearContentChanges()
  }

  public setCellEmpty(address: SimpleCellAddress): ContentChanges {
    const vertex = this.shrinkPossibleArrayAndGetCell(address)
    if (vertex === undefined) {
      return ContentChanges.empty()
    }
    if (this.graph.adjacentNodes(vertex).size > 0) {
      const emptyVertex = new EmptyCellVertex()
      this.exchangeGraphNode(vertex, emptyVertex)
      if (this.graph.adjacentNodesCount(emptyVertex) === 0) {
        this.removeVertex(emptyVertex)
        this.addressMapping.removeCell(address)
      } else {
        this.graph.markNodeAsDirty(emptyVertex)
        this.addressMapping.setCell(address, emptyVertex)
      }
    } else {
      this.removeVertex(vertex)
      this.addressMapping.removeCell(address)
    }

    return this.getAndClearContentChanges()
  }

  public clearDirtyVertices() {
    this.graph.clearDirtyNodes()
  }

  public verticesToRecompute(): Vertex[] {
    return this.graph.getDirtyAndVolatileNodes()
  }

  public processCellDependencies(cellDependencies: CellDependency[], endVertex: Vertex) {
    const endVertexId = this.graph.getNodeId(endVertex)!

    cellDependencies.forEach((dep: CellDependency) => {
      if (dep instanceof AbsoluteCellRange) {
        const range = dep

        let rangeVertex = this.getRange(range.start, range.end)
        if (rangeVertex === undefined) {
          rangeVertex = new RangeVertex(range)
          this.rangeMapping.setRange(rangeVertex)
        }

        this.graph.addNodeAndReturnId(rangeVertex)
        const rangeVertexId = this.graph.getNodeId(rangeVertex)!

        if (!range.isFinite()) {
          this.graph.markNodeAsInfiniteRange(rangeVertexId)
        }

        const {smallerRangeVertex, restRange} = this.rangeMapping.findSmallerRange(range)
        if (smallerRangeVertex !== undefined) {
          this.graph.addEdge(smallerRangeVertex, rangeVertexId)
          if (rangeVertex.bruteForce) {
            rangeVertex.bruteForce = false
            for (const cellFromRange of range.addresses(this)) { //if we ever switch heuristic to processing by sorted sizes, this would be unnecessary
              this.graph.removeEdge(this.fetchCell(cellFromRange), rangeVertexId)
            }
          }
        } else {
          rangeVertex.bruteForce = true
        }

        const array = this.arrayMapping.getArray(restRange)
        if (array !== undefined) {
          this.graph.addEdge(array, rangeVertexId)
        } else {
          for (const cellFromRange of restRange.addresses(this)) {
            const { vertex, id } = this.fetchCellOrCreateEmpty(cellFromRange)
            this.graph.addEdge(id ?? vertex, rangeVertexId)
          }
        }
        this.graph.addEdge(rangeVertexId, endVertexId)

        if (range.isFinite()) {
          this.correctInfiniteRangesDependenciesByRangeVertex(rangeVertex)
        }
      } else if (dep instanceof NamedExpressionDependency) {
        const sheetOfVertex = (endVertex as FormulaCellVertex).getAddress(this.lazilyTransformingAstService).sheet
        const { vertex, id } = this.fetchNamedExpressionVertex(dep.name, sheetOfVertex)
        this.graph.addEdge(id ?? vertex, endVertexId)
      } else {
        const { vertex, id } = this.fetchCellOrCreateEmpty(dep)
        this.graph.addEdge(id ?? vertex, endVertexId)
      }
    })
  }

  public fetchNamedExpressionVertex(expressionName: string, sheetId: number): { vertex: CellVertex, id: Maybe<number>} {
    const namedExpression = this.namedExpressions.namedExpressionOrPlaceholder(expressionName, sheetId)
    return this.fetchCellOrCreateEmpty(namedExpression.address)
  }

  public exchangeNode(addressFrom: SimpleCellAddress, addressTo: SimpleCellAddress) {
    const vertexFrom = this.fetchCellOrCreateEmpty(addressFrom).vertex
    const vertexTo = this.fetchCellOrCreateEmpty(addressTo).vertex
    this.addressMapping.removeCell(addressFrom)
    this.exchangeGraphNode(vertexFrom, vertexTo)
  }

  public fetchCellOrCreateEmpty(address: SimpleCellAddress): { vertex: CellVertex, id: Maybe<number> } {
    const existingVertex = this.addressMapping.getCell(address)

    if (existingVertex !== undefined) {
      return { vertex: existingVertex, id: undefined }
    }

    const newVertex = new EmptyCellVertex()
    const newVertexId = this.graph.addNodeAndReturnId(newVertex)
    this.addressMapping.setCell(address, newVertex)

    return { vertex: newVertex, id: newVertexId }
  }

  public removeRows(removedRows: RowsSpan): EagerChangesGraphChangeResult {
    this.stats.measure(StatType.ADJUSTING_GRAPH, () => {
      for (const [address, vertex] of this.addressMapping.entriesFromRowsSpan(removedRows)) {
        for (const adjacentNode of this.graph.adjacentNodes(vertex)) {
          this.graph.markNodeAsDirty(adjacentNode)
        }
        if (vertex instanceof ArrayVertex) {
          if (vertex.isLeftCorner(address)) {
            this.shrinkArrayToCorner(vertex)
            this.arrayMapping.removeArray(vertex.getRange())
          } else {
            continue
          }
        }
        this.removeVertex(vertex)
      }
    })

    this.stats.measure(StatType.ADJUSTING_ADDRESS_MAPPING, () => {
      this.addressMapping.removeRows(removedRows)
    })

    const affectedArrays = this.stats.measure(StatType.ADJUSTING_RANGES, () => {
      const affectedRanges = this.truncateRanges(removedRows, address => address.row)
      return this.getArrayVerticesRelatedToRanges(affectedRanges)
    })

    this.stats.measure(StatType.ADJUSTING_ARRAY_MAPPING, () => {
      this.fixArraysAfterRemovingRows(removedRows.sheet, removedRows.rowStart, removedRows.numberOfRows)
    })

    this.addStructuralNodesToChangeSet()

    return {
      affectedArrays,
      contentChanges: this.getAndClearContentChanges()
    }
  }

  public removeSheet(removedSheetId: number) {
    this.clearSheet(removedSheetId)

    for (const [adr, vertex] of this.addressMapping.sheetEntries(removedSheetId)) {
      for (const adjacentNode of this.graph.adjacentNodes(vertex)) {
        this.graph.markNodeAsDirty(adjacentNode)
      }
      this.removeVertex(vertex)
      this.addressMapping.removeCell(adr)
    }

    this.stats.measure(StatType.ADJUSTING_RANGES, () => {
      const rangesToRemove = this.rangeMapping.removeRangesInSheet(removedSheetId)
      for (const range of rangesToRemove) {
        this.removeVertex(range)
      }

      this.stats.measure(StatType.ADJUSTING_ADDRESS_MAPPING, () => {
        this.addressMapping.removeSheet(removedSheetId)
      })
    })
  }

  public clearSheet(sheetId: number) {
    const arrays: Set<ArrayVertex> = new Set()
    for (const [address, vertex] of this.addressMapping.sheetEntries(sheetId)) {
      if (vertex instanceof ArrayVertex) {
        arrays.add(vertex)
      } else {
        this.setCellEmpty(address)
      }
    }

    for (const array of arrays.values()) {
      this.setArrayEmpty(array)
    }

    this.addStructuralNodesToChangeSet()
  }

  public removeColumns(removedColumns: ColumnsSpan): EagerChangesGraphChangeResult {
    this.stats.measure(StatType.ADJUSTING_GRAPH, () => {
      for (const [address, vertex] of this.addressMapping.entriesFromColumnsSpan(removedColumns)) {
        for (const adjacentNode of this.graph.adjacentNodes(vertex)) {
          this.graph.markNodeAsDirty(adjacentNode)
        }
        if (vertex instanceof ArrayVertex) {
          if (vertex.isLeftCorner(address)) {
            this.shrinkArrayToCorner(vertex)
            this.arrayMapping.removeArray(vertex.getRange())
          } else {
            continue
          }
        }
        this.removeVertex(vertex)
      }
    })

    this.stats.measure(StatType.ADJUSTING_ADDRESS_MAPPING, () => {
      this.addressMapping.removeColumns(removedColumns)
    })

    const affectedArrays = this.stats.measure(StatType.ADJUSTING_RANGES, () => {
      const affectedRanges = this.truncateRanges(removedColumns, address => address.col)
      return this.getArrayVerticesRelatedToRanges(affectedRanges)
    })

    this.stats.measure(StatType.ADJUSTING_ARRAY_MAPPING, () => {
      return this.fixArraysAfterRemovingColumns(removedColumns.sheet, removedColumns.columnStart, removedColumns.numberOfColumns)
    })

    this.addStructuralNodesToChangeSet()

    return {
      affectedArrays,
      contentChanges: this.getAndClearContentChanges(),
    }
  }

  public addRows(addedRows: RowsSpan): ArrayAffectingGraphChangeResult {
    this.stats.measure(StatType.ADJUSTING_ADDRESS_MAPPING, () => {
      this.addressMapping.addRows(addedRows.sheet, addedRows.rowStart, addedRows.numberOfRows)
    })

    const affectedArrays = this.stats.measure(StatType.ADJUSTING_RANGES, () => {
      const result = this.rangeMapping.moveAllRangesInSheetAfterRowByRows(addedRows.sheet, addedRows.rowStart, addedRows.numberOfRows)
      this.fixRangesWhenAddingRows(addedRows.sheet, addedRows.rowStart, addedRows.numberOfRows)
      return this.getArrayVerticesRelatedToRanges(result.verticesWithChangedSize)
    })

    this.stats.measure(StatType.ADJUSTING_ARRAY_MAPPING, () => {
      this.fixArraysAfterAddingRow(addedRows.sheet, addedRows.rowStart, addedRows.numberOfRows)
    })

    for (const vertex of this.addressMapping.verticesFromRowsSpan(addedRows)) {
      this.graph.markNodeAsDirty(vertex)
    }

    this.addStructuralNodesToChangeSet()

    return {affectedArrays}
  }

  public addColumns(addedColumns: ColumnsSpan): EagerChangesGraphChangeResult {
    this.stats.measure(StatType.ADJUSTING_ADDRESS_MAPPING, () => {
      this.addressMapping.addColumns(addedColumns.sheet, addedColumns.columnStart, addedColumns.numberOfColumns)
    })

    const affectedArrays = this.stats.measure(StatType.ADJUSTING_RANGES, () => {
      const result = this.rangeMapping.moveAllRangesInSheetAfterColumnByColumns(addedColumns.sheet, addedColumns.columnStart, addedColumns.numberOfColumns)
      this.fixRangesWhenAddingColumns(addedColumns.sheet, addedColumns.columnStart, addedColumns.numberOfColumns)
      return this.getArrayVerticesRelatedToRanges(result.verticesWithChangedSize)
    })

    this.stats.measure(StatType.ADJUSTING_ARRAY_MAPPING, () => {
      return this.fixArraysAfterAddingColumn(addedColumns.sheet, addedColumns.columnStart, addedColumns.numberOfColumns)
    })

    for (const vertex of this.addressMapping.verticesFromColumnsSpan(addedColumns)) {
      this.graph.markNodeAsDirty(vertex)
    }

    this.addStructuralNodesToChangeSet()

    return {affectedArrays, contentChanges: this.getAndClearContentChanges()}
  }

  public isThereSpaceForArray(arrayVertex: ArrayVertex): boolean {
    const range = arrayVertex.getRangeOrUndef()
    if (range === undefined) {
      return false
    }
    for (const address of range.addresses(this)) {
      const vertexUnderAddress = this.addressMapping.getCell(address)
      if (vertexUnderAddress !== undefined && !(vertexUnderAddress instanceof EmptyCellVertex) && vertexUnderAddress !== arrayVertex) {
        return false
      }
    }
    return true
  }

  public moveCells(sourceRange: AbsoluteCellRange, toRight: number, toBottom: number, toSheet: number) {
    for (const sourceAddress of sourceRange.addressesWithDirection(toRight, toBottom, this)) {
      const targetAddress = simpleCellAddress(toSheet, sourceAddress.col + toRight, sourceAddress.row + toBottom)
      let sourceVertex = this.addressMapping.getCell(sourceAddress)
      const targetVertex = this.addressMapping.getCell(targetAddress)

      this.addressMapping.removeCell(sourceAddress)

      if (sourceVertex !== undefined) {
        this.graph.markNodeAsDirty(sourceVertex)
        this.addressMapping.setCell(targetAddress, sourceVertex)
        let emptyVertex = undefined
        for (const adjacentNode of this.graph.adjacentNodes(sourceVertex)) {
          if (adjacentNode instanceof RangeVertex && !sourceRange.containsRange(adjacentNode.range)) {
            emptyVertex = emptyVertex ?? this.fetchCellOrCreateEmpty(sourceAddress).vertex
            this.graph.addEdge(emptyVertex, adjacentNode)
            this.graph.removeEdge(sourceVertex, adjacentNode)
          }
        }
        if (emptyVertex) {
          this.graph.markNodeAsDirty(emptyVertex)
          this.addressMapping.setCell(sourceAddress, emptyVertex)
        }
      }

      if (targetVertex !== undefined) {
        if (sourceVertex === undefined) {
          this.addressMapping.removeCell(targetAddress)
        }
        for (const adjacentNode of this.graph.adjacentNodes(targetVertex)) {
          sourceVertex = sourceVertex ?? this.fetchCellOrCreateEmpty(targetAddress).vertex
          this.graph.addEdge(sourceVertex, adjacentNode)
          this.graph.markNodeAsDirty(sourceVertex)
        }
        this.removeVertex(targetVertex)
      }
    }

    for (const rangeVertex of this.rangeMapping.rangeVerticesContainedInRange(sourceRange)) {
      for (const adjacentNode of this.graph.adjacentNodes(rangeVertex)) {
        if (adjacentNode instanceof RangeVertex && !sourceRange.containsRange(adjacentNode.range)) {
          this.graph.removeEdge(rangeVertex, adjacentNode)

          for (const address of rangeVertex.range.addresses(this)) {
            const { vertex, id } = this.fetchCellOrCreateEmpty(address)
            this.graph.addEdge(id ?? vertex, adjacentNode)
            this.addressMapping.setCell(address, vertex)
            this.graph.markNodeAsDirty(vertex)
          }
        }
      }
    }

    this.rangeMapping.moveRangesInsideSourceRange(sourceRange, toRight, toBottom, toSheet)
  }

  public setArrayEmpty(arrayVertex: ArrayVertex) {
    const arrayRange = AbsoluteCellRange.spanFrom(arrayVertex.getAddress(this.lazilyTransformingAstService), arrayVertex.width, arrayVertex.height)
    const adjacentNodes = this.graph.adjacentNodes(arrayVertex)

    for (const address of arrayRange.addresses(this)) {
      this.addressMapping.removeCell(address)
    }

    for (const adjacentNode of adjacentNodes.values()) {
      const nodeDependencies = collectAddressesDependentToRange(this.functionRegistry, adjacentNode, arrayVertex.getRange(), this.lazilyTransformingAstService, this)
      for (const address of nodeDependencies) {
        const { vertex, id } = this.fetchCellOrCreateEmpty(address)
        this.graph.addEdge(id ?? vertex, adjacentNode)
      }
      if (nodeDependencies.length > 0) {
        this.graph.markNodeAsDirty(adjacentNode)
      }
    }

    this.removeVertex(arrayVertex)
    this.arrayMapping.removeArray(arrayVertex.getRange())
  }

  public addVertex(address: SimpleCellAddress, vertex: CellVertex): void {
    this.graph.addNodeAndReturnId(vertex)
    this.addressMapping.setCell(address, vertex)
  }

  public addArrayVertex(address: SimpleCellAddress, vertex: ArrayVertex): void {
    this.graph.addNodeAndReturnId(vertex)
    this.setAddressMappingForArrayVertex(vertex, address)
  }

  public* arrayFormulaNodes(): IterableIterator<ArrayVertex> {
    for (const vertex of this.graph.getNodes()) {
      if (vertex instanceof ArrayVertex) {
        yield vertex
      }
    }
  }

  public* entriesFromRowsSpan(rowsSpan: RowsSpan): IterableIterator<[SimpleCellAddress, CellVertex]> {
    yield* this.addressMapping.entriesFromRowsSpan(rowsSpan)
  }

  public* entriesFromColumnsSpan(columnsSpan: ColumnsSpan): IterableIterator<[SimpleCellAddress, CellVertex]> {
    yield* this.addressMapping.entriesFromColumnsSpan(columnsSpan)
  }

  public fetchCell(address: SimpleCellAddress): CellVertex {
    return this.addressMapping.fetchCell(address)
  }

  public getCell(address: SimpleCellAddress): Maybe<CellVertex> {
    return this.addressMapping.getCell(address)
  }

  public getCellValue(address: SimpleCellAddress): InterpreterValue {
    return this.addressMapping.getCellValue(address)
  }

  public getRawValue(address: SimpleCellAddress): RawCellContent {
    return this.addressMapping.getRawValue(address)
  }

  public getScalarValue(address: SimpleCellAddress): InternalScalarValue {
    const value = this.addressMapping.getCellValue(address)
    if (value instanceof SimpleRangeValue) {
      return new CellError(ErrorType.VALUE, ErrorMessage.ScalarExpected)
    }
    return value
  }

  public existsEdge(fromNode: Vertex, toNode: Vertex): boolean {
    return this.graph.existsEdge(fromNode, toNode)
  }

  public getSheetId(sheetName: string): number {
    return this.sheetMapping.fetch(sheetName)
  }

  public getSheetHeight(sheet: number): number {
    return this.addressMapping.getHeight(sheet)
  }

  public getSheetWidth(sheet: number): number {
    return this.addressMapping.getWidth(sheet)
  }

  public getArray(range: AbsoluteCellRange): Maybe<ArrayVertex> {
    return this.arrayMapping.getArray(range)
  }

  public getRange(start: SimpleCellAddress, end: SimpleCellAddress): Maybe<RangeVertex> {
    return this.rangeMapping.getRange(start, end)
  }

  public topSortWithScc(): TopSortResult<Vertex> {
    return this.graph.topSortWithScc()
  }

  public markAsVolatile(vertex: Vertex) {
    this.graph.markNodeAsVolatile(vertex)
  }

  public markAsDependentOnStructureChange(vertex: Vertex): void {
    this.graph.markNodeAsChangingWithStructure(vertex)
  }

  public forceApplyPostponedTransformations() {
    for (const vertex of this.graph.getNodes()) {
      if (vertex instanceof FormulaCellVertex) {
        vertex.ensureRecentData(this.lazilyTransformingAstService)
      }
    }
  }

  public* rawValuesFromRange(range: AbsoluteCellRange): IterableIterator<[RawScalarValue, SimpleCellAddress]> {
    for (const address of range.addresses(this)) {
      const value = this.getScalarValue(address)
      if (value !== EmptyValue) {
        yield [getRawValue(value), address]
      }
    }
  }

  public dependencyQueryAddresses: (vertex: Vertex) => (SimpleCellAddress | SimpleCellRange)[] = (vertex: Vertex) => {
    if (vertex instanceof RangeVertex) {
      return this.rangeDependencyQuery(vertex).map(([address, _]) => address)
    } else {
      const dependenciesResult = this.formulaDependencyQuery(vertex)
      if (dependenciesResult !== undefined) {
        const [address, dependencies] = dependenciesResult
        return dependencies.map((dependency: CellDependency) => {
          if (dependency instanceof NamedExpressionDependency) {
            return this.namedExpressions.namedExpressionOrPlaceholder(dependency.name, address.sheet).address
          } else if (isSimpleCellAddress(dependency)) {
            return dependency
          } else {
            return simpleCellRange(dependency.start, dependency.end)
          }
        })
      } else {
        return []
      }
    }
  }

  public computeListOfValuesInRange(range: AbsoluteCellRange): InternalScalarValue[] {
    const values: InternalScalarValue[] = []
    for (const cellFromRange of range.addresses(this)) {
      const value = this.getScalarValue(cellFromRange)
      values.push(value)
    }
    return values
  }

  public shrinkArrayToCorner(array: ArrayVertex) {
    this.cleanAddressMappingUnderArray(array)
    for (const adjacentVertex of this.adjacentArrayVertices(array)) {
      let relevantDependencies
      if (adjacentVertex instanceof FormulaVertex) {
        relevantDependencies = this.formulaDirectDependenciesToArray(adjacentVertex, array)
      } else {
        relevantDependencies = this.rangeDirectDependenciesToArray(adjacentVertex, array)
      }
      let dependentToCorner = false
      for (const [address, vertex] of relevantDependencies) {
        if (array.isLeftCorner(address)) {
          dependentToCorner = true
        }
        this.graph.addEdge(vertex, adjacentVertex)
        this.graph.markNodeAsDirty(vertex)
      }
      if (!dependentToCorner) {
        this.graph.removeEdge(array, adjacentVertex)
      }
    }
    this.graph.markNodeAsDirty(array)
  }

  public isArrayInternalCell(address: SimpleCellAddress): boolean {
    const vertex = this.getCell(address)
    return vertex instanceof ArrayVertex && !vertex.isLeftCorner(address)
  }

  public getAndClearContentChanges(): ContentChanges {
    const changes = this.changes
    this.changes = ContentChanges.empty()
    return changes
  }

  public getAdjacentNodesAddresses(inputVertex: Vertex): (SimpleCellRange | SimpleCellAddress)[] {
    const deps = this.graph.adjacentNodes(inputVertex)
    const ret: (SimpleCellRange | SimpleCellAddress)[] = []
    deps.forEach((vertex: Vertex) => {
      const castVertex = vertex as RangeVertex | FormulaCellVertex | ArrayVertex
      if (castVertex instanceof RangeVertex) {
        ret.push(simpleCellRange(castVertex.start, castVertex.end))
      } else {
        ret.push(castVertex.getAddress(this.lazilyTransformingAstService))
      }
    })
    return ret
  }

  private exchangeGraphNode(oldNode: Vertex, newNode: Vertex) {
    this.graph.addNodeAndReturnId(newNode)
    const adjNodesStored = this.graph.adjacentNodes(oldNode)
    this.removeVertex(oldNode)
    adjNodesStored.forEach((adjacentNode) => {
      if (this.graph.hasNode(adjacentNode)) {
        this.graph.addEdge(newNode, adjacentNode)
      }
    })
  }

  private setArray(range: AbsoluteCellRange, vertex: ArrayVertex): void {
    this.arrayMapping.setArray(range, vertex)
  }

  private correctInfiniteRangesDependency(address: SimpleCellAddress) {
    const relevantInfiniteRanges = (this.graph.getInfiniteRanges())
    .filter(({ node }) => (node as RangeVertex).range.addressInRange(address))

    if (relevantInfiniteRanges.length <= 0) {
      return
    }

    const { vertex, id: maybeVertexId } = this.fetchCellOrCreateEmpty(address)
    const vertexId = maybeVertexId ?? this.graph.getNodeId(vertex)!

    relevantInfiniteRanges.forEach(({ id }) => {
      this.graph.addEdge(vertexId, id)
    })
  }

  private exchangeOrAddGraphNode(oldNode: Maybe<Vertex>, newNode: Vertex) {
    if (oldNode) {
      this.exchangeGraphNode(oldNode, newNode)
    } else {
      this.graph.addNodeAndReturnId(newNode)
    }
  }

  private dependencyQueryVertices: DependencyQuery<Vertex> = (vertex: Vertex) => {
    if (vertex instanceof RangeVertex) {
      return this.rangeDependencyQuery(vertex)
    } else {
      const dependenciesResult = this.formulaDependencyQuery(vertex)
      if (dependenciesResult !== undefined) {
        const [address, dependencies] = dependenciesResult
        return dependencies.map((dependency: CellDependency) => {
          if (dependency instanceof AbsoluteCellRange) {
            return [dependency.start, this.rangeMapping.fetchRange(dependency.start, dependency.end)]
          } else if (dependency instanceof NamedExpressionDependency) {
            const namedExpression = this.namedExpressions.namedExpressionOrPlaceholder(dependency.name, address.sheet)
            return [namedExpression.address, this.addressMapping.fetchCell(namedExpression.address)]
          } else {
            return [dependency, this.addressMapping.fetchCell(dependency)]
          }
        })
      } else {
        return []
      }
    }
  }

  private getArrayVerticesRelatedToRanges(ranges: RangeVertex[]): Set<ArrayVertex> {
    const arrayVertices = new Set<ArrayVertex>()

    ranges.forEach(range => {
      if (!this.graph.hasNode(range)) {
        return
      }

      this.graph.adjacentNodes(range).forEach(adjacentVertex => {
        if (adjacentVertex instanceof ArrayVertex) {
          arrayVertices.add(adjacentVertex)
        }
      })
    })

    return arrayVertices
  }

  private correctInfiniteRangesDependenciesByRangeVertex(vertex: RangeVertex) {
    this.graph.getInfiniteRanges()
      .forEach(({ id: infiniteRangeVertexId, node: infiniteRangeVertex }) => {
        const intersection = vertex.range.intersectionWith((infiniteRangeVertex as RangeVertex).range)

        if (intersection === undefined) {
          return
        }

        intersection.addresses(this).forEach((address: SimpleCellAddress) => {
          const { vertex, id } = this.fetchCellOrCreateEmpty(address)
          this.graph.addEdge(id ?? vertex, infiniteRangeVertexId)
        })
      })
  }

  private cleanAddressMappingUnderArray(vertex: ArrayVertex) {
    const arrayRange = vertex.getRange()
    for (const address of arrayRange.addresses(this)) {
      const oldValue = vertex.getArrayCellValue(address)
      if (this.getCell(address) === vertex) {
        if (vertex.isLeftCorner(address)) {
          this.changes.addChange(new CellError(ErrorType.REF), address, oldValue)
        } else {
          this.addressMapping.removeCell(address)
          this.changes.addChange(EmptyValue, address, oldValue)
        }
      } else {
        this.changes.addChange(EmptyValue, address, oldValue)
      }
    }
  }

  private* formulaDirectDependenciesToArray(vertex: FormulaVertex, array: ArrayVertex): IterableIterator<[SimpleCellAddress, CellVertex]> {
    const [, formulaDependencies] = this.formulaDependencyQuery(vertex) ?? []
    if (formulaDependencies === undefined) {
      return
    }
    for (const dependency of formulaDependencies) {
      if (dependency instanceof NamedExpressionDependency || dependency instanceof AbsoluteCellRange) {
        continue
      }
      if (array.getRange().addressInRange(dependency)) {
        const vertex = this.fetchCellOrCreateEmpty(dependency).vertex
        yield [dependency, vertex]
      }
    }
  }

  private* rangeDirectDependenciesToArray(vertex: RangeVertex, array: ArrayVertex): IterableIterator<[SimpleCellAddress, CellVertex]> {
    const {restRange: range} = this.rangeMapping.findSmallerRange(vertex.range)
    for (const address of range.addresses(this)) {
      if (array.getRange().addressInRange(address)) {
        const cell = this.fetchCellOrCreateEmpty(address).vertex
        yield [address, cell]
      }
    }
  }

  private* adjacentArrayVertices(vertex: ArrayVertex): IterableIterator<FormulaVertex | RangeVertex> {
    const adjacentNodes = this.graph.adjacentNodes(vertex)
    for (const item of adjacentNodes) {
      if (item instanceof FormulaVertex || item instanceof RangeVertex) {
        yield item
      }
    }
  }

  private rangeDependencyQuery: DependencyQuery<Vertex> = (vertex: Vertex) => {
    const allDeps: [(SimpleCellAddress | AbsoluteCellRange), Vertex][] = []
    const {smallerRangeVertex, restRange} = this.rangeMapping.findSmallerRange((vertex as RangeVertex).range) //checking whether this range was splitted by bruteForce or not
    let range
    if (smallerRangeVertex !== undefined && this.graph.adjacentNodes(smallerRangeVertex).has(vertex)) {
      range = restRange
      allDeps.push([new AbsoluteCellRange(smallerRangeVertex.start, smallerRangeVertex.end), smallerRangeVertex])
    } else { //did we ever need to use full range
      range = (vertex as RangeVertex).range
    }
    for (const address of range.addresses(this)) {
      const cell = this.addressMapping.getCell(address)
      if (cell !== undefined) {
        allDeps.push([address, cell])
      }
    }
    return allDeps
  }

  private formulaDependencyQuery: (vertex: Vertex) => Maybe<[SimpleCellAddress, CellDependency[]]> = (vertex: Vertex) => {
    let formula: Ast
    let address: SimpleCellAddress
    if (vertex instanceof FormulaVertex) {
      address = vertex.getAddress(this.lazilyTransformingAstService)
      formula = vertex.getFormula(this.lazilyTransformingAstService)
    } else {
      return undefined
    }
    const deps = collectDependencies(formula, this.functionRegistry)
    return [address, absolutizeDependencies(deps, address)]
  }

  private addStructuralNodesToChangeSet(): void {
    this.graph.markChangingWithStructureNodesAsDirty()
  }

  private fixRangesWhenAddingRows(sheet: number, row: number, numberOfRows: number): void {
    const originalValues: RangeVertex[] = Array.from(this.rangeMapping.rangesInSheet(sheet))
    for (const rangeVertex of originalValues) {
      if (rangeVertex.range.includesRow(row + numberOfRows)) {
        if (rangeVertex.bruteForce) {
          const addedSubrangeInThatRange = rangeVertex.range.rangeWithSameWidth(row, numberOfRows)
          for (const address of addedSubrangeInThatRange.addresses(this)) {
            const { vertex, id } = this.fetchCellOrCreateEmpty(address)
            this.graph.addEdge(id ?? vertex, rangeVertex)
          }
        } else {
          let currentRangeVertex = rangeVertex
          let find = this.rangeMapping.findSmallerRange(currentRangeVertex.range)
          if (find.smallerRangeVertex !== undefined) {
            continue
          }
          while (find.smallerRangeVertex === undefined) {
            const newRangeVertex = new RangeVertex(AbsoluteCellRange.spanFrom(currentRangeVertex.range.start, currentRangeVertex.range.width(), currentRangeVertex.range.height() - 1))
            this.rangeMapping.setRange(newRangeVertex)
            this.graph.addNodeAndReturnId(newRangeVertex)
            const restRange = new AbsoluteCellRange(simpleCellAddress(currentRangeVertex.range.start.sheet, currentRangeVertex.range.start.col, currentRangeVertex.range.end.row), currentRangeVertex.range.end)
            this.addAllFromRange(restRange, currentRangeVertex)
            this.graph.addEdge(newRangeVertex, currentRangeVertex)
            currentRangeVertex = newRangeVertex
            find = this.rangeMapping.findSmallerRange(currentRangeVertex.range)
          }
          this.graph.addEdge(find.smallerRangeVertex, currentRangeVertex)
          this.addAllFromRange(find.restRange, currentRangeVertex)
          this.graph.removeEdge(find.smallerRangeVertex, rangeVertex)
        }
      }
    }
  }

  private addAllFromRange(range: AbsoluteCellRange, rangeVertex: RangeVertex) {
    for (const address of range.addresses(this)) {
      const { vertex, id } = this.fetchCellOrCreateEmpty(address)
      this.graph.addEdge(id ?? vertex, rangeVertex)
    }
  }

  private fixRangesWhenAddingColumns(sheet: number, column: number, numberOfColumns: number): void {
    for (const rangeVertex of this.rangeMapping.rangesInSheet(sheet)) {
      if (rangeVertex.range.includesColumn(column + numberOfColumns)) {
        let subrange
        if (rangeVertex.bruteForce) {
          subrange = rangeVertex.range.rangeWithSameHeight(column, numberOfColumns)
        } else {
          subrange = AbsoluteCellRange.spanFrom(simpleCellAddress(sheet, column, rangeVertex.range.end.row), numberOfColumns, 1)
        }
        for (const address of subrange.addresses(this)) {
          const { vertex, id } = this.fetchCellOrCreateEmpty(address)
          this.graph.addEdge(id ?? vertex, rangeVertex)
        }
      }
    }
  }

  private exchangeOrAddFormulaVertex(vertex: FormulaVertex): void {
    const address = vertex.getAddress(this.lazilyTransformingAstService)
    const range = AbsoluteCellRange.spanFrom(address, vertex.width, vertex.height)
    const oldNode = this.shrinkPossibleArrayAndGetCell(address)
    if (vertex instanceof ArrayVertex) {
      this.setArray(range, vertex)
    }
    this.exchangeOrAddGraphNode(oldNode, vertex)
    this.addressMapping.setCell(address, vertex)

    if (vertex instanceof ArrayVertex) {
      if (!this.isThereSpaceForArray(vertex)) {
        return
      }
      for (const cellAddress of range.addresses(this)) {
        if (vertex.isLeftCorner(cellAddress)) {
          continue
        }
        const old = this.getCell(cellAddress)
        this.exchangeOrAddGraphNode(old, vertex)
      }
    }

    for (const cellAddress of range.addresses(this)) {
      this.addressMapping.setCell(cellAddress, vertex)
    }
  }

  private setAddressMappingForArrayVertex(vertex: CellVertex, formulaAddress: SimpleCellAddress): void {
    this.addressMapping.setCell(formulaAddress, vertex)

    if (!(vertex instanceof ArrayVertex)) {
      return
    }

    const range = AbsoluteCellRange.spanFromOrUndef(formulaAddress, vertex.width, vertex.height)
    if (range === undefined) {
      return
    }
    this.setArray(range, vertex)

    if (!this.isThereSpaceForArray(vertex)) {
      return
    }

    for (const address of range.addresses(this)) {
      this.addressMapping.setCell(address, vertex)
    }
  }

  private truncateRanges(span: Span, coordinate: (address: SimpleCellAddress) => number): RangeVertex[] {
    const {
      verticesToRemove,
      verticesToMerge,
      verticesWithChangedSize
    } = this.rangeMapping.truncateRanges(span, coordinate)
    for (const [existingVertex, mergedVertex] of verticesToMerge) {
      this.mergeRangeVertices(existingVertex, mergedVertex)
    }
    for (const rangeVertex of verticesToRemove) {
      this.removeVertexAndCleanupDependencies(rangeVertex)
    }
    return verticesWithChangedSize
  }

  private fixArraysAfterAddingRow(sheet: number, rowStart: number, numberOfRows: number) {
    this.arrayMapping.moveArrayVerticesAfterRowByRows(sheet, rowStart, numberOfRows)
    if (rowStart <= 0) {
      return
    }
    for (const [, array] of this.arrayMapping.arraysInRows(RowsSpan.fromRowStartAndEnd(sheet, rowStart - 1, rowStart - 1))) {
      const arrayRange = array.getRange()
      for (let col = arrayRange.start.col; col <= arrayRange.end.col; ++col) {
        for (let row = rowStart; row <= arrayRange.end.row; ++row) {
          const destination = simpleCellAddress(sheet, col, row)
          const source = simpleCellAddress(sheet, col, row + numberOfRows)
          const value = array.getArrayCellValue(destination)
          this.addressMapping.moveCell(source, destination)
          this.changes.addChange(EmptyValue, source, value)
        }
      }
    }
  }

  private fixArraysAfterRemovingRows(sheet: number, rowStart: number, numberOfRows: number) {
    this.arrayMapping.moveArrayVerticesAfterRowByRows(sheet, rowStart, -numberOfRows)
    if (rowStart <= 0) {
      return
    }
    for (const [, array] of this.arrayMapping.arraysInRows(RowsSpan.fromRowStartAndEnd(sheet, rowStart - 1, rowStart - 1))) {
      if (this.isThereSpaceForArray(array)) {
        for (const address of array.getRange().addresses(this)) {
          this.addressMapping.setCell(address, array)
        }
      } else {
        this.setNoSpaceIfArray(array)
      }
    }
  }

  private fixArraysAfterAddingColumn(sheet: number, columnStart: number, numberOfColumns: number) {
    this.arrayMapping.moveArrayVerticesAfterColumnByColumns(sheet, columnStart, numberOfColumns)
    if (columnStart <= 0) {
      return
    }
    for (const [, array] of this.arrayMapping.arraysInCols(ColumnsSpan.fromColumnStartAndEnd(sheet, columnStart - 1, columnStart - 1))) {
      const arrayRange = array.getRange()
      for (let row = arrayRange.start.row; row <= arrayRange.end.row; ++row) {
        for (let col = columnStart; col <= arrayRange.end.col; ++col) {
          const destination = simpleCellAddress(sheet, col, row)
          const source = simpleCellAddress(sheet, col + numberOfColumns, row)
          const value = array.getArrayCellValue(destination)
          this.addressMapping.moveCell(source, destination)
          this.changes.addChange(EmptyValue, source, value)
        }
      }
    }
  }

  private fixArraysAfterRemovingColumns(sheet: number, columnStart: number, numberOfColumns: number) {
    this.arrayMapping.moveArrayVerticesAfterColumnByColumns(sheet, columnStart, -numberOfColumns)
    if (columnStart <= 0) {
      return
    }
    for (const [, array] of this.arrayMapping.arraysInCols(ColumnsSpan.fromColumnStartAndEnd(sheet, columnStart - 1, columnStart - 1))) {
      if (this.isThereSpaceForArray(array)) {
        for (const address of array.getRange().addresses(this)) {
          this.addressMapping.setCell(address, array)
        }
      } else {
        this.setNoSpaceIfArray(array)
      }
    }
  }

  private shrinkPossibleArrayAndGetCell(address: SimpleCellAddress): Maybe<CellVertex> {
    const vertex = this.getCell(address)
    if (!(vertex instanceof ArrayVertex)) {
      return vertex
    }
    this.setNoSpaceIfArray(vertex)
    return this.getCell(address)
  }

  private setNoSpaceIfArray(vertex: Maybe<Vertex>) {
    if (vertex instanceof ArrayVertex) {
      this.shrinkArrayToCorner(vertex)
      vertex.setNoSpace()
    }
  }

  private removeVertex(vertex: Vertex) {
    this.removeVertexAndCleanupDependencies(vertex)
    if (vertex instanceof RangeVertex) {
      this.rangeMapping.removeRange(vertex)
    }
  }

  private mergeRangeVertices(existingVertex: RangeVertex, newVertex: RangeVertex) {
    const adjNodesStored = this.graph.adjacentNodes(newVertex)

    this.removeVertexAndCleanupDependencies(newVertex)
    this.graph.removeEdgeIfExists(existingVertex, newVertex)
    adjNodesStored.forEach((adjacentNode) => {
      if (this.graph.hasNode(adjacentNode)) {
        this.graph.addEdge(existingVertex, adjacentNode)
      }
    })
  }

  private removeVertexAndCleanupDependencies(inputVertex: Vertex) {
    const dependencies = new Set(this.graph.removeNode(inputVertex))
    while (dependencies.size > 0) {
      const dependency = dependencies.values().next().value
      dependencies.delete(dependency)
      const [address, vertex] = dependency
      if (this.graph.hasNode(vertex) && this.graph.adjacentNodesCount(vertex) === 0) {
        if (vertex instanceof RangeVertex || vertex instanceof EmptyCellVertex) {
          this.graph.removeNode(vertex).forEach((candidate) => dependencies.add(candidate))
        }
        if (vertex instanceof RangeVertex) {
          this.rangeMapping.removeRange(vertex)
        } else if (vertex instanceof EmptyCellVertex) {
          this.addressMapping.removeCell(address)
        }
      }
    }
  }
}

export interface ArrayAffectingGraphChangeResult {
  affectedArrays: Set<ArrayVertex>,
}

export interface EagerChangesGraphChangeResult extends ArrayAffectingGraphChangeResult {
  contentChanges: ContentChanges,
}
