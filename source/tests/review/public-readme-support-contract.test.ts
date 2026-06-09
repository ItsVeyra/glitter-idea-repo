/**
 * 锁定 public README 的支持入口区块，避免源码仓与 public 展示页再次漂移。
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const SUPPORT_PAYPAL_URL = "https://paypal.me/ItsVeyraYu";
const SUPPORT_ALIPAY_HREF = "assets/images/support-alipay-qr.png";
const EXPECTED_PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;
const WORKTREE_SEGMENT = `${sep}.worktrees${sep}`;

function resolveSourceRepoRoot(cwd: string): string {
  const worktreeIndex = cwd.indexOf(WORKTREE_SEGMENT);
  if (worktreeIndex >= 0) {
    return cwd.slice(0, worktreeIndex);
  }

  return cwd;
}

function resolvePublicRepoRoot(): string {
  return resolve(resolveSourceRepoRoot(process.cwd()), "../glitter-plugin-public-repo");
}

function readPublicReadme(): string {
  return readFileSync(resolve(resolvePublicRepoRoot(), "README.md"), "utf8");
}

function shouldRunPublicReadmeContract(
  env: Partial<Record<"GLITTER_VERIFY_PUBLIC_REPO", string | undefined>> = process.env
): boolean {
  return env.GLITTER_VERIFY_PUBLIC_REPO === "1";
}

describe("public README support contract", () => {
  it("keeps public repo verification opt-in outside explicit contract runs", () => {
    expect(shouldRunPublicReadmeContract({})).toBe(false);
    expect(shouldRunPublicReadmeContract({ GLITTER_VERIFY_PUBLIC_REPO: "1" })).toBe(true);
  });
});

const describePublicReadmeContract = shouldRunPublicReadmeContract() ? describe : describe.skip;

describePublicReadmeContract("public README support contract against public repo", () => {
  it("resolves the public repo paths from both repo-root and nested worktree layouts", () => {
    const publicRepoRoot = resolvePublicRepoRoot();

    expect(existsSync(resolve(publicRepoRoot, "README.md"))).toBe(true);
    expect(existsSync(resolve(publicRepoRoot, SUPPORT_ALIPAY_HREF))).toBe(true);
  });

  it("keeps the public Alipay QR asset as a real PNG file", () => {
    const qrBytes = readFileSync(resolve(resolvePublicRepoRoot(), SUPPORT_ALIPAY_HREF));

    expect(Array.from(qrBytes.subarray(0, 8))).toEqual(EXPECTED_PNG_SIGNATURE);
  });

  it("keeps one compact Support Glitter card at the end of the README", () => {
    const readme = readPublicReadme();
    const supportSectionMatch = readme.match(/## Support Glitter\s+([\s\S]*?)\s*$/u);

    expect(readme).toMatch(/## FAQ\s+[\s\S]*?## Why Use Glitter\s+[\s\S]*?## Support Glitter\s+[\s\S]*$/u);
    expect(supportSectionMatch?.[1].trim()).toBe(`<div align="center">

<table>
  <tr>
    <td align="center">
      <sub>SUPPORT GLITTER</sub><br />
      <strong>If Glitter has been useful in your workflow, you can support its ongoing development.</strong><br />
      <sub>
        <a href="${SUPPORT_PAYPAL_URL}">International · PayPal.me</a>
        |
        <a href="${SUPPORT_ALIPAY_HREF}">中国大陆 · Alipay QR</a>
      </sub>
    </td>
  </tr>
</table>

</div>`);
  });
});
