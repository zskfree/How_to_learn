import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

export function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

export function writeText(relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(rootDir, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(rootDir, relativePath), content, "utf8");
}

export function walkFiles(dir = rootDir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

export function parseSimpleYaml(text) {
  const root = {};
  const stack = [{ indent: -1, value: root }];

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const rawLine = lines[lineNumber];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (/\t/.test(rawLine)) {
      throw new Error(`YAML uses tabs at line ${lineNumber + 1}`);
    }

    const indent = rawLine.match(/^ */)[0].length;
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].value;

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(parent)) {
        throw new Error(`Unexpected YAML list item at line ${lineNumber + 1}`);
      }
      parent.push(parseYamlScalar(trimmed.slice(2)));
      continue;
    }

    const match = trimmed.match(/^([^:]+):(.*)$/);
    if (!match) {
      throw new Error(`Unsupported YAML syntax at line ${lineNumber + 1}`);
    }

    const key = match[1].trim();
    const valueText = match[2].trim();
    if (!key) {
      throw new Error(`Empty YAML key at line ${lineNumber + 1}`);
    }

    if (valueText === "") {
      parent[key] = nextSignificantLineIsList(lines, lineNumber, indent) ? [] : {};
      stack.push({ indent, value: parent[key] });
      continue;
    }

    if (valueText === "[]") {
      parent[key] = [];
      continue;
    }

    parent[key] = parseYamlScalar(valueText);
  }

  return root;
}

function nextSignificantLineIsList(lines, currentLineNumber, currentIndent) {
  for (let index = currentLineNumber + 1; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = rawLine.match(/^ */)[0].length;
    return indent > currentIndent && trimmed.startsWith("- ");
  }

  return false;
}

function parseYamlScalar(valueText) {
  if (
    (valueText.startsWith('"') && valueText.endsWith('"')) ||
    (valueText.startsWith("'") && valueText.endsWith("'"))
  ) {
    return valueText.slice(1, -1);
  }

  if (valueText === "true") {
    return true;
  }

  if (valueText === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(valueText)) {
    return Number(valueText);
  }

  return valueText;
}

export function loadPlatformConfig() {
  return parseSimpleYaml(readText("配置/工具与平台地址.yml"));
}
