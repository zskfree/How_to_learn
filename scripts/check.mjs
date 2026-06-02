import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { loadPlatformConfig, rootDir, toPosixPath, walkFiles } from "./lib/project-utils.mjs";

const markdownOrHtml = /\.(md|html)$/i;
const binaryInstaller = /^安装包\/.+\.(exe|msi|zip)$/i;
const localLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)|(?:href|src)=["']([^"']+)["']/g;
const externalScheme = /^[a-z][a-z0-9+.-]*:/i;
const secretPatterns = [
  { name: "OpenAI API key", pattern: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "generic access token", pattern: /(api[_-]?key|access[_-]?token|secret)\s*[:=]\s*["'][^"']{12,}["']/gi },
  { name: "subscription URL", pattern: /https?:\/\/[^\s"'<>]*(sub|subscribe|token|apikey|api_key)[^\s"'<>]*/gi }
];
const dynamicLinkHints = [
  /aff=/i,
  /register/i,
  /abc\.html/i,
  /ikuuu/i,
  /mojie/i
];

const allFiles = walkFiles();
const contentFiles = allFiles.filter((file) => markdownOrHtml.test(file));
const brokenLocalLinks = [];
const externalLinks = new Map();
const dynamicLinks = new Map();
const sensitiveMatches = [];

for (const file of contentFiles) {
  const text = fs.readFileSync(file, "utf8");
  const relativeFile = toPosixPath(path.relative(rootDir, file));

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      sensitiveMatches.push({
        file: relativeFile,
        type: name,
        sample: redact(match[0])
      });
    }
  }

  localLinkPattern.lastIndex = 0;
  for (const match of text.matchAll(localLinkPattern)) {
    const rawTarget = (match[1] || match[2] || "").trim();
    if (!rawTarget || rawTarget.startsWith("#") || rawTarget.startsWith("mailto:")) {
      continue;
    }

    if (externalScheme.test(rawTarget)) {
      addLink(externalLinks, rawTarget, relativeFile);
      if (dynamicLinkHints.some((hint) => hint.test(rawTarget))) {
        addLink(dynamicLinks, rawTarget, relativeFile);
      }
      continue;
    }

    const targetWithoutFragment = rawTarget.split("#")[0].split("?")[0];
    if (!targetWithoutFragment) {
      continue;
    }

    const resolved = path.resolve(path.dirname(file), decodeURIComponent(targetWithoutFragment));
    const relativeTarget = path.relative(rootDir, resolved);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget) || !fs.existsSync(resolved)) {
      brokenLocalLinks.push({
        file: relativeFile,
        target: rawTarget
      });
    }
  }
}

let configError = null;
try {
  loadPlatformConfig();
} catch (error) {
  configError = error.message;
}

let trackedInstallers = [];
try {
  trackedInstallers = execFileSync("git", ["ls-files"], { cwd: rootDir, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((file) => binaryInstaller.test(file));
} catch (error) {
  trackedInstallers = [`git ls-files failed: ${error.message}`];
}

const failures = [];
if (brokenLocalLinks.length > 0) {
  failures.push(`${brokenLocalLinks.length} broken local link(s)`);
}
if (configError) {
  failures.push(`YAML parse failed: ${configError}`);
}
if (trackedInstallers.length > 0) {
  failures.push(`${trackedInstallers.length} tracked installer file(s)`);
}
if (sensitiveMatches.length > 0) {
  failures.push(`${sensitiveMatches.length} possible sensitive value(s)`);
}

printReport({
  filesChecked: contentFiles.length,
  brokenLocalLinks,
  externalLinks,
  dynamicLinks,
  trackedInstallers,
  sensitiveMatches,
  configError,
  failures
});

if (failures.length > 0) {
  process.exitCode = 1;
}

function addLink(map, url, file) {
  if (!map.has(url)) {
    map.set(url, new Set());
  }
  map.get(url).add(file);
}

function redact(value) {
  if (value.length <= 16) {
    return "[redacted]";
  }
  return `${value.slice(0, 8)}...[redacted]...${value.slice(-4)}`;
}

function printReport(report) {
  console.log("# Project Check Report");
  console.log("");
  console.log(`Files checked: ${report.filesChecked}`);
  console.log(`YAML config: ${report.configError ? `failed (${report.configError})` : "ok"}`);
  console.log(`Tracked installers: ${report.trackedInstallers.length}`);
  console.log(`Broken local links: ${report.brokenLocalLinks.length}`);
  console.log(`External links: ${report.externalLinks.size}`);
  console.log(`Dynamic links needing manual review: ${report.dynamicLinks.size}`);
  console.log(`Possible sensitive values: ${report.sensitiveMatches.length}`);
  console.log("");

  printArray("Broken Local Links", report.brokenLocalLinks.map((item) => `${item.file} -> ${item.target}`));
  printArray("Tracked Installers", report.trackedInstallers);
  printMap("External Links", report.externalLinks);
  printMap("Manual Review Links", report.dynamicLinks);
  printArray(
    "Possible Sensitive Values",
    report.sensitiveMatches.map((item) => `${item.file} (${item.type}): ${item.sample}`)
  );

  if (report.failures.length === 0) {
    console.log("Result: ok");
  } else {
    console.log(`Result: failed (${report.failures.join("; ")})`);
  }
}

function printArray(title, items) {
  console.log(`## ${title}`);
  if (items.length === 0) {
    console.log("- none");
  } else {
    for (const item of items) {
      console.log(`- ${item}`);
    }
  }
  console.log("");
}

function printMap(title, map) {
  console.log(`## ${title}`);
  if (map.size === 0) {
    console.log("- none");
  } else {
    for (const [url, files] of [...map.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`- ${url} (${[...files].sort().join(", ")})`);
    }
  }
  console.log("");
}
