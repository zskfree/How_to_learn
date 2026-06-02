import { loadPlatformConfig, readText, writeText } from "./lib/project-utils.mjs";

const config = loadPlatformConfig();

const recommendedItems = [
  {
    section: "AI平台",
    id: "chatgpt",
    tag: "default",
    priority: true,
    titleStrong: true,
    meta:
      "默认首选。适合论文理解、英文润色、代码辅助、数据分析和把零散想法整理成研究提纲。一般科研学习和日常使用，GPT 已经够用。",
    keyline: "重点：覆盖面最广，最适合作为日常科研入口。"
  },
  {
    section: "AI平台",
    id: "codex_app",
    tag: "coding",
    priority: true,
    titleStrong: true,
    meta:
      "ChatGPT 推出的桌面 App 版本，强烈推荐。适合写代码、改网页、做数据分析、跑计量回归、解释报错，并把科研流程做成可复用工具。",
    keyline: "重点：能进入本地项目，把分析思路变成可运行文件。"
  },
  {
    section: "AI平台",
    id: "gemini",
    tag: "multimodal",
    priority: true,
    titleStrong: true,
    meta: "同样主推。适合 Google 生态、多模态材料、网页资料理解和搜索辅助。网络门槛相对友好，值得作为 GPT 的并行选择。",
    keyline: "重点：图表、截图、网页资料和搜索扩展更顺手。"
  },
  {
    section: "AI平台",
    id: "claude",
    tag: "optional",
    priority: false,
    titleStrong: false,
    meta: "强烈推荐长文档场景。适合读论文、报告、综述和复杂材料，但账号、网络和风控门槛相对更高。"
  }
];

const html = readText("index.html");
const generated = recommendedItems.map(renderRecommendedItem).join("\n");
const updated = replaceGeneratedBlock(
  html,
  "recommended-platforms",
  `            ${generated.replaceAll("\n", "\n            ")}`
);

writeText("index.html", updated);
console.log("Generated index.html recommended platform links from 配置/工具与平台地址.yml.");

function renderRecommendedItem(item) {
  const entry = config[item.section]?.[item.id];
  if (!entry) {
    throw new Error(`Missing config entry: ${item.section}.${item.id}`);
  }
  if (!entry.名称 || !entry.官网) {
    throw new Error(`Config entry ${item.section}.${item.id} needs 名称 and 官网`);
  }

  const title = item.titleStrong ? `<strong>${escapeHtml(entry.名称)}</strong>` : escapeHtml(entry.名称);
  const tag = item.tag ? `<span class="tag">${escapeHtml(item.tag)}</span>` : "";
  const keyline = item.keyline ? `\n            <span class="keyline">${escapeHtml(item.keyline)}</span>` : "";

  return `<li${item.priority ? ' class="priority"' : ""}>
    <a class="platform-link" href="${escapeHtml(entry.官网)}" target="_blank" rel="noopener noreferrer">
        <span>
            <span class="item-title">${title}${tag}</span>
            <span class="item-meta">${escapeHtml(item.meta || entry.用途 || "")}</span>${keyline}
        </span>
    </a>
</li>`;
}

function replaceGeneratedBlock(text, blockName, content) {
  const start = `<!-- generated:${blockName}:start -->`;
  const end = `<!-- generated:${blockName}:end -->`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);

  if (!pattern.test(text)) {
    throw new Error(`Missing generated block markers for ${blockName}`);
  }

  return text.replace(pattern, `${start}\n${content}\n            ${end}`);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
