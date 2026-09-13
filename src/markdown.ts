// Escape-first markdown subset (TODO.impl/15): every character is escaped
// before any formatting is applied, so model output can never inject HTML.
// Supports: fenced code, headings, bold, italic, inline code, links
// (http/https only), lists, blockquotes, tables, hr, paragraphs.

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(s: string): string {
  let out = "";
  let rest = s;
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/^`([^`]+)`/, (m) => `<code>${m[1]}</code>`],
    [/^\*\*([^*]+)\*\*/, (m) => `<strong>${m[1]}</strong>`],
    [/^\*([^*]+)\*/, (m) => `<em>${m[1]}</em>`],
    [
      /^\[([^\]]+)\]\(([^)\s]+)\)/,
      (m) => (/^https?:\/\//i.test(m[2]) ? `<a href="${m[2]}" target="_blank" rel="noopener">${m[1]}</a>` : m[1]),
    ],
  ];
  while (rest.length) {
    let matched = false;
    for (const [re, fn] of patterns) {
      const m = rest.match(re);
      if (m) {
        out += fn(m);
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += rest[0];
      rest = rest.slice(1);
    }
  }
  return out;
}

export function renderMarkdown(src: string): string {
  // fenced code blocks are pulled out first so their content never flows
  // through the inline rules
  const codeBlocks: string[] = [];
  const text = esc(src).replace(/```([a-zA-Z0-9+-]*)\n([\s\S]*?)```/g, (_m, _lang, body) => {
    codeBlocks.push(`<pre class="code-card"><code>${String(body).replace(/\n$/, "")}</code></pre>`);
    return `${codeBlocks.length - 1}`;
  });

  const lines = text.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { kind: "ul" | "ol"; items: string[] } | null = null;
  let table: string[][] | null = null;
  let pendingBlank = false;

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.kind}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.kind}>`);
      list = null;
    }
  };
  const flushTable = () => {
    if (table && table.length) {
      const head = table[0];
      const body = table.slice(1);
      out.push(
        `<table class="md-table"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
      );
      table = null;
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushTable();
  };

  const isTableRow = (l: string) => l.includes("|") && l.trim().startsWith("|");
  const splitRow = (l: string) =>
    l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const isTableRule = (l: string) => /^[\s|:-]+$/.test(l) && l.includes("-");

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim()) {
      // loose lists: blank lines between items do NOT break the list
      // (model answers number items with blank lines between them —
      // flushing there restarts every <ol> at 1)
      if (pendingBlank) {
        pendingBlank = false;
        const ul2 = line.match(/^\s*[-*]\s+(.*)$/);
        const ol2 = line.match(/^\s*\d+[.)]\s+(.*)$/);
        const continues = list && ((list.kind === "ul" && ul2) || (list.kind === "ol" && ol2));
        if (!continues) flushList();
      }
    }
    const fence = line.match(/^(\d+)$/);
    if (fence) {
      flushAll();
      out.push(codeBlocks[Number(fence[1])]);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushAll();
      const level = Math.min(h[1].length + 1, 5); // h2..h5 inside the page
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      continue;
    }
    if (/^(---|\*\*\*)\s*$/.test(line)) {
      flushAll();
      out.push('<hr class="border-rule" />');
      continue;
    }
    const bq = line.match(/^&gt;\s?(.*)$/);
    if (bq) {
      flushAll();
      out.push(`<blockquote>${inline(bq[1])}</blockquote>`);
      continue;
    }
    if (isTableRow(line)) {
      if (isTableRule(line)) continue; // separator row
      flushPara();
      flushList();
      (table ??= []).push(splitRow(line));
      continue;
    }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      flushTable();
      const kind = ul ? "ul" : "ol";
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      flushTable();
      pendingBlank = true;
      continue;
    }
    flushList();
    flushTable();
    para.push(line.trim());
  }
  flushAll();
  return out.join("\n");
}

/** DOM (our rendered markdown) → markdown text, so a mouse-selection copy
 *  yields the source format, not flattened rendered text. */
export function domToMarkdown(root: Node): string {
  const block = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? "";
    if (n.nodeType !== Node.ELEMENT_NODE) return "";
    const e = n as HTMLElement;
    const kids = () => Array.from(e.childNodes).map(block).join("");
    switch (e.tagName) {
      case "STRONG":
        return `**${kids()}**`;
      case "EM":
        return `*${kids()}*`;
      case "CODE":
        return e.closest("pre") ? kids() : `\`${kids()}\``;
      case "PRE":
        return "\n```\n" + (e.textContent ?? "") + "\n```\n";
      case "A":
        return e.classList.contains("cite-ref") ? `[${kids()}]` : `[${kids()}](${e.getAttribute("href") ?? ""})`;
      case "H2":
        return `\n## ${kids()}\n`;
      case "H3":
        return `\n### ${kids()}\n`;
      case "H4":
      case "H5":
        return `\n#### ${kids()}\n`;
      case "LI": {
        const parent = e.parentElement?.tagName === "OL";
        const idx = parent ? Array.from(e.parentElement!.children).indexOf(e) + 1 : 0;
        return `\n${parent ? idx + ". " : "- "}${kids()}`;
      }
      case "UL":
      case "OL":
        return kids();
      case "P":
        return `\n${kids()}\n`;
      case "BR":
        return "\n";
      case "BLOCKQUOTE":
        return `\n> ${kids()}`;
      case "HR":
        return "\n---\n";
      case "TABLE": {
        const rows = Array.from(e.querySelectorAll("tr")).map((tr) =>
          "| " + Array.from(tr.children).map((c) => (c.textContent ?? "").trim()).join(" | ") + " |",
        );
        return "\n" + rows.join("\n") + "\n";
      }
      case "TBODY":
      case "THEAD":
      case "TR":
      case "TH":
      case "TD":
      case "SPAN":
      case "DIV":
        return kids();
      default:
        return kids();
    }
  };
  return block(root)
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
