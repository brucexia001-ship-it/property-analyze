(function (root, factory) {
  "use strict";
  var examples = factory();
  if (typeof module === "object" && module.exports) module.exports = examples;
  else root.PropertyExamples = examples;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // All properties, prices, rents, fees, tax rates, and exchange rates below
  // are fictitious editable demonstration data, not current market data.
  return {
    properties: [
      {
        id: "demo-dubai",
        city: "迪拜",
        name: "海湾花园公寓（虚构示例）",
        currency: "AED",
        price: 1200000,
        area: 80,
        monthlyRent: 8000,
        acquisitionTaxFees: 60000,
        serviceCharge: 16000,
        annualPropertyTax: 1200,
        insuranceMaintenance: 5000,
        lettingManagementFee: 4800,
        vacancyMonths: 1,
        incomeTaxRate: 5,
        isDemo: true
      },
      {
        id: "demo-barcelona",
        city: "巴塞罗那",
        name: "阳光街住宅（虚构示例）",
        currency: "EUR",
        price: 320000,
        area: 70,
        monthlyRent: 1500,
        acquisitionTaxFees: 35000,
        serviceCharge: 1800,
        annualPropertyTax: 900,
        insuranceMaintenance: 1400,
        lettingManagementFee: 900,
        vacancyMonths: 0.5,
        incomeTaxRate: 20,
        isDemo: true
      },
      {
        id: "demo-singapore",
        city: "新加坡",
        name: "绿岸公寓（虚构示例）",
        currency: "SGD",
        price: 1100000,
        area: 65,
        monthlyRent: 3800,
        acquisitionTaxFees: 110000,
        serviceCharge: 4200,
        annualPropertyTax: 3000,
        insuranceMaintenance: 2200,
        lettingManagementFee: 2280,
        vacancyMonths: 1,
        incomeTaxRate: 15,
        isDemo: true
      }
    ],
    // One unit of the specified currency equals this many USD.
    rates: { USD: 1, EUR: 1.1, SGD: 0.75, AED: 0.27 }
  };
});
