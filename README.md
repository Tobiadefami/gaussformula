<br>
<p align="center">
  <img src="assets/gaussformula.png" width="350" alt="GaussFormula Logo"/>
</p>

<p align="center">
  <strong>GaussFormula: Spreadsheet Engine with Uncertainty Support</strong>
</p>

---

## About GaussFormula

**GaussFormula** is a headless spreadsheet engine for JavaScript and TypeScript, designed for business and scientific web applications. It is a fork of HyperFormula with a major new feature: **native support for Gaussian numbers**—values with uncertainty, represented as `N(mean, variance)`.

GaussFormula is ideal for:
- Custom spreadsheet-like apps
- Scientific and engineering tools
- Business logic builders
- Educational apps
- Online calculators

---

## Key Features

- **Function syntax compatible with Microsoft Excel and Google Sheets**
- High-speed parsing and evaluation of spreadsheet formulas
- ~400 built-in functions
- **Native support for Gaussian numbers**: work with values that include uncertainty, and propagate it through calculations
- Support for custom functions
- Node.js and browser support
- Undo/redo, CRUD operations, clipboard, named expressions, data sorting
- Formula localization (17+ languages)
- GPLv3 license

---

## Installation

```bash
yarn add gaussformula
# or
npm install gaussformula
```

---

## Usage Example

```js
import { HyperFormula } from 'gaussformula';

// Create a GaussFormula instance
const gf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3' });

// Add a sheet and enter Gaussian numbers
const sheetName = gf.addSheet('Demo');
const sheetId = gf.getSheetId(sheetName);

gf.setCellContents({ sheet: sheetId, row: 0, col: 0 }, [['N(1, 2)', '3', '=A1+B1', '=A1*B1']]);

console.log(gf.getCellValue({ sheet: sheetId, row: 0, col: 2 })); // GaussianNumber { mean: 4, variance: 2 }
console.log(gf.getCellValue({ sheet: sheetId, row: 0, col: 3 })); // GaussianNumber { mean: 3, variance: 18 }
```

---

## What’s Unique: Gaussian Number Support

GaussFormula extends HyperFormula with **first-class support for Gaussian numbers**—values with uncertainty, written as `N(mean, variance)`. These numbers are parsed, stored, and propagated through arithmetic operations according to rules of error propagation.

**Example:**

- `A1 -> N(1,2)`
- `=A1 + 3` results in `N(4, 2)`
- `=A1 * 3` results in `N(3, 18)`

See the [technical documentation below](#technical-details-of-gaussian-number-support) for a deep dive into the implementation.

---

## Technical Details of Gaussian Number Support

GaussFormula introduces:
- A new `GaussianNumber` class and type system integration
- Parser and lexer changes to recognize `N(mean, variance)` syntax
- Interpreter and arithmetic logic for correct error propagation
- Serialization and export logic for Gaussian numbers
- Comprehensive tests for parsing, arithmetic, and error handling

<details>
<summary>Click to expand technical details</summary>

# Gaussian Number Support in GaussFormula

## Overview

This document provides a detailed technical analysis of the changes made to implement Gaussian number support in GaussFormula. Gaussian numbers represent values with uncertainty and are represented as `N(mean, variance)` where:
- `mean` is the central value
- `variance` is a measure of the uncertainty

| File | Changes | Purpose |
|------|---------|---------|
| `src/interpreter/InterpreterValue.ts` | Added `GaussianNumber` class and `NUMBER_GAUSSIAN` enum value | Core representation of Gaussian numbers |
| `src/parser/Ast.ts` | Added `GAUSSIAN_NUMBER` to `AstNodeType` enum and `GaussianNumberAst` interface | AST representation for parsing |
| `src/parser/FormulaParser.ts` | Added Gaussian number parsing | Recognize and parse N(mean, variance) syntax |
| `src/interpreter/Interpreter.ts` | Added case for `AstNodeType.GAUSSIAN_NUMBER` | Handle Gaussian AST nodes during evaluation |
| `src/interpreter/ArithmeticHelper.ts` | Added arithmetic operations | Implement math operations for Gaussian numbers |
| `src/Exporter.ts` | Modified `exportValue` | Export Gaussian numbers as cell values |
| `src/CellValue.ts` | Added `GaussianNumber` to types | Type system integration |
| `src/Serialization.ts` | Added formatting for Gaussian numbers | Proper string representation |
| `test/interpreter/gaussian-arithmetic.spec.ts` | Modified tests | Test Gaussian arithmetic operations |

... (full technical details as in the original documentation) ...

</details>

---

## Contributing

Contributions are welcome! Please open issues or pull requests on [GitHub](https://github.com/Tobiadefami/gaussformula).

---

## License

GaussFormula is available under the GPLv3 license.

---

## Acknowledgments

GaussFormula is a fork of the outstanding [HyperFormula](https://github.com/handsontable/hyperformula) project by Handsoncode. Huge thanks to the original authors and maintainers for their work on the core spreadsheet engine.

---
