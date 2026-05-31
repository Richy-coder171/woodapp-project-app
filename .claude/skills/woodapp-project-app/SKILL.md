```markdown
# woodapp-project-app Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill introduces the core development patterns and conventions used in the `woodapp-project-app` JavaScript codebase. It covers file naming, import/export styles, commit message habits, and testing patterns. While no major frameworks or automated workflows are detected, this guide will help you contribute code that fits seamlessly with the existing project structure.

## Coding Conventions

### File Naming
- **Pattern:** PascalCase  
  Each file name starts with an uppercase letter and uses uppercase letters to separate words.
  - **Example:**  
    `UserProfile.js`  
    `WoodAppMain.js`

### Import Style
- **Pattern:** Relative imports  
  Modules are imported using relative paths.
  - **Example:**  
    ```javascript
    import { fetchData } from './ApiService';
    ```

### Export Style
- **Pattern:** Named exports  
  Functions, objects, or classes are exported by name.
  - **Example:**  
    ```javascript
    // In ApiService.js
    export function fetchData() { ... }
    ```

### Commit Message Patterns
- **Type:** Freeform, no strict prefixes  
- **Average Length:** ~18 characters  
  - **Example:**  
    `add login feature`  
    `fix bug in signup`

## Workflows

### Adding a New Module
**Trigger:** When you need to add a new feature or component  
**Command:** `/add-module`

1. Create a new file using PascalCase (e.g., `NewFeature.js`).
2. Write your code using named exports.
3. Import dependencies using relative paths.
4. Add a corresponding test file (see Testing Patterns).
5. Commit your changes with a concise, descriptive message.

### Refactoring Existing Code
**Trigger:** When improving or restructuring code  
**Command:** `/refactor`

1. Identify the file(s) to refactor.
2. Maintain PascalCase naming for any new or renamed files.
3. Use named exports and relative imports.
4. Update or add tests as needed.
5. Commit with a message describing the refactor.

### Writing and Running Tests
**Trigger:** When adding or updating tests  
**Command:** `/test`

1. Create or update test files with the `.test.` infix (e.g., `UserProfile.test.js`).
2. Write tests for your modules or components.
3. Use the project's preferred test runner (framework unknown; check project documentation or package.json).
4. Run tests to ensure correctness.
5. Commit with a message like `add tests for UserProfile`.

## Testing Patterns

- **File Pattern:** Test files include `.test.` in their names (e.g., `SomeModule.test.js`).
- **Framework:** Not explicitly detected; check project dependencies for specifics.
- **Example:**
  ```javascript
  // UserProfile.test.js
  import { getUserName } from './UserProfile';

  test('returns correct user name', () => {
    expect(getUserName({ name: 'Alice' })).toBe('Alice');
  });
  ```

## Commands

| Command        | Purpose                                 |
|----------------|-----------------------------------------|
| /add-module    | Add a new module/component              |
| /refactor      | Refactor existing code                  |
| /test          | Write and run tests                     |
```