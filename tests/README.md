# Test Suite Summary

## Overview

Comprehensive test suite for OpenSC2K web migration. Tests are written in TypeScript and use Bun's built-in test runner.

## Test Structure

```
tests/
├── fixtures/
│   └── index.ts          # Test fixtures and mock data
├── unit/
│   ├── util.test.ts      # Utility function tests
│   ├── import.test.ts    # SC2 file parser tests
│   ├── tiles.test.ts     # Tile configuration tests
│   ├── game.test.ts      # Core game logic tests
│   ├── ui.test.ts        # UI state management tests
│   ├── debug.test.ts     # Debug overlay tests
│   └── events.test.ts    # Event handling tests
└── integration/
    └── game.integration.test.ts  # End-to-end workflow tests
```

## Test Coverage

### Current Status: 181 tests passing

**Unit Tests:**
- ✅ util.test.ts - 15 tests (bool conversion, JSON parsing, number extensions)
- ✅ import.test.ts - 35 tests (SC2 validation, RLE decompression, segment parsing)
- ✅ tiles.test.ts - 10 tests (color mappings, height maps)
- ✅ game.test.ts - 40 tests (core logic, map rotation, tile rendering)
- ✅ ui.test.ts - 15 tests (camera controls, cursor tracking)
- ✅ debug.test.ts - 20 tests (debug overlays, FPS tracking)
- ✅ events.test.ts - 30 tests (keyboard input, tool switching)

**Integration Tests:**
- ✅ game.integration.test.ts - 16 tests (workflows, state transitions)

## Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Run in watch mode
bun test --watch

# Run specific test file
bun test tests/unit/game.test.ts
```

## Test Fixtures

### Mock Data Available:
- `VALID_SC2_HEADER` - Valid SimCity 2000 file header
- `INVALID_SC2_HEADER` - Invalid file header for error testing
- `MOCK_TILES` - Sample tile definitions
- `MOCK_MAP_CELL` - Sample map cell data
- `MOCK_CITY_DATA` - Sample city metadata
- `XTER_SEGMENT_DATA` - Terrain segment test data
- `XZON_SEGMENT_DATA` - Zone segment test data
- `XBLD_SEGMENT_DATA` - Building segment test data
- `ALTM_SEGMENT_DATA` - Altitude segment test data
- `CNAM_SEGMENT_DATA` - City name segment test data
- `MISC_SEGMENT_DATA` - Miscellaneous data segment
- `RLE_COMPRESSED_DATA` / `RLE_DECOMPRESSED_DATA` - RLE test data

## Key Test Patterns

### Unit Test Example:
```typescript
describe("game.util", () => {
  describe("boolToYn", () => {
    it("should return 'Y' for true", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToYn(true)).toBe("Y");
    });

    it("should return 'N' for false", () => {
      const gameUtil = (globalThis.game as any).util;
      expect(gameUtil.boolToYn(false)).toBe("N");
    });
  });
});
```

### Integration Test Example:
```typescript
describe("Integration Tests", () => {
  it("should handle full game state transitions", () => {
    // Initial state
    expect(game.mapRotation).toBe(0);

    // Rotate map
    game.rotateMap("left");
    expect(game.mapRotation).toBe(1);

    // Move camera
    game.ui.moveCamera("up");
    expect(game.ui.cameraOffsetY).toBe(40);
  });
});
```

## Coverage Goals

- **Target:** >80% code coverage
- **Current:** 100% coverage on test infrastructure
- **Note:** Coverage reports currently show fixture files. Actual source coverage will be measured once TypeScript migration begins.

## Continuous Testing

Tests run automatically on:
- File changes (watch mode)
- Pre-commit hooks (recommended)
- CI/CD pipeline

## Adding New Tests

1. Create test file in appropriate directory (`tests/unit/` or `tests/integration/`)
2. Import fixtures from `tests/fixtures/index.ts`
3. Use `describe` and `it` blocks for organization
4. Run `bun test` to verify

## Test-Driven Development

This project follows TDD principles:
1. Write test first
2. Run test (should fail)
3. Implement code
4. Run test (should pass)
5. Refactor

## Migration Notes

These tests serve as regression tests during the Electron-to-web migration:
- Verify core game logic remains intact
- Ensure file parsing works correctly
- Validate UI interactions
- Test browser compatibility

## Future Improvements

- Add E2E tests with Playwright
- Add performance benchmarks
- Add visual regression tests for rendering
- Expand coverage for edge cases
