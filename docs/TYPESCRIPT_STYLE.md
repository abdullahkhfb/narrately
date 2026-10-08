# TypeScript Style

Narrately follows the uploaded Google TypeScript Style Guide as its TypeScript reference.

The project applies these rules to handwritten TypeScript:

- UTF-8 source files.
- `const` by default and `let` only for reassignment.
- One local declaration per statement.
- Named exports instead of default exports.
- `import type` for type-only imports.
- Relative imports for project-local modules.
- `camelCase` for variables, parameters, functions, and properties.
- `PascalCase` for interfaces and classes.
- `SCREAMING_SNAKE_CASE` for module constants.
- Interfaces for object-shaped public APIs where appropriate.
- `unknown` instead of `any` for untrusted values.
- Braces for normal control-flow blocks.
- Strict equality checks.
- Runtime checks before type narrowing where practical.
- Short JSDoc for exported APIs.
- Comments only where they add useful context.

Generated WASM bindings and tool configuration are treated as integration boundaries and are not rewritten solely for style.
