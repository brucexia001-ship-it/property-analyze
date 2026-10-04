(function () {
  "use strict";

  const math = window.PropertyMath;
  const STORAGE_KEY = "property-analyzer-v01";
  const fields = ["city", "name", "currency", "price", "area", "monthlyRent", "acquisitionTaxFees", "serviceCharge", "annualPropertyTax", "insuranceMaintenance", "lettingManagementFee", "vacancyMonths", "incomeTaxRate"];
  const scenarioKeys = ["rentDrop", "vacancyIncrease", "valueDrop"];
  const metrics = [
    ["totalAcquisitionCost", "购入总成本", "Total Acquisition Cost"],
    ["annualGrossRentalIncome", "年度理论毛租金", "Annual Gross Rental Income"],
    ["effectiveRentalIncome", "有效租金", "Effective Rental Income"],
    ["grossRentalYield", "毛租金回报率", "Gross Rental Yield", true],
    ["annualOperatingExpenses", "年度运营成本", "Annual Operating Expenses"],
    ["netRentalIncomeBeforeTax", "年度税前净租金", "Net Rental Income Before Tax"],
    ["netRentalYield", "税前净回报率", "Net Rental Yield", true],
    ["estimatedAfterTaxIncome", "简化税后净收入", "Estimated After-tax Income"]
  ];
  const numberFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const conciseFormat = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const num = (value) => numberFormat.format(value);
  const pct = (value) => num(value) + "%";
  const money = (value, currency) => currency + " " + num(value);
  const signClass = (value) => value < 0 ? "negative" : "positive";
  const defaultState = () => ({ version: 1, properties: clone(window.PropertyExamples.properties), rates: clone(window.PropertyExamples.rates), comparisonCurrency: "USD", scenario: { rentDrop: false, vacancyIncrease: false, valueDrop: false }, selectedId: window.PropertyExamples.properties[0].id });
  let restoreMessage = "演示数据已载入";
  let state = loadState();
  let toastTimer;

  function newId() {
    return "property-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function parseDocument(data, allowDraft) {
    if (!data || data.version !== 1 || !Array.isArray(data.properties) || !data.properties.length || data.properties.length > 1000) {
      throw new Error("文件必须是 V0.1 导出的数据，且包含 1 至 1000 套房产。");
    }
    if (!math.CURRENCIES.includes(data.comparisonCurrency) || !data.rates || data.rates.USD !== 1 || !data.scenario || scenarioKeys.some((key) => typeof data.scenario[key] !== "boolean")) {
      throw new Error("比较币种、汇率基准或情景设置无效。");
    }
    const properties = data.properties.map((source, index) => {
      if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("房产数据格式无效。");
      const property = { id: newId(), isDemo: source.isDemo === true };
      fields.forEach((field) => {
        const value = source[field];
        if (field === "city" || field === "name" || field === "currency") {
          if (typeof value !== "string" || value.length > 1000) throw new Error("房产文字字段无效。");
        } else if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && value.length > 100)) {
          throw new Error("房产数值字段无效。");
        }
        property[field] = value;
      });
      if (!allowDraft) {
        try { math.calculateProperty(property); } catch (error) { throw new Error("第 " + (index + 1) + " 套房产：" + error.message); }
      }
      return property;
    });
    const rates = { USD: 1 };
    ["EUR", "SGD", "AED"].forEach((currency) => {
      const value = data.rates[currency];
      if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && value.length > 100)) throw new Error("汇率格式无效。");
      rates[currency] = value;
      if (!allowDraft) math.convertCurrency(1, currency, "USD", rates);
    });
    const selectedIndex = data.properties.findIndex((property) => property.id === data.selectedId);
    return { version: 1, properties, rates, comparisonCurrency: data.comparisonCurrency, scenario: Object.fromEntries(scenarioKeys.map((key) => [key, data.scenario[key]])), selectedId: properties[Math.max(selectedIndex, 0)].id };
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const restored = parseDocument(JSON.parse(saved), true);
        restoreMessage = "已恢复本机数据";
        return restored;
      }
    } catch (error) {
      restoreMessage = "本机存储不可用或数据无效 · 请用导出备份";
    }
    return defaultState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      $("save-status").textContent = "✓ 已保存到本机";
    } catch (error) {
      $("save-status").textContent = "未能自动保存 · 请导出备份";
    }
  }

  function toast(message) {
    clearTimeout(toastTimer);
    $("toast").textContent = message;
    $("toast").hidden = false;
    toastTimer = setTimeout(() => { $("toast").hidden = true; }, 6000);
  }

  function selectedProperty() {
    return state.properties.find((property) => property.id === state.selectedId) || state.properties[0];
  }

  function calculation(property) {
    try { return { value: math.calculateProperty(property, state.scenario) }; }
    catch (error) { return { error: error.message }; }
  }

  function converted(value, from) {
    try { return money(math.convertCurrency(value, from, state.comparisonCurrency, state.rates), state.comparisonCurrency); }
    catch (error) { return "—"; }
  }

  function conversionError(from) {
    try { math.convertCurrency(1, from, state.comparisonCurrency, state.rates); return ""; }
    catch (error) { return error.message; }
  }

  function scenarioActive() { return scenarioKeys.some((key) => state.scenario[key]); }
  function propertyTitle(property) { return property.name.trim() || "未命名房产"; }

  function renderSidebar() {
    $("sidebar-count").textContent = state.properties.length;
    $("property-list").innerHTML = state.properties.map((property) => `<button type="button" class="property-button ${property.id === state.selectedId ? "active" : ""}" data-select="${esc(property.id)}" aria-pressed="${property.id === state.selectedId}"><span class="property-button-name">${esc(propertyTitle(property))}</span><span class="property-button-meta">${esc(property.city.trim() || "待填写城市")} · ${esc(property.currency)}</span></button>`).join("");
  }

  function renderComparison() {
    const rows = state.properties.map((property) => ({ property, ...calculation(property) }));
    $("comparison-table").style.setProperty("--property-count", state.properties.length);
    $("comparison-description").textContent = state.properties.length + " 套房产 · " + state.comparisonCurrency + " 统一比较 · " + (scenarioActive() ? "压力情景" : "基础情景");
    $("scenario-label").textContent = scenarioActive() ? "压力情景 · 所有房产同步应用" : "基础情景 · 全年持有";
    $("demo-notice").hidden = !state.properties.some((property) => property.isDemo);
    $("summary-grid").innerHTML = rows.map(({ property, value, error }) => `<button type="button" class="property-card ${property.id === state.selectedId ? "selected" : ""}" data-select="${esc(property.id)}" aria-pressed="${property.id === state.selectedId}">
      <span class="card-top"><span class="city-tag">${esc(property.city.trim() || "待填写城市")} · ${esc(property.currency)}</span>${property.isDemo ? '<span class="demo-tag">演示</span>' : ""}</span>
      <span class="card-title">${esc(propertyTitle(property))}</span><span class="yield-label">税前净回报率 <small>Net Rental Yield</small></span>
      <span class="yield-value ${value ? signClass(value.netRentalYield) : ""}">${value ? pct(value.netRentalYield) : "—"}</span>
      <span class="card-details"><span class="card-detail"><span class="card-detail-label">购入总成本</span><span class="card-detail-value">${value ? converted(value.totalAcquisitionCost, property.currency) : "—"}</span></span><span class="card-detail"><span class="card-detail-label">年度税后净收入</span><span class="card-detail-value ${value ? signClass(value.estimatedAfterTaxIncome) : ""}">${value ? converted(value.estimatedAfterTaxIncome, property.currency) : "—"}</span></span></span>
      <span class="card-footer">${error ? "请补全或修正输入" : conversionError(property.currency) ? "请修正手动汇率" : `${conciseFormat.format(Number(property.area))} m² · 空置 ${conciseFormat.format(value.vacancyMonths)} 月 / 年`}<span>查看测算 ↗</span></span></button>`).join("");
    const allMetrics = metrics.concat([
      ["marketValue", "年末市场估值", "Estimated Market Value"],
      ["totalReturnAmount", "首年总回报金额", "含购入税费与未实现估值变化"],
      ["totalReturnRate", "首年总回报率", "Total Return · 含购入税费", true]
    ]);
    $("comparison-table").innerHTML = `<caption class="sr-only">所有金额按手动汇率统一换算为 ${state.comparisonCurrency}；回报率保持原币计算结果。</caption><thead><tr><th scope="col">分析指标 <small>Annual metrics</small></th>${rows.map(({ property, error }) => `<th scope="col"><button type="button" class="table-property" data-select="${esc(property.id)}">${esc(propertyTitle(property))}</button><small>${esc(property.city)} · ${error ? "输入待修正" : state.comparisonCurrency}</small></th>`).join("")}</tr></thead><tbody>${allMetrics.map(([key, label, english, percent]) => `<tr${key === "marketValue" ? ' class="valuation-row"' : ""}><th scope="row">${label}<small>${english}</small></th>${rows.map(({ property, value, error }) => {
      let display = "—";
      let issue = error || "";
      if (value) {
        if (percent) display = pct(value[key]);
        else {
          try { display = money(math.convertCurrency(value[key], property.currency, state.comparisonCurrency, state.rates), state.comparisonCurrency); }
          catch (problem) { issue = problem.message; }
        }
      }
      const isIncome = ["netRentalIncomeBeforeTax", "netRentalYield", "estimatedAfterTaxIncome", "totalReturnAmount", "totalReturnRate"].includes(key);
      return `<td class="${issue ? "invalid-cell" : isIncome ? signClass(value[key]) : ""}"${issue ? ` title="${esc(issue)}"` : ""}>${display}${issue ? '<small>输入待修正</small>' : ""}</td>`;
    }).join("")}</tr>`).join("")}</tbody>`;
  }

  function updateValidation() {
    const property = selectedProperty();
    const errors = math.validateProperty(property);
    fields.forEach((field) => {
      const issue = errors.find((error) => error.field === field);
      $(field).setAttribute("aria-invalid", issue ? "true" : "false");
      $("error-" + field).textContent = issue ? issue.message : "";
    });
    $("selected-name").textContent = propertyTitle(property);
    $("selected-currency").textContent = property.currency;
    document.querySelectorAll("[data-currency-unit]").forEach((element) => { element.textContent = property.currency; });
    ["EUR", "SGD", "AED"].forEach((currency) => {
      let message = "";
      try { math.convertCurrency(1, currency, "USD", state.rates); } catch (error) { message = "请填写大于 0 的有效汇率"; }
      $("rate-" + currency).setAttribute("aria-invalid", message ? "true" : "false");
      $("rate-error-" + currency).textContent = message;
    });
  }

  function fillForm() {
    const property = selectedProperty();
    fields.forEach((field) => { $(field).value = property[field]; });
  }

  function fillSettings() {
    $("comparison-currency").value = state.comparisonCurrency;
    ["EUR", "SGD", "AED"].forEach((currency) => { $("rate-" + currency).value = state.rates[currency]; });
    document.querySelectorAll("[data-scenario]").forEach((input) => { input.checked = state.scenario[input.dataset.scenario]; });
  }

  function renderResults() {
    const property = selectedProperty();
    const { value, error } = calculation(property);
    if (error) {
      $("property-results").innerHTML = `<div class="panel-header"><h3>自动测算</h3><span class="scenario-label">等待有效输入</span></div><div class="panel-body empty-state"><span class="method-number">…</span><h3>补全输入，即可查看分析</h3><p>${esc(error)}</p><p class="hint">费用为零时请填写 0；缺失或无效的数字不会参与计算。其他有效房产仍可比较。</p></div>`;
      return;
    }
    const m = (amount) => money(amount, property.currency);
    const formulas = {
      totalAcquisitionCost: "购买价格 + 购入税费 = " + num(value.price) + " + " + num(value.acquisitionTaxFees),
      annualGrossRentalIncome: "情景月租金 × 12 = " + num(value.monthlyRent) + " × 12",
      effectiveRentalIncome: "情景月租金 ×（12 − 空置月数）= " + num(value.monthlyRent) + " ×（12 − " + conciseFormat.format(value.vacancyMonths) + "）",
      grossRentalYield: "理论毛租金 ÷ 购买价格 × 100% = " + num(value.annualGrossRentalIncome) + " ÷ " + num(value.price) + " × 100%",
      annualOperatingExpenses: "物业管理费 + 房产税 + 保险维修 + 出租托管费",
      netRentalIncomeBeforeTax: "有效租金 − 年度运营成本 = " + num(value.effectiveRentalIncome) + " − " + num(value.annualOperatingExpenses),
      netRentalYield: "税前净租金 ÷ 购入总成本 × 100% = " + num(value.netRentalIncomeBeforeTax) + " ÷ " + num(value.totalAcquisitionCost) + " × 100%",
      estimatedAfterTaxIncome: "税前净租金 − max（税前净租金，0）× 所得税率 " + conciseFormat.format(Number(property.incomeTaxRate)) + "%"
    };
    const expenseNames = { serviceCharge: "物业管理费 / Service Charge", annualPropertyTax: "年度房产税", insuranceMaintenance: "保险及维修费用", lettingManagementFee: "出租托管费用" };
    let stress = "";
    if (scenarioActive()) {
      try {
        const base = math.calculateProperty(property);
        stress = `<div class="stress-summary"><h4>压力情景相对基础情景</h4><div class="result-row"><span>税后年收入变化</span><strong class="${signClass(value.estimatedAfterTaxIncome - base.estimatedAfterTaxIncome)}">${m(value.estimatedAfterTaxIncome - base.estimatedAfterTaxIncome)}</strong></div><div class="result-row"><span>资产价值变化</span><strong class="${signClass(value.capitalChange)}">${m(value.capitalChange)}</strong></div><p class="hint">基础税前净回报率 ${pct(base.netRentalYield)} · 当前 ${pct(value.netRentalYield)}。购入总成本始终为 ${m(value.totalAcquisitionCost)}。</p></div>`;
      } catch (baselineError) {
        stress = `<div class="stress-summary"><h4>基础情景无法比较</h4><p>${esc(baselineError.message)} 当前压力情景结果仍可查看。</p></div>`;
      }
    }
    $("property-results").innerHTML = `<div class="panel-header"><h3>自动测算 <small>原币 ${property.currency}</small></h3><span class="scenario-label">${scenarioActive() ? "压力情景" : "基础情景"}</span></div><div class="panel-body">
      <div class="result-highlight"><span class="result-label">税前净回报率 / Net Rental Yield</span><strong class="result-hero ${signClass(value.netRentalYield)}">${pct(value.netRentalYield)}</strong><span class="result-subtitle">以购入总成本为分母 · 年度租金现金流</span></div>
      <div class="result-list">${metrics.map(([key, label, english, percent]) => `<div class="result-row"><div class="result-name">${label}<small>${english}</small><p class="formula-text">${formulas[key]}</p></div><strong class="result-value ${["netRentalIncomeBeforeTax", "netRentalYield", "estimatedAfterTaxIncome"].includes(key) ? signClass(value[key]) : ""}">${percent ? pct(value[key]) : m(value[key])}</strong></div>`).join("")}</div>
      <details open><summary>年度费用明细</summary><div class="expense-list">${Object.entries(value.expenses).map(([key, amount]) => `<div class="result-row"><span>${expenseNames[key]}</span><span>${m(amount)}</span></div>`).join("")}<div class="result-row"><strong>运营成本合计</strong><strong>${m(value.annualOperatingExpenses)}</strong></div></div><p class="hint">另计：空置损失 ${m(value.vacancyLoss)}；预估租金所得税 ${m(value.estimatedIncomeTax)}。两者不重复计入运营成本。</p></details>
      <div class="stress-summary"><h4>资产估值与首年总回报</h4><div class="result-row"><span>年末市场估值</span><strong>${m(value.marketValue)}</strong></div><div class="result-row"><span>首年总回报金额</span><strong class="${signClass(value.totalReturnAmount)}">${m(value.totalReturnAmount)}</strong></div><div class="result-row"><span>首年总回报率</span><strong class="${signClass(value.totalReturnRate)}">${pct(value.totalReturnRate)}</strong></div><p class="formula-text">${num(value.estimatedAfterTaxIncome)} + ${num(value.marketValue)} − ${num(value.totalAcquisitionCost)} = ${num(value.totalReturnAmount)} ${property.currency}</p><p class="hint">总回报率 = 总回报金额 ÷ 购入总成本 × 100%。含一次性购入税费及未实现的估值变化；估值基准为原购买价格。</p></div>${stress}
    </div>`;
  }

  function render() {
    renderSidebar();
    renderComparison();
    updateValidation();
    renderResults();
    $("delete-property").disabled = state.properties.length <= 1;
  }

  function selectProperty(id, scroll) {
    if (!state.properties.some((property) => property.id === id)) return;
    state.selectedId = id;
    fillForm();
    render();
    saveState();
    if (scroll) $("property-editor").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addProperty() {
    const property = { id: newId(), city: "", name: "新房产 " + (state.properties.length + 1), currency: "USD", price: "", area: "", monthlyRent: "", acquisitionTaxFees: 0, serviceCharge: 0, annualPropertyTax: 0, insuranceMaintenance: 0, lettingManagementFee: 0, vacancyMonths: 0, incomeTaxRate: 0, isDemo: false };
    state.properties.push(property);
    selectProperty(property.id, true);
    $("city").focus({ preventScroll: true });
    toast("新房产已添加，请填写城市、价格、面积和月租金。");
  }

  $("property-form").addEventListener("submit", (event) => event.preventDefault());
  $("property-form").addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    if (!fields.includes(field)) return;
    selectedProperty()[field] = event.target.value;
    render();
    saveState();
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-select]");
    if (button) selectProperty(button.dataset.select, true);
  });
  document.querySelectorAll(".nav-link").forEach((link) => link.addEventListener("click", () => {
    document.querySelectorAll(".nav-link").forEach((other) => other.classList.toggle("active", other === link));
  }));
  $("comparison-currency").addEventListener("change", (event) => {
    state.comparisonCurrency = event.target.value;
    render();
    saveState();
  });
  document.querySelectorAll("[data-rate]").forEach((input) => input.addEventListener("input", () => {
    state.rates[input.dataset.rate] = input.value;
    render();
    saveState();
  }));
  document.querySelectorAll("[data-scenario]").forEach((input) => input.addEventListener("change", () => {
    state.scenario[input.dataset.scenario] = input.checked;
    render();
    saveState();
  }));
  $("reset-scenario").addEventListener("click", () => {
    scenarioKeys.forEach((key) => { state.scenario[key] = false; });
    fillSettings();
    render();
    saveState();
  });
  $("add-property").addEventListener("click", addProperty);
  $("sidebar-add").addEventListener("click", addProperty);
  $("duplicate-property").addEventListener("click", () => {
    const property = clone(selectedProperty());
    property.id = newId();
    property.name = propertyTitle(property) + " · 副本";
    state.properties.push(property);
    selectProperty(property.id, true);
    toast("房产已复制，可修改后比较。");
  });
  $("delete-property").addEventListener("click", () => {
    if (state.properties.length <= 1) return;
    if (!window.confirm("删除“" + propertyTitle(selectedProperty()) + "”？此操作无法撤销；可先导出备份。")) return;
    const index = state.properties.findIndex((property) => property.id === state.selectedId);
    state.properties.splice(index, 1);
    selectProperty(state.properties[Math.min(index, state.properties.length - 1)].id, false);
    toast("房产已删除。");
  });
  $("export-data").addEventListener("click", () => {
    const documentData = { ...clone(state), exportedAt: new Date().toISOString(), note: "isDemo=true 的房产为虚构演示数据；初始汇率亦为演示值。" };
    const blob = new Blob([JSON.stringify(documentData, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "property-analyzer-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("备份已导出，未完成的输入也会保留。");
  });
  $("import-data").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("文件超过 2 MB，请使用较小的 V0.1 JSON 备份。");
      const imported = parseDocument(JSON.parse(await file.text()), true);
      if (!window.confirm("导入 " + imported.properties.length + " 套房产并替换当前数据？建议先导出当前数据作为备份。")) return;
      state = imported;
      fillForm();
      fillSettings();
      render();
      saveState();
      toast("数据已导入，全部测算已更新。");
    } catch (error) { toast("导入失败：" + error.message); }
    finally { event.target.value = ""; }
  });

  fillForm();
  fillSettings();
  render();
  $("save-status").textContent = restoreMessage;
})();
