import { expect, open, test } from "nsh/test";

const book = {
  id: "demo",
  title: "站内试读",
  author: "作者",
  url: "https://weread.qq.com/",
};
const local = { id: "local-test", title: "本机文稿", author: "本地读物" };
test("open online reader and return to discovery", async () => {
  const app = await open("./App.tsx", {
    host: {
      handlers: {
        "reader.init": { snapshot: [book], local: [], settings: {} },
        "reader.discover": [book],
        "reader.stop": null,
      },
    },
  });
  await app.press("阅读 站内试读");
  expect(app.texts()).toContain("在官网打开");
  await app.press("返回书架");
  expect(app.texts()).toContain("发现好书");
});
test("open local book, advance and select a chapter", async () => {
  const app = await open("./App.tsx", {
    host: {
      handlers: {
        "reader.init": { snapshot: [], local: [local], settings: {} },
        "reader.discover": [],
        "reader.stop": null,
        "reader.read": { chapters: ["上卷", "下卷"], position: 0 },
        "reader.chapter": ["一行原文"],
        "reader.position": null,
      },
    },
  });
  await app.press("本地读物");
  await app.press("阅读 本机文稿");
  expect(app.texts()).toContain("上卷");
  await app.press("下一章");
  expect(app.texts()).toContain("下卷");
  await app.press("目录");
  await app.press("上卷");
  expect(app.texts()).toContain("一行原文");
});
