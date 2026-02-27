/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "src");
const FAIL_ON_FOUND = process.argv.includes("--fail-on-found");
const MAX_PRINT = 200;

const IGNORE_FILE_PATTERNS = [
  /[\\/]src[\\/]lib[\\/]i18n[\\/]/,
  /[\\/]src[\\/]styles[\\/]/,
  /[\\/]src[\\/]types[\\/]/,
  /[\\/]src[\\/]generated[\\/]/,
  /[\\/]src[\\/]__tests__[\\/]/,
  /[\\/]src[\\/]test[\\/]/,
];

const ATTR_ALLOWLIST = new Set([
  "className",
  "id",
  "href",
  "src",
  "type",
  "name",
  "rel",
  "target",
  "method",
  "action",
  "encType",
  "htmlFor",
  "role",
  "value",
  "key",
  "accept",
  "preload",
  "stroke",
  "fill",
  "dataKey",
  "viewBox",
  "width",
  "height",
  "min",
  "max",
  "step",
  "colSpan",
  "rowSpan",
  "interval",
  "layoutId",
  "size",
  "loading",
  "referrerPolicy",
  "allow",
  "maxWidthClassName",
]);

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (!/\.(tsx|jsx)$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function isIgnoredFile(filePath, sourceText) {
  if (IGNORE_FILE_PATTERNS.some((p) => p.test(filePath))) return true;
  if (sourceText.includes("i18n-ignore-file")) return true;
  return false;
}

function hasLetters(value) {
  return /[\p{L}]/u.test(value);
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function shouldFlagLiteral(value) {
  const v = normalize(value);
  if (!v) return false;
  if (!hasLetters(v)) return false;
  if (v.length <= 1) return false;
  if (/^(https?:\/\/|\/|#|--|[A-Z_0-9.-]+)$/.test(v)) return false;
  if (/^(true|false|null|undefined)$/i.test(v)) return false;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(v)) return false;
  return true;
}

function getLineCol(sourceFile, pos) {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, col: lc.character + 1 };
}

function collectFindings(filePath, sourceText) {
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];

  function record(kind, node, text) {
    const value = normalize(text);
    if (!shouldFlagLiteral(value)) return;
    const { line, col } = getLineCol(source, node.getStart(source));
    findings.push({
      file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
      line,
      col,
      kind,
      text: value,
    });
  }

  function visit(node) {
    if (ts.isJsxText(node)) {
      record("jsx-text", node, node.getText(source));
    }

    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(source);
      if (attrName.startsWith("data-")) {
        ts.forEachChild(node, visit);
        return;
      }
      if (ATTR_ALLOWLIST.has(attrName)) {
        ts.forEachChild(node, visit);
        return;
      }
      if (!node.initializer) {
        ts.forEachChild(node, visit);
        return;
      }
      if (ts.isStringLiteral(node.initializer)) {
        record(`jsx-attr:${attrName}`, node.initializer, node.initializer.text);
      } else if (
        ts.isJsxExpression(node.initializer) &&
        node.initializer.expression &&
        ts.isStringLiteral(node.initializer.expression)
      ) {
        record(`jsx-attr:${attrName}`, node.initializer.expression, node.initializer.expression.text);
      }
    }

    if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteral(node.expression)) {
      record("jsx-expression-string", node.expression, node.expression.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

function main() {
  const files = walkFiles(SRC_ROOT);
  const findings = [];

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    if (isIgnoredFile(file, text)) continue;
    findings.push(...collectFindings(file, text));
  }

  findings.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    if (a.line !== b.line) return a.line - b.line;
    return a.col - b.col;
  });

  const grouped = new Map();
  for (const f of findings) {
    grouped.set(f.file, (grouped.get(f.file) || 0) + 1);
  }

  const reportDir = path.join(ROOT, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "i18n-hardcoded-report.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalFindings: findings.length,
        filesWithFindings: grouped.size,
        byFile: Object.fromEntries(Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))),
        findings,
      },
      null,
      2
    )
  );

  console.log("hardcoded i18n literal check");
  console.log(`  files scanned: ${files.length}`);
  console.log(`  files with findings: ${grouped.size}`);
  console.log(`  total findings: ${findings.length}`);
  console.log(`  report: ${path.relative(ROOT, reportPath).replace(/\\/g, "/")}`);

  findings.slice(0, MAX_PRINT).forEach((f) => {
    console.log(`  - ${f.file}:${f.line}:${f.col} [${f.kind}] "${f.text}"`);
  });
  if (findings.length > MAX_PRINT) {
    console.log(`  ... and ${findings.length - MAX_PRINT} more`);
  }

  if (FAIL_ON_FOUND && findings.length > 0) {
    console.error("\nhardcoded literal check failed.");
    process.exit(1);
  }
}

main();
