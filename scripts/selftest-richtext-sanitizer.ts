const { sanitizeRichText } = require("../lib/brand-content.ts") as typeof import("../lib/brand-content");

const malicious = sanitizeRichText(`
  <script>alert(1)</script>
  <a href="javascript:alert(1)">危险链接</a>
  <img src="x" onerror="alert(1)">
  <iframe src="https://example.com"></iframe>
  <p style="position:fixed;inset:0">覆盖页面</p>
`);

const valid = sanitizeRichText(`
  <h2>二级标题</h2><h3>三级标题</h3>
  <p><strong>粗体</strong><em>斜体</em><u>下划线</u></p>
  <a href="https://example.com">安全链接</a>
  <a href="https://cnzhengmu.com/dictionary/test">站内绝对链接</a>
  <a href="/dictionary/test">站内相对链接</a>
  <img src="/uploads/content/test.webp" alt="测试图片" onerror="alert(1)">
  <ul><li>无序列表</li></ul><ol><li>有序列表</li></ol>
  <blockquote>引用</blockquote>
  <table><tbody><tr><th>标题</th><td>内容</td></tr></tbody></table>
`);

const forbidden = [
  "<script",
  "alert(1)",
  "javascript:",
  "onerror",
  "<iframe",
  "position:",
  "inset:",
  'src="x"',
  "blob:",
  "data:image/",
];
for (const token of forbidden) {
  if (malicious.toLowerCase().includes(token.toLowerCase())) {
    throw new Error(`危险内容未清除：${token}\n${malicious}`);
  }
}

const required = [
  "<h2>",
  "<h3>",
  "<strong>",
  "<em>",
  "<u>",
  '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">',
  '<img src="/uploads/content/test.webp" alt="测试图片">',
  "<ul>",
  "<ol>",
  "<blockquote>",
  "<table",
];
for (const token of required) {
  if (!valid.includes(token)) throw new Error(`正常富文本被清除：${token}\n${valid}`);
}

for (const token of [
  '<a href="https://cnzhengmu.com/dictionary/test">站内绝对链接</a>',
  '<a href="/dictionary/test">站内相对链接</a>',
]) {
  if (!valid.includes(token)) throw new Error(`站内链接不应添加新窗口或 nofollow 属性：${token}\n${valid}`);
}

const transientImages = sanitizeRichText(
  '<img src="blob:https://example.com/id"><img src="data:image/png;base64,AAAA">',
);
if (/<img\b/i.test(transientImages)) {
  throw new Error(`临时或 base64 图片不应进入保存内容：${transientImages}`);
}

console.log("rich-text sanitizer security test: PASS");
