<br>
<p align="center">
  <img src="assets/gaussformula.png" width="350" alt="GaussFormula Logo"/>
</p>

<p align="center">
  <strong>GaussFormula: Spreadsheet Engine with Uncertainty Support</strong>
</p>

---

## About GaussFormula

**GaussFormula** is a headless spreadsheet engine for JavaScript and TypeScript, designed for business and scientific web applications. It is a fork of HyperFormula with native support for uncertainty through explicit probability distributions such as `N(mean, variance)`, `LN(mu, sigma)`, `U(min, max)`, `N.CI(lower, upper[, confidence])`, and `LN.CI(lower, upper[, confidence])`.

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
- **Native support for uncertainty**: work with explicit probability distributions and propagate uncertainty through sampled calculations
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

// Add a sheet and enter an explicit uncertainty input
const sheetName = gf.addSheet('Demo');
const sheetId = gf.getSheetId(sheetName);

gf.setCellContents({ sheet: sheetId, row: 0, col: 0 }, [['N.CI(1, 2)', '3', '=A1+B1', '=A1*B1']]);

console.log(gf.getCellValue({ sheet: sheetId, row: 0, col: 2 })); // SampledDistribution
console.log(gf.getCellValue({ sheet: sheetId, row: 0, col: 3 })); // SampledDistribution
```

---

## What’s Unique: Distribution Support

GaussFormula extends HyperFormula with first-class support for explicit uncertainty inputs. Distribution inputs are parsed, stored, and propagated through arithmetic using Monte Carlo sampling.

### Distribution notation

- `N(mean, variance)` uses normal-distribution parameters directly.
- `LN(mu, sigma)` uses log-space parameters: if `X ~ LN(mu, sigma)`, then `ln(X) ~ N(mu, sigma^2)`. `mu` and `sigma` are not the mean and standard deviation of `X`.
- Prefer `LN.CI(lower, upper[, confidence])` for user-facing lognormal inputs because the bounds are in the original value scale.
- `N.CI(lower, upper[, confidence])` derives a normal distribution from a value-scale confidence interval.
- `U(min, max)` represents a uniform range on the original value scale.

**Example:**

- `A1 -> N.CI(1, 2)`
- `=A1 + 3` returns a sampled distribution
- `=A1 * 3` returns a sampled distribution

## Technical Notes

GaussFormula represents explicit uncertainty inputs with `DistributionNumber` and arithmetic outputs with `SampledDistribution`. Arithmetic over distributions uses Monte Carlo sampling instead of closed-form distribution algebra.

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
