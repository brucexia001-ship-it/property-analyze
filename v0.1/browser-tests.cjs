"use strict";

// Optional developer smoke test. The application itself requires no Node.js,
// Playwright, Chromium download, server, or package installation.
// Run: node browser-tests.cjs
// Optional paths: PLAYWRIGHT_MODULE_PATH and PROPERTY_ANALYZER_CHROMIUM.
// Managed test environments that block file:// may set PROPERTY_ANALYZER_TEST_URL
// to a local developer HTTP URL; this does not change application requirements.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE_PATH,
    "playwright",
    "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error("浏览器开发测试需要 Playwright；普通用户请直接打开 tests.html，无需安装依赖。");
}

const { chromium } = loadPlaywright();
const errors = [];
let passed = 0;
let browser;
let temporaryDirectory;
const entryURL = process.env.PROPERTY_ANALYZER_TEST_URL || pathToFileURL(path.join(__dirname, "index.html")).href;

function watchPage(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}

async function check(name, action) {
  await action();
  passed += 1;
  process.stdout.write("PASS " + name + "\n");
}

async function text(locator) {
  return (await locator.textContent()).trim();
}

async function metricValues(page) {
  return page.locator("#property-results .result-list .result-value").allTextContents();
}

function comparisonCell(page, row, column = 0) {
  return page.locator("#comparison-table tbody tr").nth(row).locator("td").nth(column);
}

async function fillFixture(page, overrides = {}) {
  const fixture = {
    city: "东京", name: "独立浏览器测试住宅", currency: "USD", price: "200000", area: "80",
    monthlyRent: "1500", acquisitionTaxFees: "10000", serviceCharge: "1800",
    annualPropertyTax: "600", insuranceMaintenance: "900", lettingManagementFee: "600",
    vacancyMonths: "1", incomeTaxRate: "20", ...overrides
  };
  for (const [field, value] of Object.entries(fixture)) {
    if (field === "currency") await page.locator("#currency").selectOption(value);
    else await page.locator("#" + field).fill(value);
  }
}

const baselineMetrics = [
  "USD 210,000.00", "USD 18,000.00", "USD 16,500.00", "9.00%",
  "USD 3,900.00", "USD 12,600.00", "6.00%", "USD 10,080.00"
];

async function backup(page) {
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-data").click();
  const download = await downloadPromise;
  const destination = path.join(temporaryDirectory, download.suggestedFilename());
  await download.saveAs(destination);
  assert.equal(await download.failure(), null);
  return { destination, data: JSON.parse(await fs.readFile(destination, "utf8")) };
}

async function importData(page, data) {
  await page.locator("#import-file").setInputFiles({
    name: "browser-test-backup.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(data), "utf8")
  });
}

