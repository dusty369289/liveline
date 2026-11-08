// The workflows build and publish what every phone installs, so they're checked like code: each one parses (strictly:
// a duplicated key is an error, not a silent overwrite), and the rules that keep releases safe are pinned here.
// CI also runs actionlint over them (ci.yml, Checks), which knows GitHub's own schema and runs shellcheck.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const DIR = new URL("../.github/workflows/", import.meta.url);
const load = (name: string) => parse(readFileSync(new URL(name, DIR), "utf8"), { uniqueKeys: true, strict: true });
const fixture = (name: string) => readFileSync(new URL(`fixtures/release/${name}`, import.meta.url), "utf8");

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, string> };
type Job = { permissions?: Record<string, string>; needs?: string | string[]; env?: Record<string, string>; steps?: Step[] };
const release = load("release.yml") as { permissions: Record<string, string>; jobs: Record<string, Job> };
const { apk, sign } = release.jobs;
const step = (job: Job, name: string) => {
  const found = job.steps?.find((s) => s.name === name);
  if (!found) throw new Error(`no step "${name}"`);
  return found;
};

// Saved `apksigner verify --print-certs` of the published v0.1.0 APK (every release since has the same signer), and
// the first lines of `aapt2 dump badging` of v0.4.0.
const CERTS = fixture("apksigner-v0.1.0.txt");
const BADGING = fixture("aapt2-badging-v0.4.0.txt");

