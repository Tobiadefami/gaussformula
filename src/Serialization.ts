/**
 * @license
 * Copyright (c) 2025 Handsoncode. All rights reserved.
 */

import {
  ArrayVertex,
  DependencyGraph,
  FormulaCellVertex,
  ParsingErrorVertex,
} from "./DependencyGraph";
import { CellError, ErrorType } from "./Cell";
import {
  ConfidenceIntervalNumber,
  EmptyValue,
  GaussianNumber,
  InterpreterValue,
  RawInterpreterValue,
  SampledDistribution,
  getRawValue as getInterpreterRawValue,
} from "./interpreter/InterpreterValue";
import { NamedExpressionOptions, NamedExpressions } from "./NamedExpressions";
import { ProcedureAst, Unparser, buildLexerConfig } from "./parser";
import { SimpleCellAddress, simpleCellAddress } from "./Cell";

import { AbsoluteCellRange } from "./AbsoluteCellRange";
import { CellValue } from "./CellValue";
import { Config } from "./Config";
import { ErrorMessage } from "./error-message";
import { Exporter } from "./Exporter";
import { Maybe } from "./Maybe";
import { RawCellContent } from "./CellContentParser";
import { SheetIndexMappingFn } from "./parser/addressRepresentationConverters";

export interface SerializedNamedExpression {
  name: string;
  expression: RawCellContent;
  scope?: number;
  options?: NamedExpressionOptions;
}

export class Serialization {
  constructor(
    private readonly dependencyGraph: DependencyGraph,
    private readonly unparser: Unparser,
    private readonly exporter: Exporter,
    private readonly config: Config
  ) {}

  public getCellHyperlink(address: SimpleCellAddress): Maybe<string> {
    const formulaVertex = this.dependencyGraph.getCell(address);
    if (formulaVertex instanceof FormulaCellVertex) {
      const formula = formulaVertex.getFormula(
        this.dependencyGraph.lazilyTransformingAstService
      ) as ProcedureAst;
      if ("HYPERLINK" === formula.procedureName) {
        return formula.hyperlink;
      }
    }
    return undefined;
  }

  public getCellFormula(
    address: SimpleCellAddress,
    targetAddress?: SimpleCellAddress
  ): Maybe<string> {
    const formulaVertex = this.dependencyGraph.getCell(address);
    if (formulaVertex instanceof FormulaCellVertex) {
      const formula = formulaVertex.getFormula(
        this.dependencyGraph.lazilyTransformingAstService
      );
      targetAddress = targetAddress ?? address;
      return this.unparser.unparse(formula, targetAddress);
    } else if (formulaVertex instanceof ArrayVertex) {
      const arrayVertexAddress = formulaVertex.getAddress(
        this.dependencyGraph.lazilyTransformingAstService
      );
      if (
        arrayVertexAddress.row !== address.row ||
        arrayVertexAddress.col !== address.col ||
        arrayVertexAddress.sheet !== address.sheet
      ) {
        return undefined;
      }
      targetAddress = targetAddress ?? address;
      const formula = formulaVertex.getFormula(
        this.dependencyGraph.lazilyTransformingAstService
      );
      if (formula !== undefined) {
        return this.unparser.unparse(formula, targetAddress);
      }
    } else if (formulaVertex instanceof ParsingErrorVertex) {
      return formulaVertex.getFormula();
    }
    return undefined;
  }

  public getCellSerialized(
    address: SimpleCellAddress,
    targetAddress?: SimpleCellAddress
  ): RawCellContent {
    return (
      this.getCellFormula(address, targetAddress) ?? this.getRawValue(address)
    );
  }

  public getCellValue(address: SimpleCellAddress): CellValue {
    return this.exporter.exportValue(
      this.dependencyGraph.getScalarValue(address)
    );
  }