(async function main() {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "property-analyzer-browser-"));
  const launchOptions = { headless: true };
  if (process.env.PROPERTY_ANALYZER_CHROMIUM) {
    launchOptions.executablePath = process.env.PROPERTY_ANALYZER_CHROMIUM;
  } else {
    try {
      await fs.access("/usr/bin/chromium");
      launchOptions.executablePath = "/usr/bin/chromium";
    } catch (error) { /* Use Playwright's installed Chromium on other machines. */ }
  }
  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  watchPage(page);
  page.on("dialog", (dialog) => dialog.accept());
  const requestedURLs = [];
  context.on("request", (request) => requestedURLs.push(request.url()));
  process.stdout.write("浏览器入口：" + entryURL + "\n");
  await page.goto(entryURL);

  await check("首次打开：3 套演示房产、比较表及演示标签", async () => {
    assert.equal(await page.locator(".property-card").count(), 3);
    assert.equal(await page.locator("#property-list .property-button").count(), 3);
    assert.equal(await page.locator("#comparison-table thead th").count(), 4);
    assert.equal(await page.locator("#comparison-table tbody tr").count(), 11);
    assert.equal(await page.locator("#comparison-currency").inputValue(), "USD");
    assert.match(await text(page.locator("#demo-notice")), /虚构演示房产/);
    assert.match(await text(page.locator("#demo-notice")), /并非实时市场数据/);
    assert.equal(await text(comparisonCell(page, 0)), "USD 340,200.00");
    assert.equal(await text(comparisonCell(page, 7)), "USD 15,646.50");
  });

  await check("编辑任意城市：8 项指标、公式及费用明细与独立期望值一致", async () => {
    await fillFixture(page);
    assert.deepEqual(await metricValues(page), baselineMetrics);
    assert.equal(await page.locator("#property-results .result-list .formula-text").count(), 8);
    for (const formula of await page.locator("#property-results .result-list .formula-text").allTextContents()) {
      assert.ok(formula.trim().length > 0, "每项财务指标都应展示公式");
    }
    assert.equal(await page.locator("#property-results .expense-list .result-row").count(), 5);
    assert.equal(await text(page.locator("#property-results .expense-list .result-row").last()), "运营成本合计USD 3,900.00");
    assert.match(await text(page.locator(".property-card").first()), /东京/);
    assert.equal(await text(comparisonCell(page, 10)), "0.04%");
  });

  await check("修改租金自动更新现金流，无需提交按钮", async () => {
    await page.locator("#monthlyRent").fill("1600");
    const values = await metricValues(page);
    assert.equal(values[1], "USD 19,200.00");
    assert.equal(values[2], "USD 17,600.00");
    assert.equal(values[7], "USD 10,960.00");
    await page.locator("#monthlyRent").fill("1500");
    assert.deepEqual(await metricValues(page), baselineMetrics);
  });

  await check("空白价格显示错误、移除旧计算，其他有效房产保留比较结果", async () => {
    const peerBefore = await text(comparisonCell(page, 0, 1));
    await page.locator("#price").fill("");
    assert.equal(await page.locator("#price").getAttribute("aria-invalid"), "true");
    assert.ok((await text(page.locator("#error-price"))).length > 0);
    assert.equal(await page.locator("#property-results .result-value").count(), 0);
    assert.match(await text(page.locator("#property-results")), /补全输入/);
    assert.match(await text(comparisonCell(page, 0)), /^—/);
    assert.match(await text(comparisonCell(page, 7)), /^—/);
    assert.equal(await text(comparisonCell(page, 0, 1)), peerBefore);
    await page.locator("#price").fill("200000");
    assert.deepEqual(await metricValues(page), baselineMetrics);
  });

  await check("只下降市值：成本及 8 项租金指标保持原值，总回报反映 -20% 估值", async () => {
    await page.locator("#stress-value").check();
    assert.deepEqual(await metricValues(page), baselineMetrics);
    assert.equal(await text(comparisonCell(page, 8)), "USD 160,000.00");
    assert.equal(await text(comparisonCell(page, 9)), "USD -39,920.00");
    assert.equal(await text(comparisonCell(page, 10)), "-19.01%");
    assert.equal(await page.locator("#price").inputValue(), "200000");
    assert.equal(await page.locator("#monthlyRent").inputValue(), "1500");
    await page.locator("#reset-scenario").click();
  });

  await check("只下降租金 10%：税后净收入 8,760，购入成本不变", async () => {
    await page.locator("#stress-rent").check();
    assert.deepEqual(await metricValues(page), [
      "USD 210,000.00", "USD 16,200.00", "USD 14,850.00", "8.10%",
      "USD 3,900.00", "USD 10,950.00", "5.21%", "USD 8,760.00"
    ]);
    await page.locator("#reset-scenario").click();
  });

  await check("只增加空置 2 个月：有效租金 13,500、税后 7,680", async () => {
    await page.locator("#stress-vacancy").check();
    assert.deepEqual(await metricValues(page), [
      "USD 210,000.00", "USD 18,000.00", "USD 13,500.00", "9.00%",
      "USD 3,900.00", "USD 9,600.00", "4.57%", "USD 7,680.00"
    ]);
    await page.locator("#reset-scenario").click();
  });

  await check("三项组合压力：税后 6,600、总收益 -43,400；恢复基础完整还原", async () => {
    await page.locator("#stress-rent").check();
    await page.locator("#stress-vacancy").check();
    await page.locator("#stress-value").check();
    assert.deepEqual(await metricValues(page), [
      "USD 210,000.00", "USD 16,200.00", "USD 12,150.00", "8.10%",
      "USD 3,900.00", "USD 8,250.00", "3.93%", "USD 6,600.00"
    ]);
    assert.equal(await text(comparisonCell(page, 9)), "USD -43,400.00");
    assert.equal(await page.locator("#vacancyMonths").inputValue(), "1");
    await page.locator("#reset-scenario").click();
    for (const id of ["stress-rent", "stress-vacancy", "stress-value"]) {
      assert.equal(await page.locator("#" + id).isChecked(), false);
    }
    assert.deepEqual(await metricValues(page), baselineMetrics);
    assert.equal(await text(comparisonCell(page, 8)), "USD 200,000.00");
    assert.equal(await text(comparisonCell(page, 9)), "USD 80.00");
  });

  await check("添加第 4 套任意城市房产，独立填写及测算", async () => {
    await page.locator("#add-property").click();
    assert.equal(await page.locator(".property-card").count(), 4);
    assert.equal(await page.locator("#comparison-table thead th").count(), 5);
    assert.equal(await page.locator("#property-results .result-value").count(), 0);
    await fillFixture(page, { city: "里斯本", name: "第四套测试住宅", currency: "EUR" });
    assert.deepEqual(await metricValues(page), baselineMetrics.map((value) => value.replace("USD", "EUR")));
    assert.equal(await text(comparisonCell(page, 0, 3)), "USD 231,000.00");
  });

  await check("手动 EUR 汇率与美元 / 欧元比较精确更新，原币指标及收益率不变", async () => {
    await page.locator("#rate-EUR").fill("1.2");
    assert.equal(await text(comparisonCell(page, 0, 3)), "USD 252,000.00");
    assert.equal(await text(comparisonCell(page, 7, 3)), "USD 12,096.00");
    assert.equal(await text(comparisonCell(page, 6, 3)), "6.00%");
    await page.locator("#comparison-currency").selectOption("EUR");
    assert.equal(await text(comparisonCell(page, 0, 0)), "EUR 175,000.00");
    assert.equal(await text(comparisonCell(page, 7, 0)), "EUR 8,400.00");
    assert.equal(await text(comparisonCell(page, 0, 3)), "EUR 210,000.00");
    await page.locator("#comparison-currency").selectOption("USD");
    await page.locator("#rate-EUR").fill("");
    assert.equal(await page.locator("#rate-EUR").getAttribute("aria-invalid"), "true");
    assert.match(await text(comparisonCell(page, 0, 3)), /^—/);
    assert.equal(await text(comparisonCell(page, 0, 0)), "USD 210,000.00");
    await page.locator("#rate-EUR").fill("1.2");
    assert.equal(await text(comparisonCell(page, 0, 3)), "USD 252,000.00");
  });

  const escapedName = '测试 <img src=x onerror="window.__nameScriptRan=true"> & "A" \'B\'';
  await check("名称含 HTML / 引号仍按文字显示，不执行代码", async () => {
    await page.locator("#name").fill(escapedName);
    assert.equal(await text(page.locator(".property-card").nth(3).locator(".card-title")), escapedName);
    assert.equal(await page.locator("#summary-grid img").count(), 0);
    assert.equal(await page.locator("#comparison-table img").count(), 0);
    assert.equal(await page.evaluate(() => window.__nameScriptRan === true), false);
  });

  await check("刷新恢复 4 套房产、名称、选中房产、汇率、比较币种及压力设置", async () => {
    await page.locator("#comparison-currency").selectOption("EUR");
    await page.locator("#stress-rent").check();
    await page.locator("#stress-value").check();
    await page.reload();
    assert.equal(await page.locator(".property-card").count(), 4);
    assert.equal(await page.locator("#name").inputValue(), escapedName);
    assert.equal(await page.locator("#city").inputValue(), "里斯本");
    assert.equal(await page.locator("#rate-EUR").inputValue(), "1.2");
    assert.equal(await page.locator("#comparison-currency").inputValue(), "EUR");
    assert.equal(await page.locator("#stress-rent").isChecked(), true);
    assert.equal(await page.locator("#stress-value").isChecked(), true);
    assert.equal(await page.locator("#stress-vacancy").isChecked(), false);
    assert.equal((await metricValues(page))[7], "EUR 8,760.00");
    assert.equal(await text(page.locator("#save-status")), "已恢复本机数据");
    await page.locator("#reset-scenario").click();
  });

  let validBackup;
  await check("JSON 导出 / 导入恢复房产、汇率、情景及特殊名称", async () => {
    validBackup = await backup(page);
    assert.equal(validBackup.data.version, 1);
    assert.equal(validBackup.data.properties.length, 4);
    assert.equal(validBackup.data.properties[3].name, escapedName);
    assert.equal(Number(validBackup.data.rates.EUR), 1.2);
    assert.equal(validBackup.data.comparisonCurrency, "EUR");
    await page.locator("#name").fill("临时变更");
    await page.locator("#monthlyRent").fill("900");
    await importData(page, validBackup.data);
    await page.waitForFunction((expected) => document.getElementById("name").value === expected, escapedName);
    assert.deepEqual(await metricValues(page), baselineMetrics.map((value) => value.replace("USD", "EUR")));
    assert.equal(await page.locator("#summary-grid img").count(), 0);
    assert.equal(await page.evaluate(() => window.__nameScriptRan === true), false);
  });

  await check("含未填价格的草稿备份可恢复，错误显示且有效房产继续比较", async () => {
    await page.locator("#price").fill("");
    const draftBackup = await backup(page);
    assert.equal(draftBackup.data.properties[3].price, "");
    await page.locator("#price").fill("200000");
    await importData(page, draftBackup.data);
    await page.waitForFunction(() => document.getElementById("price").value === "");
    assert.equal(await page.locator("#price").getAttribute("aria-invalid"), "true");
    assert.equal(await page.locator("#property-results .result-value").count(), 0);
    assert.match(await text(comparisonCell(page, 0, 3)), /^—/);
    assert.equal(await text(comparisonCell(page, 0, 0)), "EUR 175,000.00");
    await page.reload();
    assert.equal(await page.locator("#price").inputValue(), "");
    assert.equal(await page.locator("#price").getAttribute("aria-invalid"), "true");
    await page.locator("#price").fill("200000");
  });

  await check("损坏的 JSON 结构拒绝导入并保留当前房产", async () => {
    const badBackup = JSON.parse(JSON.stringify(validBackup.data));
    badBackup.properties[0].city = { unexpected: true };
    await importData(page, badBackup);
    await page.waitForFunction(() => document.getElementById("toast").textContent.startsWith("导入失败："));
    assert.equal(await page.locator(".property-card").count(), 4);
    assert.equal(await page.locator("#name").inputValue(), escapedName);
    assert.equal((await metricValues(page))[0], "EUR 210,000.00");
  });

  await check("基础情景溢出而压力情景有效：显示 8 项结果及比较提示，导出可用", async () => {
    const extremeProperty = {
      id: "overflow-regression", isDemo: false, city: "测试城市", name: "极端金额回归测试",
      currency: "USD", price: 1e308, area: 80, monthlyRent: 1.6e307,
      acquisitionTaxFees: 0, serviceCharge: 0, annualPropertyTax: 0,
      insuranceMaintenance: 0, lettingManagementFee: 0, vacancyMonths: 1, incomeTaxRate: 100
    };
    await importData(page, {
      version: 1, properties: [extremeProperty], selectedId: extremeProperty.id,
      rates: { USD: 1, EUR: 1.2, SGD: 0.75, AED: 0.25 }, comparisonCurrency: "USD",
      scenario: { rentDrop: true, vacancyIncrease: false, valueDrop: false }
    });
    await page.waitForFunction(() => document.getElementById("name").value === "极端金额回归测试");
    assert.equal(await page.locator("#property-results .result-list .result-value").count(), 8);
    assert.match(await text(page.locator("#property-results")), /基础情景无法比较/);
    assert.equal((await metricValues(page))[3], "172.80%");
    assert.equal((await metricValues(page))[6], "158.40%");
    assert.equal((await metricValues(page))[7], "USD 0.00");
    const extremeBackup = await backup(page);
    assert.equal(extremeBackup.data.properties[0].price, 1e308);
    assert.equal(extremeBackup.data.scenario.rentDrop, true);
    assert.equal(await text(page.locator("#save-status")), "✓ 已保存到本机");
    await importData(page, validBackup.data);
    await page.waitForFunction((expected) => document.getElementById("name").value === expected, escapedName);
    assert.equal(await page.locator(".property-card").count(), 4);
    assert.equal((await metricValues(page))[0], "EUR 210,000.00");
  });

  await check("375px 小屏不产生整页横向溢出，比较表可在容器内滚动", async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const dimensions = await page.evaluate(() => ({
      width: window.innerWidth,
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      tableWidth: document.querySelector(".table-scroll").clientWidth,
      tableScrollWidth: document.querySelector(".table-scroll").scrollWidth
    }));
    assert.ok(dimensions.body <= dimensions.width + 1, JSON.stringify(dimensions));
    assert.ok(dimensions.document <= dimensions.width + 1, JSON.stringify(dimensions));
    assert.ok(dimensions.tableScrollWidth > dimensions.tableWidth, "横向比较表应在自己的容器内滚动");
  });

  await check("浏览器 tests.html：53 项独立计算测试全部通过，可重新运行", async () => {
    const testPage = await context.newPage();
    watchPage(testPage);
    await testPage.goto(new URL("tests.html", entryURL).href);
    assert.match(await text(testPage.locator("#summary")), /53 项测试：53 项通过，0 项失败/);
    assert.equal(await testPage.locator("#results li").count(), 53);
    assert.equal(await testPage.locator("#results .failed").count(), 0);
    await testPage.locator("#run-tests").click();
    assert.equal(await testPage.locator("#results li").count(), 53);
    assert.equal(await testPage.locator("#results .failed").count(), 0);
    await testPage.close();
  });

  await check("页面资源全部来自本地入口，不请求外部服务", async () => {
    const allowedProtocol = new URL(entryURL).protocol;
    const allowedOrigin = new URL(entryURL).origin;
    assert.ok(requestedURLs.length > 0);
    requestedURLs.forEach((url) => {
      const requestURL = new URL(url);
      assert.equal(requestURL.protocol, allowedProtocol, "意外的资源请求：" + url);
      assert.equal(requestURL.origin, allowedOrigin, "外部资源请求：" + url);
    });
  });

  await check("全部本地源码在断网浏览器中执行：基础及组合压力结果正确，零资源请求", async () => {
    const sources = await Promise.all(["index.html", "styles.css", "calculations.js", "examples.js", "app.js"].map((file) => fs.readFile(path.join(__dirname, file), "utf8")));
    let html = sources[0].replace('<link rel="stylesheet" href="styles.css">', "<style>" + sources[1] + "</style>");
    html = html.replace(/<script src="(?:calculations|examples|app)\.js" defer><\/script>/g, "");
    html = html.replace("</body>", sources.slice(2).map((source) => "<script>" + source + "</script>").join("\n") + "</body>");
    const offlineContext = await browser.newContext({ offline: true });
    const offlinePage = await offlineContext.newPage();
    watchPage(offlinePage);
    const offlineRequests = [];
    offlineContext.on("request", (request) => offlineRequests.push(request.url()));
    await offlinePage.setContent(html);
    assert.equal(await offlinePage.locator(".property-card").count(), 3);
    await fillFixture(offlinePage);
    assert.deepEqual(await metricValues(offlinePage), baselineMetrics);
    await offlinePage.locator("#stress-rent").check();
    await offlinePage.locator("#stress-vacancy").check();
    await offlinePage.locator("#stress-value").check();
    assert.equal((await metricValues(offlinePage))[7], "USD 6,600.00");
    assert.equal(await text(comparisonCell(offlinePage, 9)), "USD -43,400.00");
    assert.deepEqual(offlineRequests, []);
    await offlineContext.close();
  });

  await check("所有浏览器操作均无 JavaScript 异常或控制台错误", async () => {
    assert.deepEqual(errors, []);
  });

  process.stdout.write("\n" + passed + " 项浏览器功能检查通过。\n");
}()).catch((error) => {
  process.stderr.write("FAIL 浏览器功能检查：" + error.stack + "\n");
  if (errors.length) process.stderr.write("浏览器错误：" + JSON.stringify(errors) + "\n");
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
});
