#!/usr/bin/env tsx
/**
 * Thin wrapper — delegates to @ludiars/env-cli
 *
 * Usage:
 *   npm run secrets -- setup / test / get / list / set / env
 *
 * 設定は env-cli.config.ts で定義。
 */
import "../packages/env-cli/src/cli.js";
