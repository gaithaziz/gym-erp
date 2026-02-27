/* eslint-disable no-console */
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const EN_FILE = path.join(ROOT, "src", "lib", "i18n", "locales", "en.ts");
const AR_FILE = path.join(ROOT, "src", "lib", "i18n", "locales", "ar.ts");
const STRICT = process.argv.includes("--strict");

function readSource(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseLocaleObject(filePath, exportedConstName) {
  const text = readSource(filePath);
  const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  let target = null;
  for (const stmt of source.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const isExported = stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === exportedConstName) {
        target = decl.initializer;
        break;
      }
    }
    if (target) break;
  }

  if (!target) {
    throw new Error(`Could not find exported const "${exportedConstName}" in ${filePath}`);
  }
  return {
    source,
    object: evaluateObjectLiteral(target, source, filePath),
  };
}

function evaluateObjectLiteral(node, source, filePath) {
  if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node)) {
    return evaluateObjectLiteral(node.expression, source, filePath);
  }
  if (!ts.isObjectLiteralExpression(node)) {
    throw new Error(`Expected object literal in ${filePath}`);
  }
  const out = {};
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue;
    }
    const key = getPropertyName(prop.name, source);
    if (!key) continue;
    const value = evaluateValue(prop.initializer, source, filePath);
    out[key] = value;
  }
  return out;
}

function evaluateValue(node, source, filePath) {
  if (ts.isObjectLiteralExpression(node)) {
    return evaluateObjectLiteral(node, source, filePath);
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return source.text.slice(node.getStart(source), node.getEnd());
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (node.kind === ts.SyntaxKind.FalseKeyword) return "false";
  if (ts.isNumericLiteral(node)) return node.text;
  return source.text.slice(node.getStart(source), node.getEnd());
}

function getPropertyName(nameNode, source) {
  if (ts.isIdentifier(nameNode) || ts.isStringLiteral(nameNode) || ts.isNumericLiteral(nameNode)) {
    return nameNode.text;
  }
  return source.text.slice(nameNode.getStart(source), nameNode.getEnd());
}

function flattenLeaves(obj, prefix = "", map = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flattenLeaves(v, key, map);
    } else {
      map.set(key, String(v));
    }
  }
  return map;
}

function extractPlaceholders(value) {
  const matches = value.match(/{{\s*[\w.]+\s*}}/g) || [];
  return Array.from(new Set(matches.map((m) => m.replace(/\s+/g, "")))).sort();
}

function hasLetters(value) {
  return /[\p{L}]/u.test(value);
}

function hasArabicLetters(value) {
  return /[\u0600-\u06FF]/u.test(value);
}

function isSafeNonArabicValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (/^(GymERP|Gym ERP|QR|POS|API|JSON|JOD|USD|EUR|SAR|AED)$/i.test(trimmed)) return true;
  if (/^v\d+(\.\d+)*$/i.test(trimmed)) return true;
  if (/^[\d\s:./,\-+()%]+$/.test(trimmed)) return true;
  if (/^{{\s*[\w.]+\s*}}$/.test(trimmed)) return true;
  return false;
}

function isLikelyUntranslated(en, ar) {
  if (en !== ar) return false;
  if (!hasLetters(en)) return false;
  if (/^(GymERP|JSON|QR|JOD|POS|API|v\d+(\.\d+)*)$/i.test(en.trim())) return false;
  return true;
}

function printList(title, list, max = 40) {
  console.log(`\n${title}: ${list.length}`);
  list.slice(0, max).forEach((x) => console.log(`  - ${x}`));
  if (list.length > max) console.log(`  ... and ${list.length - max} more`);
}

function main() {
  const { object: enObj } = parseLocaleObject(EN_FILE, "enMessages");
  const { object: arObj } = parseLocaleObject(AR_FILE, "arMessages");

  const enMap = flattenLeaves(enObj);
  const arMap = flattenLeaves(arObj);

  const enKeys = new Set(enMap.keys());
  const arKeys = new Set(arMap.keys());

  const missingInAr = Array.from(enKeys).filter((k) => !arKeys.has(k)).sort();
  const extraInAr = Array.from(arKeys).filter((k) => !enKeys.has(k)).sort();

  const emptyEn = [];
  const emptyAr = [];
  const placeholderMismatches = [];
  const untranslatedLikely = [];
  const nonArabicSuspicious = [];

  for (const key of enKeys) {
    const enVal = enMap.get(key);
    const arVal = arMap.get(key);
    if (typeof enVal !== "string" || typeof arVal !== "string") continue;

    if (!enVal.trim()) emptyEn.push(key);
    if (!arVal.trim()) emptyAr.push(key);

    const enTokens = extractPlaceholders(enVal);
    const arTokens = extractPlaceholders(arVal);
    if (JSON.stringify(enTokens) !== JSON.stringify(arTokens)) {
      placeholderMismatches.push(
        `${key} | en=${JSON.stringify(enTokens)} ar=${JSON.stringify(arTokens)}`
      );
    }

    if (isLikelyUntranslated(enVal, arVal)) {
      untranslatedLikely.push(`${key} = "${enVal}"`);
    }

    if (hasLetters(enVal) && hasLetters(arVal) && !hasArabicLetters(arVal) && !isSafeNonArabicValue(arVal)) {
      nonArabicSuspicious.push(`${key} = "${arVal}"`);
    }
  }

  console.log("i18n check summary");
  console.log(`  en leaf keys: ${enMap.size}`);
  console.log(`  ar leaf keys: ${arMap.size}`);

  printList("Missing keys in ar", missingInAr);
  printList("Extra keys in ar", extraInAr);
  printList("Empty en values", emptyEn);
  printList("Empty ar values", emptyAr);
  printList("Placeholder mismatches", placeholderMismatches);
  printList("Likely untranslated values", untranslatedLikely);
  printList("Arabic values without Arabic letters (suspicious)", nonArabicSuspicious);

  const blockingIssues =
    missingInAr.length +
    extraInAr.length +
    emptyEn.length +
    emptyAr.length +
    placeholderMismatches.length +
    nonArabicSuspicious.length;
  const strictIssues = blockingIssues + untranslatedLikely.length;

  if (STRICT ? strictIssues > 0 : blockingIssues > 0) {
    console.error("\ni18n check failed.");
    process.exit(1);
  }

  console.log("\ni18n check passed.");
}

main();
