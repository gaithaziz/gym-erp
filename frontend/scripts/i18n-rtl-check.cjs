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

const RISK_PATTERNS = [
  { name: "left/right-position", pattern: /^(left|right)-/ },
  { name: "margin-lr", pattern: /^-?m[lr]-/ },
  { name: "padding-lr", pattern: /^p[lr]-/ },
  { name: "space-x", pattern: /^space-x-/ },
  { name: "divide-x", pattern: /^divide-x-/ },
  { name: "text-align-lr", pattern: /^text-(left|right)$/ },
  { name: "border-lr", pattern: /^border-(l|r)(-|$)/ },
  { name: "rounded-lr", pattern: /^rounded-(l|r|tl|tr|bl|br)(-|$)/ },
  { name: "float-lr", pattern: /^float-(left|right)$/ },
  { name: "clear-lr", pattern: /^clear-(left|right)$/ },
  { name: "origin-lr", pattern: /^origin-(left|right)$/ },
  { name: "translate-x", pattern: /^-?translate-x-/ },
];

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
  if (sourceText.includes("rtl-ignore-file")) return true;
  return false;
}

function getLineCol(sourceFile, pos) {
  const lc = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: lc.line + 1, col: lc.character + 1 };
}

function collectStringChunks(node) {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [node.text];
  }
  if (ts.isTemplateExpression(node)) {
    const chunks = [node.head.text];
    for (const span of node.templateSpans) {
      chunks.push(...collectStringChunks(span.expression));
      chunks.push(span.literal.text);
    }
    return chunks;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((el) => collectStringChunks(el));
  }
  if (ts.isObjectLiteralExpression(node)) {
    const chunks = [];
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        if (
          ts.isIdentifier(prop.name) ||
          ts.isStringLiteral(prop.name) ||
          ts.isNoSubstitutionTemplateLiteral(prop.name)
        ) {
          chunks.push(prop.name.text);
        }
        chunks.push(...collectStringChunks(prop.initializer));
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        chunks.push(prop.name.text);
      }
    }
    return chunks;
  }
  if (ts.isCallExpression(node)) {
    return node.arguments.flatMap((arg) => collectStringChunks(arg));
  }
  if (ts.isConditionalExpression(node)) {
    return [
      ...collectStringChunks(node.condition),
      ...collectStringChunks(node.whenTrue),
      ...collectStringChunks(node.whenFalse),
    ];
  }
  if (ts.isBinaryExpression(node)) {
    return [...collectStringChunks(node.left), ...collectStringChunks(node.right)];
  }
  if (ts.isParenthesizedExpression(node)) {
    return collectStringChunks(node.expression);
  }
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
    return collectStringChunks(node.expression);
  }
  return [];
}

function classifyToken(token) {
  if (!token || token.startsWith("rtl:") || token.startsWith("ltr:")) return null;
  for (const risk of RISK_PATTERNS) {
    if (risk.pattern.test(token)) return risk.name;
  }
  return null;
}

function collectFindings(filePath, sourceText) {
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings = [];

  function record(node, token, risk) {
    const { line, col } = getLineCol(source, node.getStart(source));
    const lineText = sourceText.split(/\r?\n/)[line - 1] || "";
    if (lineText.includes("rtl-ignore-line")) return;
    findings.push({
      file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
      line,
      col,
      token,
      risk,
    });
  }

  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "className" && node.initializer) {
      let chunks = [];
      if (ts.isStringLiteral(node.initializer)) {
        chunks = [node.initializer.text];
      } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        chunks = collectStringChunks(node.initializer.expression);
      }

      for (const chunk of chunks) {
        const tokens = chunk.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          const risk = classifyToken(token);
          if (risk) record(node, token, risk);
        }
      }
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
    if (a.col !== b.col) return a.col - b.col;
    return a.token.localeCompare(b.token);
  });

  const grouped = new Map();
  for (const f of findings) {
    grouped.set(f.file, (grouped.get(f.file) || 0) + 1);
  }

  const reportDir = path.join(ROOT, "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, "rtl-risk-report.json");
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

  console.log("rtl risk check");
  console.log(`  files scanned: ${files.length}`);
  console.log(`  files with findings: ${grouped.size}`);
  console.log(`  total findings: ${findings.length}`);
  console.log(`  report: ${path.relative(ROOT, reportPath).replace(/\\/g, "/")}`);

  findings.slice(0, MAX_PRINT).forEach((f) => {
    console.log(`  - ${f.file}:${f.line}:${f.col} [${f.risk}] "${f.token}"`);
  });
  if (findings.length > MAX_PRINT) {
    console.log(`  ... and ${findings.length - MAX_PRINT} more`);
  }

  if (FAIL_ON_FOUND && findings.length > 0) {
    console.error("\nrtl risk check failed.");
    process.exit(1);
  }
}

main();
