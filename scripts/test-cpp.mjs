import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const workspace = process.env.LUDIARS_WORKSPACE ?? (process.platform === "win32" ? "E:/Document/Ars" : resolve(root, ".."));
const portus = process.env.PORTUS_SOURCE_DIR ?? join(workspace, "Portus", "cpp");
const build = mkdtempSync(join(tmpdir(), "actio-ctest-"));
const generator = process.platform === "win32" ? ["-G", "Visual Studio 18 2026", "-A", "x64"] : [];
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
try {
  let loricaOption;
  if (process.env.Lorica_DIR) {
    loricaOption = `-DLorica_DIR=${process.env.Lorica_DIR}`;
  } else {
    const source = process.env.LORICA_SOURCE_DIR ?? join(workspace, "Lorica");
    const loricaBuild = join(build, "lorica");
    const prefix = join(build, "prefix");
    run("cmake", ["-S", source, "-B", loricaBuild, ...generator, "-DLORICA_BUILD_PROTECTION=OFF",
      "-DLORICA_BUILD_CONTRACTS=OFF", "-DLORICA_BUILD_TESTS=OFF", `-DCMAKE_INSTALL_PREFIX=${prefix}`]);
    run("cmake", ["--install", loricaBuild, "--config", "Release"]);
    loricaOption = `-DCMAKE_PREFIX_PATH=${prefix}`;
  }
  const backend = join(build, "backend");
  run("cmake", ["-S", "cpp", "-B", backend, ...generator, "-DBUILD_TESTING=ON",
    "-DCMAKE_BUILD_TYPE=Release", `-DPORTUS_SOURCE_DIR=${portus}`, loricaOption]);
  run("cmake", ["--build", backend, "--config", "Release"]);
  run("ctest", ["--test-dir", backend, "-C", "Release", "--no-tests=error", "--output-on-failure"]);
} finally {
  rmSync(build, { recursive: true, force: true });
}
