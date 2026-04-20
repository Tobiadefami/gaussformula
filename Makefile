typecheck: ## Typecheck the code
	@pnpm run verify:typings

setup: ## Setup project
	@pnpm install

compile: ## Compile to javascript
	@pnpm run compile

test: ## Run tests
	@pnpm run test

unit: ## Run unit tests
	@pnpm run test:unit

test-ci: ## Separate test configuration for CI environment
	@pnpm run test

check: typecheck test ## Check whether code is working correctly (types + specs)

full: check lint-fix ## Check whether code is ready to commit (types + specs + lint)

lint: ## Show linting errors
	@pnpm run lint

lint-fix: ## Fix linting errors
	@pnpm run lint:fix

coverage: ## Run tests and show coverage
	@pnpm run test:coverage

doc: ## Generate documentation
	@pnpm run typedoc:build

servedoc: ## Run server with documentation
	@pnpm run typedoc:serve

clean: ## Clean compiled files
	@pnpm run clean

bundle:
	@pnpm run bundle-all

bundle-es: compile ## Transpiles files to ES
	@pnpm run bundle:es

bundle-commonjs: compile ## Transpiles files to CommonJS
	@pnpm run bundle:cjs

bundle-development: compile ## Transpiles and bundles files to UMD format (without minification)
	@pnpm run bundle:development

bundle-production: compile ## Transpiles and bundles files to UMD format (with minification)
	@pnpm run bundle:production

bundle-typings: ## Generates TypeScript declaration files
	@pnpm run bundle:typings

check-bundle:
	@pnpm run verify-bundles

verify-production-licenses:
	@pnpm run check:licenses

help: ## Show all make commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: test coverage benchmark doc servedoc

.DEFAULT_GOAL := help
