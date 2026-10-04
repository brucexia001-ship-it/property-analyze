(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PropertyMath = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CURRENCIES = Object.freeze(["USD", "EUR", "SGD", "AED"]);
  var NUMBER_FIELDS = [
    { field: "price", label: "购买价格", minimum: 0, exclusiveMinimum: true },
    { field: "area", label: "房产面积", minimum: 0, exclusiveMinimum: true },
    { field: "monthlyRent", label: "月租金", minimum: 0 },
    { field: "acquisitionTaxFees", label: "购入税费", minimum: 0 },
    { field: "serviceCharge", label: "年度物业管理费", minimum: 0 },
    { field: "annualPropertyTax", label: "年度房产税", minimum: 0 },
    { field: "insuranceMaintenance", label: "年度保险及维修费用", minimum: 0 },
    { field: "lettingManagementFee", label: "年度出租托管费用", minimum: 0 },
    { field: "vacancyMonths", label: "年度空置月份", minimum: 0, maximum: 12 },
    { field: "incomeTaxRate", label: "租金所得税率", minimum: 0, maximum: 100 }
  ];

  // Reject blanks and coercions such as null, false, or arrays. Decimal strings
  // are accepted so the same API can consume browser form values and JSON data.
  function toNumber(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
    if (typeof value !== "string") return NaN;
    var text = value.trim();
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) return NaN;
    var number = Number(text);
    return Number.isFinite(number) ? number : NaN;
  }

  function validateProperty(property) {
    var errors = [];
    if (!property || typeof property !== "object" || Array.isArray(property)) {
      return [{ field: "property", message: "房产数据必须是一个有效对象。" }];
    }
    [
      { field: "city", label: "城市" },
      { field: "name", label: "物业名称" }
    ].forEach(function (item) {
      if (typeof property[item.field] !== "string" || !property[item.field].trim()) {
        errors.push({ field: item.field, message: "请填写" + item.label + "。" });
      }
    });
    if (CURRENCIES.indexOf(property.currency) === -1) {
      errors.push({ field: "currency", message: "币种请选择 USD、EUR、SGD 或 AED。" });
    }
    NUMBER_FIELDS.forEach(function (item) {
      var value = toNumber(property[item.field]);
      if (!Number.isFinite(value)) {
        errors.push({ field: item.field, message: item.label + "必须填写有效数字。" });
      } else if (item.exclusiveMinimum && value <= item.minimum) {
        errors.push({ field: item.field, message: item.label + "必须大于 " + item.minimum + "。" });
      } else if (value < item.minimum || (item.maximum !== undefined && value > item.maximum)) {
        var bounds = item.maximum === undefined
          ? "不能小于 " + item.minimum
          : "必须在 " + item.minimum + " 至 " + item.maximum + " 之间";
        errors.push({ field: item.field, message: item.label + bounds + "。" });
      }
    });
    return errors;
  }

  function finite(value, label) {
    if (!Number.isFinite(value)) {
      throw new Error(label + "计算结果超出可处理范围，请缩小输入数值。");
    }
    return value;
  }

  function calculateProperty(property, scenario) {
    var errors = validateProperty(property);
    if (errors.length) {
      var error = new Error(errors.map(function (item) { return item.message; }).join(" "));
      error.validationErrors = errors;
      throw error;
    }
    scenario = scenario || {};
    var values = {};
    NUMBER_FIELDS.forEach(function (item) { values[item.field] = toNumber(property[item.field]); });

    var price = values.price;
    var monthlyRent = finite(values.monthlyRent * (scenario.rentDrop === true ? 0.9 : 1), "月租金");
    var vacancyMonths = Math.min(12, values.vacancyMonths + (scenario.vacancyIncrease === true ? 2 : 0));
    var totalAcquisitionCost = finite(price + values.acquisitionTaxFees, "购入总成本");
    var annualGrossRentalIncome = finite(monthlyRent * 12, "年度理论毛租金");
    var effectiveRentalIncome = finite(monthlyRent * (12 - vacancyMonths), "有效租金");
    var vacancyLoss = finite(monthlyRent * vacancyMonths, "空置损失");
    var expenses = {
      serviceCharge: values.serviceCharge,
      annualPropertyTax: values.annualPropertyTax,
      insuranceMaintenance: values.insuranceMaintenance,
      lettingManagementFee: values.lettingManagementFee
    };
    var annualOperatingExpenses = finite(
      expenses.serviceCharge + expenses.annualPropertyTax + expenses.insuranceMaintenance + expenses.lettingManagementFee,
      "年度运营成本"
    );
    var netRentalIncomeBeforeTax = finite(effectiveRentalIncome - annualOperatingExpenses, "年度税前净租金");
    var estimatedIncomeTax = finite(Math.max(netRentalIncomeBeforeTax, 0) * (values.incomeTaxRate / 100), "预估租金所得税");
    var estimatedAfterTaxIncome = finite(netRentalIncomeBeforeTax - estimatedIncomeTax, "简化税后净收入");
    var marketValue = finite(price * (scenario.valueDrop === true ? 0.8 : 1), "房产市场价值");
    var capitalChange = finite(marketValue - price, "资产价值变化");
    // One-year holding-period total return includes acquisition fees and the
    // unrealized change in property value. No mortgage or selling costs apply.
    var totalReturnAmount = finite(estimatedAfterTaxIncome + marketValue - totalAcquisitionCost, "一年总回报金额");

    return {
      totalAcquisitionCost: totalAcquisitionCost,
      annualGrossRentalIncome: annualGrossRentalIncome,
      effectiveRentalIncome: effectiveRentalIncome,
      grossRentalYield: finite(annualGrossRentalIncome / price * 100, "毛租金回报率"),
      annualOperatingExpenses: annualOperatingExpenses,
      netRentalIncomeBeforeTax: netRentalIncomeBeforeTax,
      netRentalYield: finite(netRentalIncomeBeforeTax / totalAcquisitionCost * 100, "税前净回报率"),
      estimatedIncomeTax: estimatedIncomeTax,
      estimatedAfterTaxIncome: estimatedAfterTaxIncome,
      vacancyLoss: vacancyLoss,
      monthlyRent: monthlyRent,
      vacancyMonths: vacancyMonths,
      marketValue: marketValue,
      capitalChange: capitalChange,
      totalReturnAmount: totalReturnAmount,
      totalReturnRate: finite(totalReturnAmount / totalAcquisitionCost * 100, "一年总回报率"),
      price: price,
      acquisitionTaxFees: values.acquisitionTaxFees,
      expenses: expenses
    };
  }

  function convertCurrency(amount, from, to, rates) {
    var value = toNumber(amount);
    if (!Number.isFinite(value)) throw new Error("换算金额必须是有效数字。");
    if (CURRENCIES.indexOf(from) === -1 || CURRENCIES.indexOf(to) === -1) {
      throw new Error("换算币种请选择 USD、EUR、SGD 或 AED。");
    }
    if (!rates || typeof rates !== "object" || Array.isArray(rates) || toNumber(rates.USD) !== 1) {
      throw new Error("请设置以美元为基准的汇率，USD 汇率必须为 1。");
    }
    var fromRate = toNumber(rates[from]);
    var toRate = toNumber(rates[to]);
    if (!Number.isFinite(fromRate) || fromRate <= 0 || !Number.isFinite(toRate) || toRate <= 0) {
      throw new Error("请填写 " + from + " 和 " + to + " 对美元的有效正数汇率。");
    }
    if (from === to) return value;
    return finite(value * fromRate / toRate, "货币换算");
  }

  return {
    CURRENCIES: CURRENCIES,
    validateProperty: validateProperty,
    calculateProperty: calculateProperty,
    convertCurrency: convertCurrency
  };
});
