#!/usr/bin/env node

/**
 * 说明：该脚本已退役，只保留明确的失败提示，把维护者引导到当前受支持的 live-safe 流程。
 */
import process from "node:process";

// 说明：统一输出退役原因与替代命令，然后立即以非零状态退出。
function main() {
  console.error("scripts/copy-to-vault.mjs has been retired.");
  console.error("Use the live-safe workflow instead:");
  console.error("1. npm run obsidian:test-vault:link");
  console.error("2. npm run obsidian:test-vault");
  process.exit(1);
}

main();
