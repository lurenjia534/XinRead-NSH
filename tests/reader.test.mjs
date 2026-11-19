import test from "node:test";
import assert from "node:assert/strict";
import { chaptersOf } from "../web/local.js";
import { api, featured, safeLink } from "../server/api.mjs";
test("TXT punctuation stays literal; titles split chapters", () =>
  assert.deepEqual(chaptersOf("第一章 开始\n# 原文\r\n第二章\n* 原文", false), [
    { title: "第一章 开始", paragraphs: ["# 原文"] },
    { title: "第二章", paragraphs: ["* 原文"] },
  ]));
test("Markdown headings form a table of contents", () =>
  assert.equal(chaptersOf("# 序\n正文\n## 一\n段落", true).length, 2));
test("featured books preserve the source order, URLs and unique IDs", () => {
  const a =
    '<a href="https://weread.qq.com/web/reader/123" class="wr_suggestion_card_wrapper"><div class="wr_suggestion_card_content_title"> A &amp; B </div><div class="wr_suggestion_card_content_author">作家</div></a>';
  assert.deepEqual(featured(a + a), [
    {
      title: "A & B",
      author: "作家",
      id: "123",
      cover: "",
      url: "https://weread.qq.com/web/reader/123",
    },
  ]);
});
test("shelf sends key only to Tencent; filters links and sends no credentials back", async () => {
  const req = new Request("https://example.test/api/shelf", {
    method: "POST",
    headers: { "X-WeRead-Key": "wrk-testonly" },
  });
  const res = await api(req, (url, opts) => {
    assert.equal(url, "https://i.weread.qq.com/api/agent/gateway");
    assert.equal(opts.headers.Authorization, "Bearer wrk-testonly");
    return Response.json({
      books: [
        {
          bookId: "3",
          title: "一本书",
          readerLink: "https://weread.qq.com.evil.invalid/3",
        },
      ],
    });
  });
  const data = await res.json();
  assert.equal(data.books[0].url, "");
  assert.equal(JSON.stringify(data).includes("wrk-"), false);
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  assert.equal(safeLink("javascript:alert(1)"), "");
});