  public getRawValue(address: SimpleCellAddress): RawCellContent {
    const value = this.dependencyGraph.getScalarValue(address);
    if (value === EmptyValue) {
      return null;
    } else if (value instanceof GaussianNumber) {
      return `N(μ=${value.mean.toFixed(2)}, σ²=${value.variance.toFixed(2)})`;
    } else if (value instanceof SampledDistribution) {
      const mean = value.getMean();
      const variance = value.getVariance();
      return `S(μ=${mean.toFixed(2)}, σ²=${variance.toFixed(2)})`;
    } else if (value instanceof CellError) {
      return this.config.translationPackage.getErrorTranslation(value.type);
    } else if (value instanceof ConfidenceIntervalNumber) {
      return `CI[${value.getLower().toFixed(2)}, ${value.getUpper().toFixed(2)}]`;
    } else {
      return getInterpreterRawValue(value);
    }
  }

  public getSheetValues(sheet: number): CellValue[][] {
    return this.genericSheetGetter(sheet, (arg) => this.getCellValue(arg));
  }

  public getSheetFormulas(sheet: number): Maybe<string>[][] {
    return this.genericSheetGetter(sheet, (arg) => this.getCellFormula(arg));
  }

  public genericSheetGetter<T>(
    sheet: number,
    getter: (address: SimpleCellAddress) => T
  ): T[][] {
    const sheetHeight = this.dependencyGraph.getSheetHeight(sheet);
    const sheetWidth = this.dependencyGraph.getSheetWidth(sheet);

    const arr: T[][] = new Array(sheetHeight);
    for (let i = 0; i < sheetHeight; i++) {
      arr[i] = new Array(sheetWidth);

      for (let j = 0; j < sheetWidth; j++) {
        const address = simpleCellAddress(sheet, j, i);
        arr[i][j] = getter(address);
      }
      for (let j = sheetWidth - 1; j >= 0; j--) {
        if (arr[i][j] === null || arr[i][j] === undefined) {
          arr[i].pop();
        } else {
          break;
        }
      }
    }

    for (let i = sheetHeight - 1; i >= 0; i--) {
      if (arr[i].length === 0) {
        arr.pop();
      } else {
        break;
      }
    }
    return arr;
  }

  public genericAllSheetsGetter<T>(
    sheetGetter: (sheet: number) => T
  ): Record<string, T> {
    const result: Record<string, T> = {};
    for (const sheetName of this.dependencyGraph.sheetMapping.displayNames()) {
      const sheetId = this.dependencyGraph.sheetMapping.fetch(sheetName);
      result[sheetName] = sheetGetter(sheetId);
    }
    return result;
  }

  public getSheetSerialized(sheet: number): RawCellContent[][] {
    return this.genericSheetGetter(sheet, (arg) => this.getCellSerialized(arg));
  }

  public getAllSheetsValues(): Record<string, CellValue[][]> {
    return this.genericAllSheetsGetter((arg) => this.getSheetValues(arg));
  }

  public getAllSheetsFormulas(): Record<string, Maybe<string>[][]> {
    return this.genericAllSheetsGetter((arg) => this.getSheetFormulas(arg));
  }

  public getAllSheetsSerialized(): Record<string, RawCellContent[][]> {
    return this.genericAllSheetsGetter((arg) => this.getSheetSerialized(arg));
  }

  public getAllNamedExpressionsSerialized(): SerializedNamedExpression[] {
    const idMap: number[] = [];
    let id = 0;
    for (const sheetName of this.dependencyGraph.sheetMapping.displayNames()) {
      const sheetId = this.dependencyGraph.sheetMapping.fetch(sheetName);
      idMap[sheetId] = id;
      id++;
    }
    return this.dependencyGraph.namedExpressions
      .getAllNamedExpressions()
      .map((entry) => {
        return {
          name: entry.expression.displayName,
          expression: this.getCellSerialized(entry.expression.address),
          scope: entry.scope !== undefined ? idMap[entry.scope] : undefined,
          options: entry.expression.options,
        };
      });
  }

  public withNewConfig(
    newConfig: Config,
    namedExpressions: NamedExpressions
  ): Serialization {
    const newUnparser = new Unparser(
      newConfig,
      buildLexerConfig(newConfig),
      this.dependencyGraph.sheetMapping.fetchDisplayName,
      namedExpressions
    );
    return new Serialization(
      this.dependencyGraph,
      newUnparser,
      this.exporter,
      newConfig
    );
  }
}
