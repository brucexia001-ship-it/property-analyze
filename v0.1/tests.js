(function (root, factory) {
  "use strict";
  var isNode = typeof module === "object" && !!module.exports;
  var api = factory(isNode ? require("./calculations.js") : root.PropertyMath);
  if (isNode) {
    module.exports = api;
    if (require.main === module) {
      var report = api.runTests();
      report.results.forEach(function (result) {
        process.stdout.write((result.passed ? "PASS " : "FAIL ") + result.name +
          (result.error ? " — " + result.error : "") + "\n");
      });
      process.stdout.write("\n" + report.passed + " 通过，" + report.failed + " 失败\n");
      process.exitCode = report.failed ? 1 : 0;
    }
  } else {
    root.PropertyTests = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : this, function (math) {
  "use strict";

  // 独立的虚构测试样本；期望金额直接列出，避免复用被测公式。
  function fixture(overrides) {
    return Object.assign({
      id: "test-property",
      city: "测试城市",
      name: "虚构测试住宅",
      currency: "USD",
      price: 200000,
      area: 80,
      monthlyRent: 1500,
      acquisitionTaxFees: 10000,
      serviceCharge: 1800,
      annualPropertyTax: 600,
      insuranceMaintenance: 900,
      lettingManagementFee: 600,
      vacancyMonths: 1,
      incomeTaxRate: 20,
      isDemo: true
    }, overrides || {});
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "断言失败");
  }

  function equal(actual, expected, label) {
    assert(actual === expected, (label || "结果") + "：预期 " + expected + "，实际 " + actual);
  }

  function near(actual, expected, label) {
    assert(typeof actual === "number" && Number.isFinite(actual), (label || "结果") + " 必须为有限数值");
    var tolerance = Math.max(1, Math.abs(expected)) * 1e-10;
    assert(Math.abs(actual - expected) <= tolerance,
      (label || "结果") + "：预期 " + expected + "，实际 " + actual);
  }

  function throws(action, label) {
    var didThrow = false;
    try { action(); } catch (error) { didThrow = true; }
    assert(didThrow, (label || "非法输入") + " 应被拒绝");
  }

  function rejectsProperty(overrides, field) {
    var input = fixture(overrides);
    var errors = math.validateProperty(input);
    assert(Array.isArray(errors), "校验结果必须为错误数组");
    assert(errors.some(function (error) {
      return error.field === field && typeof error.message === "string" && error.message.length > 0;
    }), "应指出 " + field + " 的错误及原因");
    throws(function () { math.calculateProperty(input); }, field);
  }

  function runTests() {
    var results = [];
    function test(name, action) {
      try {
        action();
        results.push({ name: name, passed: true });
      } catch (error) {
        results.push({ name: name, passed: false, error: error.message || String(error) });
      }
    }

    test("计算接口可用", function () {
      assert(math && typeof math.calculateProperty === "function", "未加载 calculations.js");
      assert(typeof math.validateProperty === "function", "缺少输入校验接口");
      assert(typeof math.convertCurrency === "function", "缺少汇率换算接口");
    });

    test("购入总成本 = 200,000 房价 + 10,000 一次性税费 = 210,000", function () {
      near(math.calculateProperty(fixture()).totalAcquisitionCost, 210000);
    });
    test("毛租金 18,000；空置损失 1,500；有效租金 16,500", function () {
      var result = math.calculateProperty(fixture());
      near(result.annualGrossRentalIncome, 18000);
      near(result.vacancyLoss, 1500);
      near(result.effectiveRentalIncome, 16500);
    });
    test("年度运营费用 3,900；税前净租金 12,600", function () {
      var result = math.calculateProperty(fixture());
      near(result.annualOperatingExpenses, 3900);
      near(result.netRentalIncomeBeforeTax, 12600);
    });
    test("毛回报率使用房价：9%；净回报率使用购入总成本：6%", function () {
      var result = math.calculateProperty(fixture());
      near(result.grossRentalYield, 9);
      near(result.netRentalYield, 6);
    });
    test("租金所得税使用正数税前净租金：税 2,520；税后 10,080", function () {
      var result = math.calculateProperty(fixture());
      near(result.estimatedIncomeTax, 2520);
      near(result.estimatedAfterTaxIncome, 10080);
    });
    test("一年期总回报计入购入税费：总收益 80；总回报率约 0.038095%", function () {
      var result = math.calculateProperty(fixture());
      near(result.marketValue, 200000);
      near(result.capitalChange, 0);
      near(result.totalReturnAmount, 80);
      near(result.totalReturnRate, 0.0380952380952381);
    });
    test("购入税费改变净收益率分母，不重复计入运营成本", function () {
      var result = math.calculateProperty(fixture({ acquisitionTaxFees: 52000 }));
      near(result.totalAcquisitionCost, 252000);
      near(result.annualOperatingExpenses, 3900);
      near(result.netRentalIncomeBeforeTax, 12600);
      near(result.grossRentalYield, 9);
      near(result.netRentalYield, 5);
    });
    test("空置不改变年度理论毛租金或毛回报率", function () {
      var result = math.calculateProperty(fixture({ vacancyMonths: 6 }));
      near(result.annualGrossRentalIncome, 18000);
      near(result.grossRentalYield, 9);
      near(result.effectiveRentalIncome, 9000);
    });

    [
      ["serviceCharge", "物业管理费"],
      ["annualPropertyTax", "房产税"],
      ["insuranceMaintenance", "保险及维修"],
      ["lettingManagementFee", "出租托管费"]
    ].forEach(function (item) {
      test(item[1] + "为年度固定金额，增加 120 后年度成本恰好增加 120", function () {
        var input = fixture();
        input[item[0]] += 120;
        var result = math.calculateProperty(input);
        near(result.annualOperatingExpenses, 4020);
        near(result.netRentalIncomeBeforeTax, 12480);
      });
    });

    test("全额空置仍支付年度费用，税前与税后均亏损 3,900", function () {
      var result = math.calculateProperty(fixture({ vacancyMonths: 12 }));
      near(result.effectiveRentalIncome, 0);
      near(result.vacancyLoss, 18000);
      near(result.netRentalIncomeBeforeTax, -3900);
      near(result.estimatedIncomeTax, 0);
      near(result.estimatedAfterTaxIncome, -3900);
      near(result.totalReturnAmount, -13900);
    });
    test("亏损不产生虚构税收抵免", function () {
      var result = math.calculateProperty(fixture({ monthlyRent: 100 }));
      near(result.effectiveRentalIncome, 1100);
      near(result.netRentalIncomeBeforeTax, -2800);
      near(result.estimatedIncomeTax, 0);
      near(result.estimatedAfterTaxIncome, -2800);
    });
    test("零租金、零费用及零税率可用", function () {
      var result = math.calculateProperty(fixture({
        monthlyRent: 0, acquisitionTaxFees: 0, serviceCharge: 0,
        annualPropertyTax: 0, insuranceMaintenance: 0, lettingManagementFee: 0,
        vacancyMonths: 0, incomeTaxRate: 0
      }));
      near(result.totalAcquisitionCost, 200000);
      near(result.annualGrossRentalIncome, 0);
      near(result.estimatedAfterTaxIncome, 0);
      near(result.totalReturnRate, 0);
    });
    test("100% 租金所得税率使正数净租金全部纳税", function () {
      var result = math.calculateProperty(fixture({ incomeTaxRate: 100 }));
      near(result.estimatedIncomeTax, 12600);
      near(result.estimatedAfterTaxIncome, 0);
    });
    test("小数空置月份可用：1.5 个月损失 2,250", function () {
      var result = math.calculateProperty(fixture({ vacancyMonths: 1.5 }));
      near(result.vacancyLoss, 2250);
      near(result.effectiveRentalIncome, 15750);
    });

    test("仅租金下降 10%：月租 1,350；有效租金 14,850；税后 8,760", function () {
      var result = math.calculateProperty(fixture(), { rentDrop: true });
      near(result.monthlyRent, 1350);
      near(result.annualGrossRentalIncome, 16200);
      near(result.effectiveRentalIncome, 14850);
      near(result.estimatedAfterTaxIncome, 8760);
      near(result.annualOperatingExpenses, 3900);
      near(result.totalAcquisitionCost, 210000);
      near(result.marketValue, 200000);
    });
    test("仅空置增加 2 个月：空置 3 个月；有效租金 13,500；税后 7,680", function () {
      var result = math.calculateProperty(fixture(), { vacancyIncrease: true });
      near(result.vacancyMonths, 3);
      near(result.effectiveRentalIncome, 13500);
      near(result.estimatedAfterTaxIncome, 7680);
      near(result.monthlyRent, 1500);
      near(result.marketValue, 200000);
    });
    test("仅市值下降 20%：市值 160,000，购入成本及全部租金现金流保持原值", function () {
      var result = math.calculateProperty(fixture(), { valueDrop: true });
      near(result.marketValue, 160000);
      near(result.capitalChange, -40000);
      near(result.price, 200000);
      near(result.totalAcquisitionCost, 210000);
      near(result.annualGrossRentalIncome, 18000);
      near(result.effectiveRentalIncome, 16500);
      near(result.annualOperatingExpenses, 3900);
      near(result.netRentalIncomeBeforeTax, 12600);
      near(result.estimatedIncomeTax, 2520);
      near(result.estimatedAfterTaxIncome, 10080);
      near(result.grossRentalYield, 9);
      near(result.netRentalYield, 6);
      near(result.totalReturnAmount, -39920);
    });
    test("组合压力测试：税后租金 6,600；总收益 -43,400", function () {
      var result = math.calculateProperty(fixture(), {
        rentDrop: true, vacancyIncrease: true, valueDrop: true
      });
      near(result.monthlyRent, 1350);
      near(result.vacancyMonths, 3);
      near(result.vacancyLoss, 4050);
      near(result.effectiveRentalIncome, 12150);
      near(result.netRentalIncomeBeforeTax, 8250);
      near(result.estimatedIncomeTax, 1650);
      near(result.estimatedAfterTaxIncome, 6600);
      near(result.totalAcquisitionCost, 210000);
      near(result.marketValue, 160000);
      near(result.totalReturnAmount, -43400);
      near(result.totalReturnRate, -20.666666666666668);
    });
    test("压力空置月份上限为 12，不出现负租金", function () {
      var result = math.calculateProperty(fixture({ vacancyMonths: 11 }), { vacancyIncrease: true });
      near(result.vacancyMonths, 12);
      near(result.effectiveRentalIncome, 0);
      near(result.estimatedAfterTaxIncome, -3900);
    });
    test("压力测试不修改输入，重复调用不叠加冲击", function () {
      var input = Object.freeze(fixture());
      var scenario = Object.freeze({ rentDrop: true, vacancyIncrease: true, valueDrop: true });
      var before = JSON.stringify(input);
      var first = math.calculateProperty(input, scenario);
      var second = math.calculateProperty(input, scenario);
      equal(JSON.stringify(input), before);
      near(first.monthlyRent, 1350);
      near(second.monthlyRent, 1350);
      near(second.marketValue, 160000);
      near(math.calculateProperty(input).estimatedAfterTaxIncome, 10080);
    });

    test("城市可自由填写，例如东京，不依赖城市专属参数", function () {
      var input = fixture({ city: "东京", name: "任意城市测试住宅" });
      equal(math.validateProperty(input).length, 0);
      near(math.calculateProperty(input).estimatedAfterTaxIncome, 10080);
    });
    test("四种币种的原币计算使用相同公式", function () {
      ["USD", "EUR", "SGD", "AED"].forEach(function (currency) {
        var input = fixture({ currency: currency });
        equal(math.validateProperty(input).length, 0);
        near(math.calculateProperty(input).netRentalYield, 6);
      });
    });
    test("浏览器数字输入中的十进制字符串可以计算", function () {
      var result = math.calculateProperty(fixture({ price: "200000", monthlyRent: "1500.00", vacancyMonths: "1" }));
      near(result.totalAcquisitionCost, 210000);
      near(result.estimatedAfterTaxIncome, 10080);
    });

    var rates = Object.freeze({ USD: 1, EUR: 1.2, SGD: 0.75, AED: 0.25 });
    test("手动汇率定义为 1 单位原币兑换的美元：100 EUR = 120 USD", function () {
      near(math.convertCurrency(100, "EUR", "USD", rates), 120);
      near(math.convertCurrency(100, "SGD", "USD", rates), 75);
      near(math.convertCurrency(100, "AED", "USD", rates), 25);
    });
    test("原币 / 目标币交叉换算：100 EUR = 160 SGD", function () {
      near(math.convertCurrency(100, "EUR", "SGD", rates), 160);
      near(math.convertCurrency(100, "USD", "EUR", rates), 83.33333333333333);
    });
    test("全部币种往返换算保持金额", function () {
      Object.keys(rates).forEach(function (from) {
        Object.keys(rates).forEach(function (to) {
          var exchanged = math.convertCurrency(12345.67, from, to, rates);
          near(math.convertCurrency(exchanged, to, from, rates), 12345.67, from + "→" + to + "→" + from);
        });
      });
    });
    test("负现金流及零金额可以换算", function () {
      near(math.convertCurrency(-3900, "EUR", "USD", rates), -4680);
      near(math.convertCurrency(0, "AED", "SGD", rates), 0);
    });
    test("不同币种物业在同一美元基准下可比较", function () {
      var result = math.calculateProperty(fixture({ currency: "EUR" }));
      near(math.convertCurrency(result.totalAcquisitionCost, "EUR", "USD", rates), 252000);
      near(math.convertCurrency(result.estimatedAfterTaxIncome, "EUR", "USD", rates), 12096);
      near(result.netRentalYield, 6);
    });
    test("缺少参与换算的原币或目标币汇率时拒绝换算", function () {
      throws(function () { math.convertCurrency(100, "EUR", "USD", { USD: 1 }); });
      throws(function () { math.convertCurrency(100, "USD", "SGD", { USD: 1 }); });
    });
    test("零、负数及非有限汇率不可用于换算", function () {
      [0, -1, NaN, Infinity, null, ""].forEach(function (rate) {
        throws(function () { math.convertCurrency(100, "EUR", "USD", { USD: 1, EUR: rate }); });
        throws(function () { math.convertCurrency(100, "USD", "EUR", { USD: 1, EUR: rate }); });
      });
    });
    test("USD 汇率基准必须为 1", function () {
      throws(function () { math.convertCurrency(100, "EUR", "SGD", { USD: 2, EUR: 1.2, SGD: 0.75 }); });
      throws(function () { math.convertCurrency(100, "EUR", "SGD", { EUR: 1.2, SGD: 0.75 }); });
    });
    test("NaN 或无穷金额及未知币种不进入比较结果", function () {
      [NaN, Infinity, -Infinity].forEach(function (amount) {
        throws(function () { math.convertCurrency(amount, "USD", "EUR", rates); });
      });
      throws(function () { math.convertCurrency(100, "GBP", "USD", rates); });
    });
    test("汇率换算发生数值溢出时拒绝显示结果", function () {
      throws(function () { math.convertCurrency(Number.MAX_VALUE, "EUR", "USD", { USD: 1, EUR: 2 }); });
    });

    test("城市和物业名称不能为空或只包含空格", function () {
      rejectsProperty({ city: "" }, "city");
      rejectsProperty({ city: "   " }, "city");
      rejectsProperty({ name: "" }, "name");
      rejectsProperty({ name: "   " }, "name");
    });
    test("不支持的币种应给出校验错误", function () {
      rejectsProperty({ currency: "GBP" }, "currency");
    });
    test("购入房价和面积必须大于零", function () {
      rejectsProperty({ price: 0 }, "price");
      rejectsProperty({ area: 0 }, "area");
    });
    test("空置月份不得超过 12，税率不得超过 100%", function () {
      rejectsProperty({ vacancyMonths: 12.01 }, "vacancyMonths");
      rejectsProperty({ incomeTaxRate: 100.01 }, "incomeTaxRate");
    });

    ["price", "area", "monthlyRent", "acquisitionTaxFees", "serviceCharge",
      "annualPropertyTax", "insuranceMaintenance", "lettingManagementFee", "vacancyMonths", "incomeTaxRate"
    ].forEach(function (field) {
      test(field + " 拒绝负数、空白和非有限值", function () {
        [-1, "", "  ", null, NaN, Infinity, -Infinity].forEach(function (invalid) {
          var override = {};
          override[field] = invalid;
          rejectsProperty(override, field);
        });
      });
    });
    test("数值字段拒绝布尔值、数组及无法解析的文字", function () {
      [true, false, [], [1000], "不是数字"].forEach(function (invalid) {
        rejectsProperty({ monthlyRent: invalid }, "monthlyRent");
      });
    });
    test("购入成本或年度租金溢出时拒绝计算", function () {
      throws(function () { math.calculateProperty(fixture({ price: Number.MAX_VALUE, acquisitionTaxFees: Number.MAX_VALUE })); });
      throws(function () { math.calculateProperty(fixture({ monthlyRent: Number.MAX_VALUE })); });
    });

    var passed = results.filter(function (result) { return result.passed; }).length;
    return { passed: passed, failed: results.length - passed, results: results };
  }

  return { runTests: runTests };
}));
