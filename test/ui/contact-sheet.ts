// Playwright reporter: after a run, .ui-report/index.html shows every page's screenshot side by side per project,
// so a look change is one page to read (CI uploads it as an artifact). Rules can't judge looks; a person reads this.
import type { Reporter } from "@playwright/test/reporter";
import { existsSync, readdirSync, writeFileSync } from "node:fs";

export default class ContactSheet implements Reporter {
  onEnd(): void {
    const root = ".ui-report";
    if (!existsSync(root)) return;
    const projects = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    const shots = [...new Set(projects.flatMap((p) => readdirSync(`${root}/${p}`).filter((f) => f.endsWith(".png"))))].sort();
    const cell = (p: string, f: string) => existsSync(`${root}/${p}/${f}`)
      ? `<td><a href="${p}/${f}"><img src="${p}/${f}" alt="${f} at ${p}"></a></td>` : "<td>missing</td>";
    const rows = shots.map((f) => `<tr><th>${f.replace(".png", "")}</th>${projects.map((p) => cell(p, f)).join("")}</tr>`).join("\n");
    writeFileSync(`${root}/index.html`, `<!doctype html><meta charset="utf-8"><title>LiveLine contact sheet</title>
<style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse}th,td{vertical-align:top;padding:8px;border-bottom:1px solid #ccc}
th{text-align:left;width:9rem}img{width:260px;border:1px solid #999}</style>
<h1>Contact sheet</h1><p>${new Date().toISOString()}</p>
<table><tr><th></th>${projects.map((p) => `<th>${p}</th>`).join("")}</tr>
${rows}</table>`);
    console.log(`Contact sheet: ${root}/index.html (${shots.length} pages × ${projects.length} sizes)`);
  }
}