/** Run the sign job's check step as GitHub would (bash -e, pipefail) over the given tool outputs. */
function checkApk(version: string, certs = CERTS, badging = BADGING) {
  const dir = mkdtempSync(join(tmpdir(), "apk-check-"));
  try {
    writeFileSync(join(dir, "apk-certs.txt"), certs);
    writeFileSync(join(dir, "apk-badging.txt"), badging);
    const run = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", "-c", step(sign, "Check the signer and version").run!], {
      cwd: dir,
      encoding: "utf8",
      env: { PATH: process.env.PATH, VERSION: version, SIGNER_SHA256: sign.env!.SIGNER_SHA256 },
    });
    return { status: run.status, out: run.stdout + run.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("workflows", () => {
  it("every workflow parses and has jobs", () => {
    const files = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));
    expect(files.sort()).toEqual(["ci.yml", "release.yml"]);
    for (const f of files) expect(Object.keys(load(f).jobs ?? {}).length, f).toBeGreaterThan(0);
  });

  it("every action is pinned to a commit (or image digest), with its version beside it for Dependabot", () => {
    for (const f of ["ci.yml", "release.yml"]) {
      const lines = readFileSync(new URL(f, DIR), "utf8").split("\n").filter((l) => /^\s*(-\s+)?uses:/.test(l));
      expect(lines.length, f).toBeGreaterThan(0);
      for (const line of lines) {
        const ref = line.replace(/^\s*(-\s+)?uses:\s*/, "");
        if (ref.startsWith("./")) continue; // this repo's own workflow
        expect(ref, `${f}: ${line.trim()}`).toMatch(
          /^([\w.-]+\/[\w.-]+(\/[\w.-]+)*@[0-9a-f]{40} # v\d+\.\d+\.\d+|docker:\/\/[\w./-]+@sha256:[0-9a-f]{64} # \d+\.\d+\.\d+)$/);
      }
    }
  });

  it("CI checks the workflows themselves with actionlint", () => {
    const steps: Step[] = load("ci.yml").jobs.checks.steps;
    expect(steps.some((s) => s.uses?.startsWith("docker://rhysd/actionlint@"))).toBe(true);
  });

  it("fetches Gradle with retries before any build, so one slow download doesn't fail CI or a release", () => {
    // Seen twice on 2026-11-08: a 504 from GitHub, then a 10 s timeout from services.gradle.org, each failing Checks
    for (const [file, job, build] of [["ci.yml", "checks", "npm run android:test"], ["release.yml", "apk", "Build"]] as const) {
      const steps: Step[] = load(file).jobs[job].steps;
      const fetch = steps.findIndex((s) => s.name === "Fetch Gradle");
      const built = steps.findIndex((s) => s.run === build || s.name === build);
      expect(fetch, `${file}: a Fetch Gradle step`).toBeGreaterThanOrEqual(0);
      expect(fetch, `${file}: Fetch Gradle comes before the build`).toBeLessThan(built);
      expect(steps[fetch].run, file).toMatch(/for attempt in 1 2 3/);
    }
    const props = readFileSync("android/gradle/wrapper/gradle-wrapper.properties", "utf8");
    expect(Number(props.match(/^networkTimeout=(\d+)$/m)?.[1])).toBeGreaterThanOrEqual(60_000);
  });

  it("CI cancels only an older run of the same PR, never a release's tests or a run by hand", () => {
    const { concurrency } = load("ci.yml");
    // Called from release.yml, github.workflow is "Release": its tests get a group of their own.
    expect(concurrency.group).toContain("${{ github.workflow }}");
    expect(concurrency.group).toContain("${{ github.event_name }}");
    expect(concurrency["cancel-in-progress"]).toBe("${{ github.event_name == 'pull_request' }}");
  });
});

describe("dependabot", () => {
  it("watches npm, Gradle and the actions monthly, after a week's cooldown", () => {
    const config = parse(readFileSync(new URL("../.github/dependabot.yml", import.meta.url), "utf8"), { uniqueKeys: true });
    expect(config.version).toBe(2);
    const updates = config.updates as { "package-ecosystem": string; directory: string; schedule: { interval: string };
      cooldown?: { "default-days"?: number }; groups?: Record<string, unknown> }[];
    expect(updates.map((u) => `${u["package-ecosystem"]} ${u.directory}`).sort())
      .toEqual(["github-actions /", "gradle /android", "npm /"]);
    for (const u of updates) {
      expect(u.schedule.interval, u["package-ecosystem"]).toBe("monthly");
      expect(u.cooldown?.["default-days"], u["package-ecosystem"]).toBe(7);
    }
    const npm = updates.find((u) => u["package-ecosystem"] === "npm")!;
    expect(npm.groups).toEqual({
      capacitor: { patterns: ["@capacitor/*"] },
      dev: { "dependency-type": "development" },
    });
  });
});

describe("release", () => {
  it("builds unsigned, with no secrets and no install scripts, where npm and Gradle run", () => {
    const text = JSON.stringify(apk);
    expect(text).not.toContain("secrets.");
    expect(text).not.toContain("LIVELINE_");
    expect(apk.permissions).toEqual({ contents: "read" });
    for (const s of apk.steps ?? []) {
      for (const line of (s.run ?? "").split("\n")) {
        if (/\bnpm (ci|install|version)\b/.test(line)) expect(line, s.name).toContain("--ignore-scripts");
      }
    }
  });

  it("signs in a job of its own that runs nothing from the repo, npm or Gradle", () => {
    expect([sign.needs].flat()).toContain("apk");
    for (const s of sign.steps ?? []) {
      expect(s.uses ?? "", s.name).not.toMatch(/actions\/checkout|setup-node/);
      expect(s.run ?? "", s.name).not.toMatch(/\b(npm|npx|node|gradlew?)\b|\.sh\b/);
    }
  });

  it("only the sign job can write to the repository", () => {
    expect(release.permissions).toEqual({ contents: "read" });
    for (const [name, job] of Object.entries(release.jobs)) {
      if (name !== "sign") expect(job.permissions?.contents ?? "read", name).not.toBe("write");
    }
    expect(sign.permissions).toEqual({ contents: "write" });
  });

  it("the key's certificate is pinned, in full", () => {
    expect(sign.env!.SIGNER_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(CERTS).toContain(`Signer #1 certificate SHA-256 digest: ${sign.env!.SIGNER_SHA256}\n`);
  });

  it("passes an APK signed by the release key, as this version", () => {
    const run = checkApk("0.4.0");
    expect(run.out).not.toContain("::error::");
    expect(run.status).toBe(0);
  });

  it("refuses an APK signed by another key, or by a second one too", () => {
    const other = CERTS.replace(/digest: f5d3/, "digest: 0000");
    expect(checkApk("0.4.0", other).out).toMatch(/::error::.*isn't signed with the release key/);
    const second = `${CERTS}Signer #2 certificate DN: CN=Someone\nSigner #2 certificate SHA-256 digest: ${"ab".repeat(32)}\n`;
    expect(checkApk("0.4.0", second).out).toMatch(/::error::.*more than one signer/);
    expect(checkApk("0.4.0", "").status).not.toBe(0);
  });

  it("refuses an APK of another version, versionCode or app", () => {
    expect(checkApk("0.4.1").out).toMatch(/::error::.*isn't dev\.liveline\.app 0\.4\.1 \(versionCode 401\)/);
    expect(checkApk("0.4.0", CERTS, BADGING.replace("versionCode='400'", "versionCode='4'")).status).not.toBe(0);
    expect(checkApk("0.4.0", CERTS, BADGING.replace("name='dev.liveline.app'", "name='dev.other'")).status).not.toBe(0);
  });
});
