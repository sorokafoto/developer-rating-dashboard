/* Внутренний sales-enablement дашборд. Спека: ../docs/dashboard-prd.md */
(function () {
  "use strict";

  var PLANNED_APPLICATIONS = 21;
  var APPLICATIONS_QUORUM = 11;
  var CFG = window.APP_CONFIG || {};
  var STUDY_PERIOD = { from: "2026-06-02", to: "2026-06-08", label: "2–8 июня 2026" };
  var PERIOD_LABEL = "II квартал 2026";

  var state = {
    developers: [],
    market: null,
    meta: null,
    phonesData: null,
    companyEvents: null,
    companyEventsLoading: false,
    period: "2026-Q2",
    query: "",
    company: null,
    tab: "overview",
    expandedAppId: null,
    appSort: { key: "submitted_at", dir: "asc" },
    searchOpen: false,
    highlightIndex: -1,
  };

  var els = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    if (CFG.accentColor) {
      document.documentElement.style.setProperty("--accent", CFG.accentColor);
    }
    bindEvents();
    loadPhones();
    loadData();
    parseUrl();
  }

  function cacheElements() {
    els.search = document.getElementById("company-search");
    els.results = document.getElementById("search-results");
    els.searchEmpty = document.getElementById("search-empty");
    els.combobox = document.getElementById("company-combobox");
    els.searchChips = document.getElementById("search-chips");
    els.searchClear = document.getElementById("search-clear");
    els.searchToggle = document.getElementById("search-toggle");
    els.periodSelect = document.getElementById("period-select");
    els.phonesPanel = document.getElementById("phones-panel");
    els.phonesSummary = document.getElementById("phones-summary");
    els.phonesApplication = document.getElementById("phones-application");
    els.phonesVerification = document.getElementById("phones-verification");
    els.phonesAppCount = document.getElementById("phones-app-count");
    els.phonesVerifyCount = document.getElementById("phones-verify-count");
    els.btnCopyPhones = document.getElementById("btn-copy-phones");
    els.phonesCopyStatus = document.getElementById("phones-copy-status");
    els.panelSearch = document.getElementById("panel-search");
    els.panelPresent = document.getElementById("panel-present");
    els.presentCompany = document.getElementById("present-company");
    els.presentSite = document.getElementById("present-site");
    els.presentPeriod = document.getElementById("present-period");
    els.bannerInsufficient = document.getElementById("banner-insufficient");
    els.kpiGrid = document.getElementById("kpi-grid");
    els.execSummary = document.getElementById("exec-summary");
    els.channelChart = document.getElementById("channel-chart");
    els.touchesBlock = document.getElementById("touches-block");
    els.diagnostics = document.getElementById("diagnostics");
    els.ctaText = document.getElementById("cta-text");
    els.applicationsSummary = document.getElementById("applications-summary");
    els.applicationsEmpty = document.getElementById("applications-empty");
    els.applicationsTable = document.getElementById("applications-table");
    els.tabButtons = document.querySelectorAll(".dash-tabs__btn");
    els.tabPanels = document.querySelectorAll(".dash-tabpanel");
  }

  function bindEvents() {
    var debounceTimer;

    els.search.addEventListener("input", function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        state.query = els.search.value.trim();
        state.highlightIndex = -1;
        openSearchMenu();
        renderSearchResults();
        updateClearButton();
      }, 120);
    });

    els.search.addEventListener("focus", function () {
      openSearchMenu();
      renderSearchResults();
    });

    els.search.addEventListener("keydown", onSearchKeydown);

    if (els.searchClear) {
      els.searchClear.addEventListener("click", function (e) {
        e.stopPropagation();
        clearCompanySelection();
      });
    }

    if (els.searchToggle) {
      els.searchToggle.addEventListener("click", function (e) {
        e.stopPropagation();
        if (state.searchOpen) closeSearchMenu();
        else {
          els.search.focus();
          openSearchMenu();
          renderSearchResults();
        }
      });
    }

    document.addEventListener("click", function (e) {
      if (!els.combobox || !els.combobox.contains(e.target)) closeSearchMenu();
    });

    els.tabButtons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setTab(btn.getAttribute("data-tab"));
      });
    });

    if (els.periodSelect) {
      els.periodSelect.addEventListener("change", function () {
        state.period = els.periodSelect.value;
        renderPhones();
        if (state.company) renderCompanyHeader();
      });
    }

    if (els.btnCopyPhones) {
      els.btnCopyPhones.addEventListener("click", copyPhonesForClient);
    }
  }

  function loadPhones() {
    fetch("measurement-phones.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        state.phonesData = data;
        renderPhones();
      })
      .catch(function () {
        if (els.phonesPanel) els.phonesPanel.hidden = true;
      });
  }

  function periodPhones() {
    if (!state.phonesData || !state.phonesData.periods) return null;
    return state.phonesData.periods[state.period] || null;
  }

  function renderPhones() {
    var p = periodPhones();
    if (!els.phonesPanel) return;
    if (!p) {
      els.phonesPanel.hidden = true;
      return;
    }
    els.phonesPanel.hidden = false;

    els.phonesAppCount.textContent = "(" + (p.counts.application || 0) + ")";
    els.phonesVerifyCount.textContent = "(" + (p.counts.verification || 0) + ")";

    els.phonesApplication.innerHTML = (p.application_phones || [])
      .map(function (ph) {
        return "<li>" + esc(formatPhone(ph)) + "</li>";
      })
      .join("");

    var verify = p.verification_phones || (p.verification_phone ? [p.verification_phone] : []);
    els.phonesVerification.innerHTML = verify
      .map(function (ph) {
        return (
          '<li><span class="dash-phones__verify-icon" title="Проверочный номер" aria-label="Проверочный номер">✓</span>' +
          esc(formatPhone(ph)) +
          "</li>"
        );
      })
      .join("");
  }

  function renderCompanyHeader() {
    var d = state.company;
    var p = periodPhones();
    if (!d) return;
    var study = p && p.study_from && p.study_to ? formatStudyRange(p.study_from, p.study_to) : STUDY_PERIOD.label;
    var periodLabel = (p && p.label) || PERIOD_LABEL;
    els.presentPeriod.textContent = periodLabel + " · исследование " + study;
  }

  function formatStudyRange(from, to) {
    var months = [
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ];
    function part(iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
      if (!m) return iso;
      return parseInt(m[3], 10) + " " + months[parseInt(m[2], 10) - 1];
    }
    return "с " + part(from) + " по " + part(to) + " " + (from.slice(0, 4) === to.slice(0, 4) ? from.slice(0, 4) : to.slice(0, 4)) + " года";
  }

  function formatPhone(raw) {
    var d = String(raw).replace(/\D/g, "");
    if (d.length === 11 && d[0] === "7") d = d.slice(1);
    if (d.length !== 10) return "+" + raw;
    return "+7 (" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6, 8) + "-" + d.slice(8, 10);
  }

  function buildClientPhonesText() {
    var p = periodPhones();
    if (!p) return "";
    var study =
      p.study_from && p.study_to
        ? formatStudyRange(p.study_from, p.study_to)
        : STUDY_PERIOD.label;
    var lines = [];
    if (state.company) {
      lines.push("");
    }
    lines.push("Телефонные номера для заявок");
    lines.push("Период: " + p.label + " (" + study + ")");
    lines.push("");
    lines.push("Номера, с которых мы оставляли заявки на обратный звонок (" + (p.counts.application || 0) + "):");
    (p.application_phones || []).forEach(function (ph) {
      lines.push(formatPhone(ph));
    });
    lines.push("");
    lines.push("Проверочный номер — с него мы звонили, чтобы идентифицировать ответ застройщика:");
    var verify = p.verification_phones || (p.verification_phone ? [p.verification_phone] : []);
    verify.forEach(function (ph) {
      lines.push(formatPhone(ph));
    });
    lines.push("");
    lines.push(
      "Удалите эти номера из CRM, если они попали туда как заявки — это номера телефонов для исследования, а не реальные клиенты."
    );
    return lines.join("\n");
  }

  function copyPhonesForClient() {
    var text = buildClientPhonesText();
    if (!text) return;
    function done(ok) {
      if (els.phonesCopyStatus) {
        els.phonesCopyStatus.textContent = ok ? "Скопировано в буфер обмена." : "Не удалось скопировать.";
        setTimeout(function () {
          els.phonesCopyStatus.textContent = "";
        }, 3000);
      }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(false); });
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try {
      done(document.execCommand("copy"));
    } catch (e) {
      done(false);
    }
    document.body.removeChild(ta);
  }

  function loadData() {
    function useData(data) {
      state.developers = (data.developers || []).slice().sort(function (a, b) {
        return a.developer_name.localeCompare(b.developer_name, "ru");
      });
      state.market = data.market || null;
      state.meta = data.meta || null;
      renderSearchResults();
      if (state.company) {
        renderSearchChip();
        selectCompany(state.company.developer_name, false);
      }
    }

    if (window.APP_DATA && window.APP_DATA.developers) {
      useData(window.APP_DATA);
      return;
    }
    fetch(CFG.dataUrl || "data.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(useData)
      .catch(function (err) {
        if (els.results) {
          openSearchMenu();
          els.results.innerHTML =
            '<li class="dash-combobox__option"><span class="dash-combobox__option-btn">Ошибка загрузки: ' +
            esc(err.message) +
            "</span></li>";
        }
      });
  }

  function openSearchMenu() {
    state.searchOpen = true;
    if (els.combobox) els.combobox.classList.add("is-open");
    if (els.results) els.results.hidden = false;
    if (els.search) els.search.setAttribute("aria-expanded", "true");
    if (els.searchToggle) els.searchToggle.setAttribute("aria-expanded", "true");
  }

  function closeSearchMenu() {
    state.searchOpen = false;
    state.highlightIndex = -1;
    if (els.combobox) els.combobox.classList.remove("is-open");
    if (els.results) els.results.hidden = true;
    if (els.search) els.search.setAttribute("aria-expanded", "false");
    if (els.searchToggle) els.searchToggle.setAttribute("aria-expanded", "false");
  }

  function updateClearButton() {
    if (!els.searchClear) return;
    var show = Boolean(state.company || state.query);
    els.searchClear.hidden = !show;
  }

  function renderSearchChip() {
    if (!els.searchChips || !els.combobox) return;
    if (!state.company) {
      els.searchChips.innerHTML = "";
      els.combobox.classList.remove("has-value");
      updateClearButton();
      return;
    }
    els.combobox.classList.add("has-value");
    els.searchChips.innerHTML =
      '<span class="dash-combobox__chip">' +
      esc(state.company.developer_name) +
      '<button type="button" class="dash-combobox__chip-remove" aria-label="Убрать ' +
      esc(state.company.developer_name) +
      '">×</button></span>';
    var btn = els.searchChips.querySelector(".dash-combobox__chip-remove");
    if (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        clearCompanySelection();
      });
    }
    updateClearButton();
  }

  function clearCompanySelection() {
    state.company = null;
    state.query = "";
    state.companyEvents = null;
    state.expandedAppId = null;
    if (els.search) els.search.value = "";
    if (els.panelPresent) els.panelPresent.hidden = true;
    renderSearchChip();
    renderSearchResults();
    window.history.replaceState(null, "", window.location.pathname);
  }

  function onSearchKeydown(e) {
    var options = els.results ? els.results.querySelectorAll(".dash-combobox__option[data-company]") : [];
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!state.searchOpen) openSearchMenu();
      state.highlightIndex = Math.min(state.highlightIndex + 1, options.length - 1);
      updateSearchHighlight(options);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      state.highlightIndex = Math.max(state.highlightIndex - 1, 0);
      updateSearchHighlight(options);
    } else if (e.key === "Enter") {
      if (state.highlightIndex >= 0 && options[state.highlightIndex]) {
        e.preventDefault();
        selectCompany(options[state.highlightIndex].getAttribute("data-company"), true);
      }
    } else if (e.key === "Escape") {
      closeSearchMenu();
      els.search.blur();
    }
  }

  function updateSearchHighlight(options) {
    for (var i = 0; i < options.length; i++) {
      options[i].classList.toggle("is-highlighted", i === state.highlightIndex);
    }
    if (options[state.highlightIndex]) {
      options[state.highlightIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function filteredDevelopers() {
    var q = state.query.toLowerCase();
    return state.developers.filter(function (d) {
      if (!q) return true;
      return (
        d.developer_name.toLowerCase().indexOf(q) !== -1 ||
        (d.url && d.url.toLowerCase().indexOf(q) !== -1)
      );
    });
  }

  function parseUrl() {
    var params = new URLSearchParams(window.location.search);
    var company = params.get("company");
    if (company) {
      if (els.periodSelect) state.period = els.periodSelect.value;
      selectCompany(company, false);
    }
  }

  function updateUrl() {
    if (!state.company) return;
    var params = new URLSearchParams();
    params.set("company", state.company.developer_name);
    var url = window.location.pathname + "?" + params.toString();
    window.history.replaceState(null, "", url);
  }

  function companySlug(d) {
    var base = String((d && d.url) || (d && d.developer_name) || "company")
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/^www\./i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    return base || "company";
  }

  function companyEventSlugs(d) {
    var slug = companySlug(d);
    var slugs = [slug];
    if (slug.indexOf("www-") !== 0) slugs.push("www-" + slug);
    return slugs;
  }

  function loadCompanyEvents(d) {
    if (!d) return;
    var slugs = companyEventSlugs(d);
    state.companyEvents = null;
    state.companyEventsLoading = true;
    state.expandedAppId = null;
    renderCompanyDetailTabs();

    function tryFetch(index) {
      if (index >= slugs.length) {
        state.companyEvents = null;
        state.companyEventsLoading = false;
        renderCompanyDetailTabs();
        return;
      }
      fetch("company-events/" + encodeURIComponent(slugs[index]) + ".json", { cache: "no-store" })
        .then(function (r) {
          if (!r.ok) throw new Error("not found");
          return r.json();
        })
        .then(function (data) {
          state.companyEvents = data;
          state.companyEventsLoading = false;
          renderCompanyDetailTabs();
        })
        .catch(function () {
          tryFetch(index + 1);
        });
    }

    tryFetch(0);
  }

  function setTab(id) {
    if (id === "coverage") id = "applications";
    if (id === "spam") id = "overview";
    state.tab = id;
    els.tabButtons.forEach(function (btn) {
      var active = btn.getAttribute("data-tab") === id;
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    els.tabPanels.forEach(function (panel) {
      var show = panel.id === "tab-" + id;
      panel.hidden = !show;
    });
  }

  function renderSearchResults() {
    if (!els.results) return;
    var list = filteredDevelopers();

    if (!list.length) {
      els.results.innerHTML = "";
      if (els.searchEmpty) els.searchEmpty.hidden = !state.query;
      return;
    }
    if (els.searchEmpty) els.searchEmpty.hidden = true;

    els.results.innerHTML = list
      .slice(0, 50)
      .map(function (d, i) {
        var badge = d.insufficient_data
          ? '<span class="dash-combobox__option-badge">мало данных</span>'
          : "";
        return (
          '<li class="dash-combobox__option' +
          (i === state.highlightIndex ? " is-highlighted" : "") +
          '" role="option" data-company="' +
          esc(d.developer_name) +
          '">' +
          '<button type="button" class="dash-combobox__option-btn">' +
          '<span class="dash-combobox__option-title">' +
          esc(d.developer_name) +
          "</span>" +
          '<span class="dash-combobox__option-sub">' +
          esc(d.url || "—") +
          "</span>" +
          badge +
          "</button></li>"
        );
      })
      .join("");

    els.results.querySelectorAll("[data-company]").forEach(function (item) {
      item.querySelector(".dash-combobox__option-btn").addEventListener("click", function () {
        selectCompany(item.getAttribute("data-company"), true);
      });
    });
  }

  function selectCompany(name, scroll) {
    var d = findDev(name);
    if (!d) return;
    state.company = d;
    state.query = "";
    if (els.search) els.search.value = "";
    renderSearchChip();
    closeSearchMenu();
    els.panelPresent.hidden = false;
    renderCompany();
    loadCompanyEvents(d);
    updateUrl();
    if (scroll) els.panelPresent.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function findDev(name) {
    for (var i = 0; i < state.developers.length; i++) {
      if (state.developers[i].developer_name === name) return state.developers[i];
    }
    return null;
  }

  function renderCompany() {
    var d = state.company;
    var m = state.market;
    if (!d) return;

    els.presentCompany.textContent = d.developer_name;
    renderCompanyHeader();
    var siteHref = d.url ? "https://" + d.url.replace(/^https?:\/\//i, "") : null;
    els.presentSite.innerHTML = siteHref
      ? '<a href="' + esc(siteHref) + '" target="_blank" rel="noopener">' + esc(d.url) + "</a>"
      : "";

    els.bannerInsufficient.hidden = !d.insufficient_data;

    if (d.insufficient_data) {
      els.kpiGrid.innerHTML = "";
      els.execSummary.innerHTML =
        "<h3>Недостаточно данных</h3><p>Отправлено заявок: <strong>" +
        fmtInt(d.applications_sent) +
        "</strong>. Для расчёта метрик нужно минимум " +
        APPLICATIONS_QUORUM +
        ".</p>";
      els.channelChart.innerHTML = "";
      els.touchesBlock.innerHTML = "";
      els.diagnostics.innerHTML = "";
      els.ctaText.textContent =
        "Предложите повторный замер после восстановления форм на сайте или обсудите технический аудит интеграции заявок.";
      return;
    }

    renderExecutiveSummary(d, m);
    renderKpis(d, m);
    renderChannels(d);
    renderTouches(d);
    renderDiagnostics(d, m);
    renderCta(d, m);
    renderCompanyDetailTabs();
    setTab(state.tab);
  }

  function renderCompanyDetailTabs() {
    var data = state.companyEvents;
    var hasData = data && data.applications && data.applications.length;

    if (els.applicationsEmpty) els.applicationsEmpty.hidden = !!hasData || state.companyEventsLoading;
    if (els.applicationsSummary) els.applicationsSummary.hidden = !hasData;
    if (els.applicationsTable) els.applicationsTable.hidden = !hasData;

    if (state.companyEventsLoading) return;

    if (hasData) {
      renderApplicationsSummary(data);
      renderApplicationsTable(data);
    }
  }

  function renderApplicationsSummary(data) {
    if (!els.applicationsSummary) return;
    var sent = (data.applications || []).length;
    var identified = (data.events || []).filter(function (e) {
      return e.identified_status === "developer";
    });
    var channelCounts = { call: 0, sms: 0, max: 0, whatsapp: 0, telegram: 0 };
    identified.forEach(function (e) {
      var ch = e.channel || "";
      if (channelCounts[ch] != null) channelCounts[ch]++;
    });
    var quorumMet = sent >= APPLICATIONS_QUORUM;
    var appsWithIdentified = {};
    identified.forEach(function (e) {
      if (e.application_id) appsWithIdentified[e.application_id] = true;
    });
    var withoutTouches = (data.applications || []).filter(function (app) {
      return !appsWithIdentified[app.application_id];
    }).length;

    els.applicationsSummary.innerHTML =
      '<div class="dash-applications-summary__grid">' +
      '<article class="dash-kpi">' +
      '<p class="dash-kpi__label">Заявок отправлено</p>' +
      '<p class="dash-kpi__value">' +
      esc(fmtInt(sent) + " из " + fmtInt(PLANNED_APPLICATIONS)) +
      "</p>" +
      '<p class="dash-kpi__bench">Кворум для рейтинга: ' +
      fmtInt(APPLICATIONS_QUORUM) +
      (quorumMet
        ? ' <span class="dash-quorum-check" title="Кворум достигнут" aria-label="Кворум достигнут">✓</span>'
        : ' <span class="dash-quorum-check dash-quorum-check--bad" title="Ниже кворума" aria-label="Ниже кворума">×</span>') +
      "</p>" +
      "</article>" +
      '<article class="dash-kpi">' +
      '<p class="dash-kpi__label">Заявок без касаний</p>' +
      '<p class="dash-kpi__value">' +
      esc(fmtInt(withoutTouches)) +
      "</p>" +
      "</article>" +
      '<article class="dash-kpi">' +
      '<p class="dash-kpi__label">Касаний всего</p>' +
      '<p class="dash-kpi__value">' +
      esc(fmtInt(identified.length)) +
      "</p>" +
      '<p class="dash-kpi__bench">За 72 ч после заявки</p>' +
      "</article>" +
      '<article class="dash-kpi dash-kpi--channels">' +
      '<p class="dash-kpi__label">Касания по каналам</p>' +
      '<ul class="dash-channel-counts">' +
      '<li><span>Звонки</span><strong class="mono">' +
      fmtInt(channelCounts.call) +
      "</strong></li>" +
      '<li><span>SMS</span><strong class="mono">' +
      fmtInt(channelCounts.sms) +
      "</strong></li>" +
      '<li><span>Max</span><strong class="mono">' +
      fmtInt(channelCounts.max) +
      "</strong></li>" +
      '<li><span>WhatsApp</span><strong class="mono">' +
      fmtInt(channelCounts.whatsapp) +
      "</strong></li>" +
      '<li><span>Telegram</span><strong class="mono">' +
      fmtInt(channelCounts.telegram) +
      "</strong></li>" +
      "</ul></article></div>";
  }

  function buildApplicationOrderMap(applications) {
    var sorted = (applications || []).slice().sort(function (a, b) {
      var am = dateMs(a.submitted_at);
      var bm = dateMs(b.submitted_at);
      if (am !== bm) return am - bm;
      return String(a.application_id || "").localeCompare(String(b.application_id || ""));
    });
    var map = {};
    sorted.forEach(function (app, i) {
      map[app.application_id] = i + 1;
    });
    return map;
  }

  function renderApplicationsTable(data) {
    if (!els.applicationsTable) return;
    var eventsByApp = groupEventsByApp(data.events || []);
    var orderByAppId = buildApplicationOrderMap(data.applications);
    var rowsData = (data.applications || []).map(function (app) {
      var events = eventsByApp[app.application_id] || [];
      var identifiedEvents = events.filter(function (e) {
        return e.identified_status === "developer";
      });
      var channelCounts = channelCountsForEvents(identifiedEvents);
      return {
        app: app,
        order: orderByAppId[app.application_id] || 0,
        submittedMs: dateMs(app.submitted_at),
        dayRank: dayRank(app.day_of_week),
        slotRank: slotRank(app.time_slot),
        events: events,
        hasEvents: events.length ? 1 : 0,
        channelCounts: channelCounts,
        totalIdentified: identifiedEvents.length,
        hasSpamEvents: events.some(function (e) {
          return e.identified_status !== "developer";
        }),
      };
    });

    rowsData = sortApplicationsRows(rowsData);

    var rows = rowsData
      .map(function (row) {
        var app = row.app;
        var events = row.events;
        var counts = row.channelCounts;
        var expanded = state.expandedAppId === app.application_id;
        var main =
          '<tr class="' +
          (events.length ? "" : "dash-table__row--empty") +
          '" data-app-id="' +
          esc(app.application_id) +
          "\">" +
          '<td class="dash-table__expand">' +
          (events.length
            ? '<button type="button" class="dash-btn" data-toggle-app="' + esc(app.application_id) + '" aria-expanded="' +
              (expanded ? "true" : "false") +
              '">' +
              (expanded ? "−" : "+") +
              "</button>"
            : "") +
          "</td>" +
          '<td class="dash-application-number">' +
          '<span class="dash-application-order">' +
          esc(row.order) +
          "</span>" +
          '<span class="dash-application-id">' +
          esc(app.application_id) +
          "</span>" +
          "</td>" +
          "<td>" +
          esc(formatShortDateTime(app.submitted_at)) +
          "</td>" +
          "<td>" +
          esc(translateDay(app.day_of_week)) +
          "</td>" +
          "<td>" +
          esc(translateSlot(app.time_slot)) +
          "</td>" +
          '<td class="mono dash-table__phone-full">' +
          esc(applicationPhone(app)) +
          "</td>" +
          '<td class="mono dash-table__total"' +
          (row.hasSpamEvents ? ' title="Есть спам-касания (см. раскрытие)"' : "") +
          ">" +
          fmtInt(row.totalIdentified) +
          (row.hasSpamEvents
            ? ' <span class="dash-table__spam-mark" aria-hidden="true">*</span>'
            : "") +
          "</td>" +
          channelCell(counts.call, "call") +
          channelCell(counts.sms, "sms") +
          channelCell(counts.max, "max") +
          channelCell(counts.whatsapp, "whatsapp") +
          channelCell(counts.telegram, "telegram") +
          "</tr>";

        var detail = "";
        if (expanded && events.length) {
          detail =
            '<tr class="dash-table__events"><td colspan="12">' +
            '<table class="dash-table"><thead><tr>' +
            "<th>Время</th><th>Канал</th><th>Номер</th><th>Статус</th><th>Через</th>" +
            "</tr></thead><tbody>" +
            events
              .map(function (e) {
                return (
                  "<tr>" +
                  "<td>" +
                  esc(formatDateTime(e.event_at)) +
                  "</td>" +
                  "<td>" +
                  esc(channelLabel(e.channel)) +
                  "</td>" +
                  '<td class="mono dash-table__phone-full">' +
                  esc(eventPhone(e)) +
                  "</td>" +
                  "<td>" +
                  statusBadge(e.identified_status) +
                  "</td>" +
                  '<td class="mono">' +
                  (e.minutes_since_application != null ? fmtDuration(e.minutes_since_application) : "—") +
                  "</td>" +
                  "</tr>"
                );
              })
              .join("") +
            "</tbody></table></td></tr>";
        }
        return main + detail;
      })
      .join("");

    els.applicationsTable.innerHTML =
      '<div class="dash-table-wrap"><table class="dash-table"><thead><tr>' +
      sortTh("has_events", "+", "dash-table__expand-th") +
      sortTh("order", "№ заявки") +
      sortTh("submitted_at", "Отправлена") +
      sortTh("day", "День") +
      sortTh("slot", "Слот") +
      sortTh("phone_number", "Номер заявки", "dash-table__phone-th") +
      sortTh("total", "Касаний", "dash-table__total-th") +
      sortTh("call", channelIconHtml("call"), "dash-table__channel-th") +
      sortTh("sms", channelIconHtml("sms"), "dash-table__channel-th") +
      sortTh("max", channelIconHtml("max"), "dash-table__channel-th") +
      sortTh("whatsapp", channelIconHtml("whatsapp"), "dash-table__channel-th") +
      sortTh("telegram", channelIconHtml("telegram"), "dash-table__channel-th") +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>";

    els.applicationsTable.querySelectorAll("[data-sort-app]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.getAttribute("data-sort-app");
        if (state.appSort.key === key) {
          state.appSort.dir = state.appSort.dir === "asc" ? "desc" : "asc";
        } else {
          state.appSort.key = key;
          state.appSort.dir = isNumericSort(key) ? "desc" : "asc";
        }
        renderApplicationsTable(data);
      });
    });

    els.applicationsTable.querySelectorAll("[data-toggle-app]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-toggle-app");
        state.expandedAppId = state.expandedAppId === id ? null : id;
        renderApplicationsTable(data);
      });
    });
  }

  function sortApplicationsRows(rows) {
    var key = state.appSort.key || "order";
    var dir = state.appSort.dir === "desc" ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      var av = appSortValue(a, key);
      var bv = appSortValue(b, key);
      if (av == null && bv == null) return a.order - b.order;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av > bv) return dir;
      if (av < bv) return -dir;
      return a.order - b.order;
    });
  }

  function appSortValue(row, key) {
    if (key === "order") return row.order;
    if (key === "submitted_at") return row.submittedMs;
    if (key === "day") return row.dayRank;
    if (key === "slot") return row.slotRank;
    if (key === "phone_number") return applicationPhone(row.app);
    if (key === "has_events") return row.hasEvents;
    if (key === "total") return row.totalIdentified;
    if (row.channelCounts && row.channelCounts[key] != null) return row.channelCounts[key];
    return row.order;
  }

  function isNumericSort(key) {
    return key === "has_events" || key === "call" || key === "sms" || key === "max" || key === "whatsapp" || key === "telegram" || key === "total";
  }

  function sortTh(key, labelHtml, className) {
    var active = state.appSort.key === key;
    var dir = active ? state.appSort.dir : "";
    return (
      '<th class="' +
      esc(className || "") +
      '" aria-sort="' +
      (active ? (dir === "asc" ? "ascending" : "descending") : "none") +
      '">' +
      '<button type="button" class="dash-sort-btn" data-sort-app="' +
      esc(key) +
      '">' +
      labelHtml +
      '<span class="dash-sort-btn__indicator">' +
      (active ? (dir === "asc" ? "↑" : "↓") : "") +
      "</span></button></th>"
    );
  }

  function channelCountsForEvents(events) {
    var counts = { call: 0, sms: 0, max: 0, whatsapp: 0, telegram: 0 };
    events.forEach(function (e) {
      var ch = e.channel || "";
      if (counts[ch] != null) counts[ch]++;
    });
    return counts;
  }

  function channelCell(count, channel) {
    return (
      '<td class="dash-channel-cell' +
      (count ? "" : " dash-channel-cell--empty") +
      '">' +
      '<span class="dash-channel-cell__inner">' +
      '<span class="mono">' +
      fmtInt(count) +
      "</span></span></td>"
    );
  }

  function channelIconHtml(channel) {
    if (channel === "call") {
      return (
        '<svg class="dash-channel-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
        '<path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2a1 1 0 0 1 1.01-.24c1.11.37 2.31.56 3.58.56a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.27.19 2.47.56 3.58a1 1 0 0 1-.24 1.01l-2.2 2.2z"/>' +
        "</svg>"
      );
    }
    return '<img class="dash-channel-icon" src="icons/' + esc(channel) + '.svg" width="16" height="16" alt="" aria-hidden="true">';
  }

  function dateMs(value) {
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function dayRank(value) {
    var ranks = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 };
    return ranks[String(value || "").toLowerCase()] || 99;
  }

  function slotRank(value) {
    var ranks = { morning: 1, afternoon: 2, evening: 3 };
    return ranks[String(value || "").toLowerCase()] || 99;
  }

  function applicationPhone(app) {
    if (app.phone_number && app.phone_number !== "—") return app.phone_number;
    return "—";
  }

  function eventPhone(e) {
    if (e.channel === "sms" && e.identified_status === "developer") {
      if (e.sms_mark && String(e.sms_mark).trim()) return e.sms_mark;
      if (e.from_phone && e.from_phone !== "—") return e.from_phone;
      return "—";
    }
    if (e.from_phone && e.from_phone !== "—") return e.from_phone;
    return "—";
  }

  function groupEventsByApp(events) {
    var map = {};
    events.forEach(function (e) {
      if (!e.application_id) return;
      if (!map[e.application_id]) map[e.application_id] = [];
      map[e.application_id].push(e);
    });
    Object.keys(map).forEach(function (k) {
      map[k].sort(function (a, b) {
        return (a.minutes_since_application || 0) - (b.minutes_since_application || 0);
      });
    });
    return map;
  }

  function statusBadge(status) {
    if (status === "developer") return '<span class="dash-badge dash-badge--yes">застройщик</span>';
    if (status === "spam") return '<span class="dash-badge dash-badge--spam">спам</span>';
    return '<span class="dash-badge dash-badge--no">неизвестно</span>';
  }

  function channelLabel(ch) {
    var map = { call: "Звонок", sms: "SMS", whatsapp: "WhatsApp", telegram: "Telegram", max: "Max" };
    return map[ch] || ch || "—";
  }

  function translateDay(d) {
    var map = {
      monday: "пн",
      tuesday: "вт",
      wednesday: "ср",
      thursday: "чт",
      friday: "пт",
      saturday: "сб",
      sunday: "вс",
    };
    return map[String(d || "").toLowerCase()] || d || "—";
  }

  function translateSlot(s) {
    var map = { morning: "утро", afternoon: "день", evening: "вечер" };
    return map[String(s || "").toLowerCase()] || s || "—";
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatShortDateTime(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    var months = [
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ];
    var time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return d.getDate() + " " + months[d.getMonth()] + ", " + time;
  }

  function renderExecutiveSummary(d, m) {
    var lines = [];
    var speed = d.avg_call_response;
    var marketSpeed = m && m.avg_response ? m.avg_response.mean : null;

    if (speed != null && marketSpeed != null && speed <= (m.avg_response.best || speed)) {
      lines.push(
        "Сильная сторона: медиана первого идентифицированного звонка — " +
          fmtDuration(speed) +
          " (на уровне лучшего значения рынка)."
      );
    } else if (speed != null && marketSpeed != null && speed < marketSpeed) {
      lines.push(
        "Скорость первого идентифицированного звонка — " +
          fmtDuration(speed) +
          ", быстрее среднего рынка (" +
          fmtDuration(marketSpeed) +
          ")."
      );
    } else if (speed != null) {
      lines.push(
        "Медиана первого идентифицированного звонка — " + fmtDuration(speed) + "."
      );
    }

    if (d.no_call_share != null && m && m.no_callback_share) {
      if (d.no_call_share > m.no_callback_share.mean) {
        lines.push(
          "Зона роста: " +
            fmtPct(d.no_call_share) +
            " заявок без идентифицированного звонка (рынок ~" +
            fmtPct(m.no_callback_share.mean) +
            ")."
        );
      } else {
        lines.push(
          "Покрытие звонком: " +
            fmtPct(100 - d.no_call_share) +
            " заявок с идентифицированным звонком."
        );
      }
    }

    if ((d.messenger_penetration_share || 0) === 0) {
      lines.push(
        "Идентифицированных SMS или мессенджеров по отправленным заявкам не найдено."
      );
    }

    els.execSummary.innerHTML =
      "<h3>Краткий вывод</h3><ul>" +
      lines.map(function (l) {
        return "<li>" + esc(l) + "</li>";
      }).join("") +
      "</ul>";
  }

  function renderKpis(d, m) {
    var cards = [
      kpiCard(
        "Как быстро перезванивают?",
        d.avg_call_response != null ? fmtDuration(d.avg_call_response) : "—",
        m && m.avg_response
          ? "Рынок: " + fmtDuration(m.avg_response.mean) + " · лучшее: " + fmtDuration(m.avg_response.best)
          : "",
        compareSpeed(d.avg_call_response, m)
      ),
      kpiCard(
        "Заявки без идентифицированного звонка",
        d.no_call_share != null ? fmtPct(d.no_call_share) : "—",
        m && m.no_callback_share ? "Рынок: " + fmtPct(m.no_callback_share.mean) : "",
        compareNoCall(d.no_call_share, m)
      ),
      kpiCard(
        "Касаний на отвеченную заявку",
        d.avg_touches_per_responded_app != null ? fmtNum(d.avg_touches_per_responded_app) : "—",
        "",
        null
      ),
      kpiCard(
        "Всего касаний за 72 часа",
        d.total_touches != null ? fmtInt(d.total_touches) : "—",
        "",
        null
      ),
      kpiCard(
        "Проникновение SMS/мессенджеров",
        d.messenger_penetration_share != null ? fmtPct(d.messenger_penetration_share) : "—",
        m && m.messengers ? "Рынок: " + fmtPct(m.messengers.mean) : "",
        compareMessengers(d.messenger_penetration_share, m)
      ),
      kpiCard(
        "Отправлено заявок",
        fmtInt(d.applications_sent),
        "План методологии: до 21",
        null
      ),
    ];
    els.kpiGrid.innerHTML = cards.join("");
  }

  function kpiCard(label, value, bench, deltaHtml) {
    return (
      '<article class="dash-kpi">' +
      '<p class="dash-kpi__label">' +
      esc(label) +
      "</p>" +
      '<p class="dash-kpi__value">' +
      esc(value) +
      "</p>" +
      (bench ? '<p class="dash-kpi__bench">' + esc(bench) + "</p>" : "") +
      (deltaHtml || "") +
      "</article>"
    );
  }

  function compareSpeed(company, m) {
    if (company == null || !m || !m.avg_response) return "";
    var mean = m.avg_response.mean;
    if (company < mean) return deltaTag("good", "Быстрее среднего рынка");
    if (company > mean) return deltaTag("bad", "Медленнее среднего рынка");
    return deltaTag("neutral", "На уровне рынка");
  }

  function compareNoCall(company, m) {
    if (company == null || !m || !m.no_callback_share) return "";
    var mean = m.no_callback_share.mean;
    if (company > mean) return deltaTag("bad", "Хуже среднего на " + Math.round(company - mean) + " п.п.");
    if (company < mean) return deltaTag("good", "Лучше среднего на " + Math.round(mean - company) + " п.п.");
    return deltaTag("neutral", "На уровне рынка");
  }

  function compareMessengers(company, m) {
    if (company == null || !m || !m.messengers) return "";
    if (company < m.messengers.mean) return deltaTag("bad", "Ниже среднего рынка");
    if (company > m.messengers.mean) return deltaTag("good", "Выше среднего рынка");
    return deltaTag("neutral", "На уровне рынка");
  }

  function deltaTag(kind, text) {
    return '<span class="dash-kpi__delta dash-kpi__delta--' + kind + '">' + esc(text) + "</span>";
  }

  function renderChannels(d) {
    var ch = d.channel_share || {};
    var channels = [
      { key: "call", label: "Звонок" },
      { key: "sms", label: "SMS" },
      { key: "max", label: "Max" },
      { key: "whatsapp", label: "WhatsApp" },
      { key: "telegram", label: "Telegram" },
    ];
    els.channelChart.innerHTML =
      "<h3>Доля заявок с контактом по каналу</h3>" +
      channels
        .map(function (c) {
          var v = ch[c.key] || 0;
          return (
            '<div class="dash-bar-row">' +
            "<span>" +
            esc(c.label) +
            "</span>" +
            '<div class="dash-bar-row__track"><div class="dash-bar-row__fill" style="width:' +
            v +
            '%"></div></div>' +
            '<span class="dash-bar-row__pct">' +
            fmtPct(v) +
            "</span></div>"
          );
        })
        .join("");
  }

  function renderTouches(d) {
    els.touchesBlock.innerHTML =
      "<h3>Настойчивость контактов</h3>" +
      '<div class="dash-touches-grid">' +
      touchItem(fmtNum(d.avg_touches_per_responded_app), "Касаний на отвеченную заявку") +
      touchItem(fmtInt(d.total_touches), "Всего касаний") +
      touchItem(fmtInt(d.max_touches_per_app), "Макс. на одну заявку") +
      touchItem(fmtNum(d.avg_recontacts), "Повторные касания (на все заявки)") +
      "</div>";
  }

  function touchItem(val, label) {
    return (
      '<div class="dash-touches-item"><div class="dash-touches-item__val">' +
      esc(val != null && val !== "NaN" ? String(val) : "—") +
      '</div><div class="dash-touches-item__lbl">' +
      esc(label) +
      "</div></div>"
    );
  }

  function renderDiagnostics(d, m) {
    var cards = buildDiagnosticCards(d, m);
    if (!cards.length) {
      cards.push({
        tag: "check",
        tagLabel: "Проверка",
        title: "Сильные показатели по агрегатам",
        body: "По текущим метрикам явных отставаний от рынка не видно. Обсудите удержание скорости, защиту от утечек и омниканальность как следующий шаг.",
        checks: ["Сверка заявок в CRM", "Мониторинг спама по заявкам"],
        solution: "Противодействие утечкам · Оркестратор мессенджеров",
      });
    }
    els.diagnostics.innerHTML = cards
      .map(function (c) {
        return (
          '<article class="dash-diag">' +
          '<div class="dash-diag__tag dash-diag__tag--' +
          c.tag +
          '">' +
          esc(c.tagLabel) +
          "</div>" +
          "<h4>" +
          esc(c.title) +
          "</h4>" +
          "<p>" +
          esc(c.body) +
          "</p>" +
          (c.checks && c.checks.length
            ? "<ul>" +
              c.checks
                .map(function (x) {
                  return "<li>" + esc(x) + "</li>";
                })
                .join("") +
              "</ul>"
            : "") +
          '<p class="dash-diag__solution">Интроверт: ' +
          esc(c.solution) +
          "</p></article>"
        );
      })
      .join("");
  }

  function buildDiagnosticCards(d, m) {
    var cards = [];

    if (d.avg_call_response != null && m && m.avg_response && d.avg_call_response > m.avg_response.mean) {
      cards.push({
        tag: "risk",
        tagLabel: "Зона роста",
        title: "Медленный первый идентифицированный звонок",
        body:
          "Медиана " +
          fmtDuration(d.avg_call_response) +
          " против " +
          fmtDuration(m.avg_response.mean) +
          " в среднем по рынку.",
        checks: [
          "Проверить маршрутизацию лидов в CRM",
          "Сверить время первого звонка в телефонии",
          "Исключить задержки из-за антиспама оператора",
        ],
        solution: "amoCRM Enterprise · Повышение дозваниваемости АТС · AI-секретарь Matvey",
      });
    }

    if (d.no_call_share != null && m && m.no_callback_share && d.no_call_share > m.no_callback_share.mean) {
      var missed = Math.round(((d.no_call_share / 100) * (d.applications_sent || 0)));
      cards.push({
        tag: "risk",
        tagLabel: "Зона роста",
        title: "Низкое покрытие идентифицированным звонком",
        body:
          fmtPct(d.no_call_share) +
          " заявок без идентифицированного звонка (~" +
          missed +
          " из " +
          fmtInt(d.applications_sent) +
          "). Это может быть и отсутствие звонка, и проблема идентификации.",
        checks: [
          "Найти наши заявки в CRM",
          "Проверить статусы и причины недозвона",
          "Проверить блокировки антиспам-фильтрами",
        ],
        solution: "amoCRM Enterprise · AI-секретарь Matvey · Повышение дозваниваемости АТС",
      });
    }

    if (
      (d.avg_touches_per_responded_app || 0) < 2 &&
      d.no_call_share != null &&
      d.no_call_share < 50
    ) {
      cards.push({
        tag: "check",
        tagLabel: "Проверить",
        title: "Мало повторных касаний после ответа",
        body:
          "В среднем " +
          fmtNum(d.avg_touches_per_responded_app) +
          " касаний на отвеченную заявку. При недозвоне клиент может не получить второй контакт.",
        checks: [
          "Есть ли сценарий повторного звонка или SMS после недозвона",
          "Настроены ли задачи менеджерам в CRM",
        ],
        solution: "AI-секретарь Matvey · Отдел реактивации",
      });
    }

    if ((d.messenger_penetration_share || 0) === 0) {
      cards.push({
        tag: "check",
        tagLabel: "Проверить",
        title: "Не видно идентифицированных SMS и мессенджеров",
        body:
          "По заявкам не зафиксировано идентифицированных сообщений в SMS или мессенджерах",
        checks: [
          "Уходили ли SMS или сообщения в мессенджерах после заявки",
          "Импортируется ли переписка в CRM",
        ],
        solution: "Оркестратор мессенджеров · Мобильное приложение для продавцов",
      });
    }

    if (d.avg_call_response != null && m && m.avg_response && d.avg_call_response <= m.avg_response.best + 5) {
      cards.unshift({
        tag: "strength",
        tagLabel: "Сильная сторона",
        title: "Высокая скорость первого идентифицированного звонка",
        body:
          "Медиана " +
          fmtDuration(d.avg_call_response) +
          " — на уровне лучших значений рынка. Стоит закрепить как внутренний стандарт.",
        checks: ["Зафиксировать SLA в CRM", "Контролировать скорость по сменам"],
        solution: "Контроль качества переговоров · amoCRM Enterprise",
      });
    }

    cards.push({
      tag: "check",
      tagLabel: "Рынок",
      title: "Риск утечек и спама по заявкам",
      body:
        "На рынке значительная доля входящих контактов — спам или неидентифицированные звонки. Для доказательной проверки утечек нужен отдельный аудит с tracking numbers, а не сводка в рейтинге.",
      checks: [
        "Оценить долю нецелевых контактов после тестовых заявок",
        "Проверить, не быстрее ли спамеры официального ответа",
      ],
      solution: "Lead Leakage Audit · Противодействие утечкам",
    });

    return cards.slice(0, 5);
  }

  function renderCta(d, m) {
    var parts = [];
    if (d.no_call_share > (m && m.no_callback_share ? m.no_callback_share.mean : 35)) {
      parts.push("аудит пути заявки от сайта до первого звонка");
    }
    if ((d.messenger_penetration_share || 0) < 10) {
      parts.push("пилот омниканального сценария после недозвона");
    }
    if (!parts.length) {
      parts.push("экспресс-разбор CRM и телефонии на заявках");
    }
    els.ctaText.textContent =
      "Предложите клиенту: " +
      parts.join(" и ") +
      ". Следующий шаг — встреча с экспертом Интроверта и коммерческое предложение по релевантным решениям.";
  }

  function fmtNum(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  }
  function fmtInt(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  }
  function fmtPct(v) {
    if (v == null || !Number.isFinite(Number(v))) return "—";
    return Number(v).toLocaleString("ru-RU") + "%";
  }
  function fmtDuration(v) {
    var total = Math.round(Number(v));
    if (!Number.isFinite(total)) return "—";
    if (total < 60) return total + " мин";
    var h = Math.floor(total / 60);
    var m = total % 60;
    return m ? h + " ч " + m + " мин" : h + " ч";
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
})();
