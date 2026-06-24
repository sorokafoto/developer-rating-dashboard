/* Внутренний sales-enablement дашборд. Спека: ../docs/dashboard-prd.md */
(function () {
  "use strict";

  var PLANNED_APPLICATIONS = 21;
  var APPLICATIONS_QUORUM = 11;
  var ANALYTICS_WINDOW_MINUTES = 72 * 60;
  var SPEED_LABEL = "Скорость перезвона";
  var NO_CALL_LABEL = "Заявки без перезвона";
  var MESSENGER_PENETRATION_LABEL = "Проникновение мессенджеров";
  var AVG_TOUCHES_PER_RESPONDED_APP_LABEL = "Касаний на заявку с ответом";
  var AVG_TOUCHES_PER_RESPONDED_BENCH = "на заявку с ответом";
  var AVG_TOUCHES_PER_SENT_APP_LABEL = "Касаний на отправленную заявку";
  var FIRST_CALL_WEEKDAY_WEEKEND_LABEL = "Медиана скорости перезвона: Будни / Выходные";
  var FIRST_CALL_DAY_TYPE_MIN_N = 3;
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
    companyEventsRequestId: 0,
    period: "2026-Q2",
    query: "",
    company: null,
    tab: "overview",
    expandedAppIds: {},
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
    els.phonesModal = document.getElementById("phones-modal");
    els.phonesModalClose = document.getElementById("phones-modal-close");
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
    els.diagnostics = document.getElementById("diagnostics");
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

    bindPhonesModalEvents();
  }

  function bindPhonesModalEvents() {
    if (els.presentPeriod) {
      els.presentPeriod.addEventListener("click", function (e) {
        if (e.target && e.target.id === "phones-modal-trigger") openPhonesModal();
      });
    }
    if (els.phonesModalClose) {
      els.phonesModalClose.addEventListener("click", closePhonesModal);
    }
    if (els.phonesModal) {
      els.phonesModal.addEventListener("click", function (e) {
        if (e.target === els.phonesModal) closePhonesModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.phonesModal && !els.phonesModal.hidden) {
        closePhonesModal();
      }
    });
  }

  function openPhonesModal() {
    if (!els.phonesModal || !periodPhones()) return;
    els.phonesModal.hidden = false;
    document.body.style.overflow = "hidden";
    if (els.phonesModalClose) els.phonesModalClose.focus();
  }

  function closePhonesModal() {
    if (!els.phonesModal) return;
    els.phonesModal.hidden = true;
    document.body.style.overflow = "";
    var trigger = document.getElementById("phones-modal-trigger");
    if (trigger) trigger.focus();
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
        if (state.company) renderCompanyHeader();
      })
      .catch(function () {
        if (state.company) renderCompanyHeader();
      });
  }

  function periodPhones() {
    if (!state.phonesData || !state.phonesData.periods) return null;
    return state.phonesData.periods[state.period] || null;
  }

  function renderPhones() {
    var p = periodPhones();
    if (!p) {
      if (els.phonesApplication) els.phonesApplication.innerHTML = "";
      if (els.phonesVerification) els.phonesVerification.innerHTML = "";
      if (els.phonesAppCount) els.phonesAppCount.textContent = "";
      if (els.phonesVerifyCount) els.phonesVerifyCount.textContent = "";
      return;
    }

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
        return "<li>" + esc(formatPhone(ph)) + "</li>";
      })
      .join("");
  }

  function renderCompanyHeader() {
    var d = state.company;
    var p = periodPhones();
    if (!d || !els.presentPeriod) return;
    var study = p && p.study_from && p.study_to ? formatStudyRange(p.study_from, p.study_to) : STUDY_PERIOD.label;
    var periodLabel = (p && p.label) || PERIOD_LABEL;
    var hasPhonesData = !!p;
    els.presentPeriod.innerHTML =
      esc(periodLabel) +
      " · исследование " +
      esc(study) +
      (hasPhonesData
        ? ' · <button type="button" class="dash-present__phones-link" id="phones-modal-trigger">Телефонные номера</button>'
        : "");
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
    lines.push("Проверочный номер — с него мы звонили, чтобы проверить ответ застройщика:");
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
    state.expandedAppIds = {};
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
    var requestId = (state.companyEventsRequestId || 0) + 1;
    state.companyEventsRequestId = requestId;
    state.companyEvents = null;
    state.companyEventsLoading = true;
    state.expandedAppIds = {};
    renderCompanyDetailTabs();

    function tryFetch(index) {
      if (requestId !== state.companyEventsRequestId) return;
      if (index >= slugs.length) {
        if (requestId !== state.companyEventsRequestId) return;
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
          if (requestId !== state.companyEventsRequestId) return;
          state.companyEvents = data;
          state.companyEventsLoading = false;
          renderCompanyDetailTabs();
        })
        .catch(function () {
          if (requestId !== state.companyEventsRequestId) return;
          tryFetch(index + 1);
        });
    }

    tryFetch(0);
  }

  function setTab(id) {
    if (id === "coverage") id = "applications";
    if (id === "spam" || id === "next" || id === "channels") id = "overview";
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
      els.diagnostics.innerHTML = "";
      return;
    }

    renderExecutiveSummary(d, m);
    renderKpis(d, m);
    renderDiagnostics(d, m);
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

    if (state.company && !state.company.insufficient_data) {
      renderKpis(state.company, state.market);
    }
  }

  function isTouchInRating(e) {
    if (!e || e.identified_status !== "developer") return false;
    if (!e.application_id) return false;
    var m = e.minutes_since_application;
    if (m == null || !Number.isFinite(m)) return false;
    return m >= 0 && m <= ANALYTICS_WINDOW_MINUTES;
  }

  /** Единый подсчёт касаний в рейтинге: company-events, иначе total_touches из data.json. */
  function getTouchesIn72hCount() {
    var events = state.companyEvents && state.companyEvents.events;
    if (events) return events.filter(isTouchInRating).length;
    var d = state.company;
    if (d && d.total_touches != null) return d.total_touches;
    return null;
  }

  function formatTouchesIn72h() {
    var n = getTouchesIn72hCount();
    return n != null ? fmtInt(n) : "—";
  }

  function getRatingTouchEvents() {
    var events = state.companyEvents && state.companyEvents.events;
    return events ? events.filter(isTouchInRating) : [];
  }

  function getApplicationsSentCount() {
    var apps = state.companyEvents && state.companyEvents.applications;
    if (apps && apps.length) return apps.length;
    var d = state.company;
    return d && d.applications_sent != null ? d.applications_sent : 0;
  }

  function getApplicationsWithoutTouchesCount() {
    var apps = state.companyEvents && state.companyEvents.applications;
    if (apps && apps.length) {
      var withTouch = {};
      getRatingTouchEvents().forEach(function (e) {
        if (e.application_id) withTouch[e.application_id] = true;
      });
      return apps.filter(function (a) {
        return !withTouch[a.application_id];
      }).length;
    }
    var d = state.company;
    if (!d || d.applications_sent == null || d.no_callback_share == null) return null;
    // no_callback_share = заявки без любого касания; для «без касаний» на вкладке Заявки, не no_call_share.
    return Math.round((d.no_callback_share / 100) * d.applications_sent);
  }

  function getRespondedAppsCount() {
    var touchEvents = getRatingTouchEvents();
    if (touchEvents.length) {
      var appIds = {};
      touchEvents.forEach(function (e) {
        if (e.application_id) appIds[e.application_id] = true;
      });
      return Object.keys(appIds).length;
    }
    var d = state.company;
    if (!d || d.applications_sent == null || d.no_callback_share == null) return null;
    return d.applications_sent - Math.round((d.no_callback_share / 100) * d.applications_sent);
  }

  function getAvgTouchesPerRespondedApp() {
    var touches = getTouchesIn72hCount();
    var responded = getRespondedAppsCount();
    if (touches != null && responded) return touches / responded;
    var d = state.company;
    if (d && d.avg_touches_per_responded_app != null) return d.avg_touches_per_responded_app;
    return null;
  }

  function formatAvgTouchesPerRespondedApp() {
    var v = getAvgTouchesPerRespondedApp();
    return v != null ? fmtNum(v) : "—";
  }

  function marketMeanTouchesPerResponded() {
    var devs = (state.developers || []).filter(function (d) {
      return !d.insufficient_data && d.avg_touches_per_responded_app != null;
    });
    if (!devs.length) return null;
    var sum = 0;
    devs.forEach(function (d) {
      sum += d.avg_touches_per_responded_app;
    });
    return Math.round((sum / devs.length) * 10) / 10;
  }

  function marketMeanTouchesPerSent() {
    var devs = (state.developers || []).filter(function (d) {
      return !d.insufficient_data && d.applications_sent && d.total_touches != null;
    });
    if (!devs.length) return null;
    var sumTouches = 0;
    var sumApps = 0;
    devs.forEach(function (d) {
      sumTouches += d.total_touches;
      sumApps += d.applications_sent;
    });
    if (!sumApps) return null;
    return Math.round((sumTouches / sumApps) * 10) / 10;
  }

  function getAvgTouchesPerApp() {
    var sent = getApplicationsSentCount();
    var touches = getTouchesIn72hCount();
    if (!sent || touches == null) return null;
    return touches / sent;
  }

  function formatAvgTouchesPerApp() {
    var v = getAvgTouchesPerApp();
    return v != null ? fmtNum(v) : "—";
  }

  function getFirstCallByDayType(company) {
    if (!company || !company.first_call_by_day_type) return null;
    return company.first_call_by_day_type;
  }

  function formatFirstCallMedianPair(slice) {
    if (!slice) return "—";
    var wd = slice.weekday && slice.weekday.median_minutes;
    var we = slice.weekend && slice.weekend.median_minutes;
    if (wd == null && we == null) return "—";
    var left = wd != null ? fmtDuration(wd) : "—";
    var right = we != null ? fmtDuration(we) : "—";
    return left + " / " + right;
  }

  function formatFirstCallByDayTypeBench(slice) {
    if (!slice) return "";
    var market = formatFirstCallMedianPair(slice);
    if (market === "—") return "";
    var wdN = slice.weekday && slice.weekday.n != null ? slice.weekday.n : null;
    var weN = slice.weekend && slice.weekend.n != null ? slice.weekend.n : null;
    var nPart =
      wdN != null && weN != null ? " · n=" + fmtInt(wdN) + " / " + fmtInt(weN) : "";
    return "Рынок: " + market + nPart;
  }

  function compareFirstCallByDayType(companySlice, marketSlice) {
    if (!companySlice || !marketSlice) return "";
    var wdN = companySlice.weekday && companySlice.weekday.n;
    var weN = companySlice.weekend && companySlice.weekend.n;
    if (
      wdN == null ||
      weN == null ||
      wdN < FIRST_CALL_DAY_TYPE_MIN_N ||
      weN < FIRST_CALL_DAY_TYPE_MIN_N
    ) {
      return "";
    }
    var companyRatio = companySlice.weekend_vs_weekday_ratio;
    var marketRatio = marketSlice.weekend_vs_weekday_ratio;
    if (companyRatio == null || marketRatio == null) return "";

    if (companySlice.weekend_slower) {
      if (companyRatio > marketRatio * 1.1) {
        return deltaTag(
          "bad",
          "На выходных ×" + fmtNum(companyRatio) + " — хуже рынка (×" + fmtNum(marketRatio) + ")"
        );
      }
      if (companyRatio < marketRatio * 0.9) {
        return deltaTag(
          "good",
          "На выходных ×" + fmtNum(companyRatio) + " — лучше рынка (×" + fmtNum(marketRatio) + ")"
        );
      }
      return deltaTag("neutral", "На выходных ×" + fmtNum(companyRatio) + " — на уровне рынка");
    }

    if (!companySlice.weekend_slower) {
      return deltaTag("good", "На выходных не медленнее будней");
    }
    return "";
  }

  function renderApplicationsSummary(data) {
    if (!els.applicationsSummary) return;
    var sent = (data.applications || []).length;
    var quorumMet = sent >= APPLICATIONS_QUORUM;
    var withoutTouches = getApplicationsWithoutTouchesCount();
    var channelCounts = channelCountsForEvents((data.events || []).filter(isTouchInRating));

    els.applicationsSummary.innerHTML =
      '<div class="dash-applications-summary__grid">' +
      '<article class="dash-kpi">' +
      '<p class="dash-kpi__label">Заявок отправлено</p>' +
      '<p class="dash-kpi__value">' +
      esc(fmtInt(sent) + " из " + fmtInt(PLANNED_APPLICATIONS)) +
      "</p>" +
      '<p class="dash-kpi__bench">Кворум: ' +
      fmtInt(APPLICATIONS_QUORUM) +
      (quorumMet
        ? ' <span class="dash-quorum-check" title="Кворум достигнут" aria-label="Кворум достигнут">✓</span>'
        : ' <span class="dash-quorum-check dash-quorum-check--bad" title="Ниже кворума" aria-label="Ниже кворума">×</span>') +
      "</p>" +
      "</article>" +
      '<article class="dash-kpi">' +
      '<p class="dash-kpi__label">Заявок без касаний (любой канал)</p>' +
      '<p class="dash-kpi__value">' +
      esc(withoutTouches != null ? fmtInt(withoutTouches) : "—") +
      "</p>" +
      "</article>" +
      '<article class="dash-kpi">' +
      '<p class="dash-kpi__label">' + esc(AVG_TOUCHES_PER_SENT_APP_LABEL) + "</p>" +
      '<p class="dash-kpi__value">' +
      esc(formatAvgTouchesPerApp()) +
      "</p>" +
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
      var identifiedEvents = events.filter(isTouchInRating);
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
        var expanded = !!state.expandedAppIds[app.application_id];
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
      '<th class="dash-table__expand-th" aria-hidden="true"></th>' +
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
        if (state.expandedAppIds[id]) delete state.expandedAppIds[id];
        else state.expandedAppIds[id] = true;
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
    if (key === "total") return row.totalIdentified;
    if (row.channelCounts && row.channelCounts[key] != null) return row.channelCounts[key];
    return row.order;
  }

  function isNumericSort(key) {
    return key === "call" || key === "sms" || key === "max" || key === "whatsapp" || key === "telegram" || key === "total";
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
      timeZone: "Europe/Moscow",
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
    var parts = new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "numeric",
      month: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d);
    var day = "";
    var month = "";
    var hour = "";
    var minute = "";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "day") day = parts[i].value;
      if (parts[i].type === "month") month = parts[i].value;
      if (parts[i].type === "hour") hour = parts[i].value;
      if (parts[i].type === "minute") minute = parts[i].value;
    }
    var monthName = months[Number(month) - 1] || month;
    return day + " " + monthName + ", " + hour + ":" + minute;
  }

  function renderExecutiveSummary(d, m) {
    var lines = [];
    var speed = d.avg_call_response;
    var marketSpeed = m && m.avg_call_response ? m.avg_call_response.mean : null;

    if (speed != null && marketSpeed != null && speed <= (m.avg_call_response.best || speed)) {
      lines.push(
        "Сильная сторона: медиана первого звонка — " +
          fmtDuration(speed) +
          " (на уровне лучшего значения рынка)."
      );
    } else if (speed != null && marketSpeed != null && speed < marketSpeed) {
      lines.push(
        "Скорость первого звонка — " +
          fmtDuration(speed) +
          ", быстрее среднего рынка (" +
          fmtDuration(marketSpeed) +
          ")."
      );
    } else if (speed != null) {
      lines.push(
        "Медиана первого звонка — " + fmtDuration(speed) + "."
      );
    }

    var dayType = getFirstCallByDayType(d);
    var marketDayType = m && m.first_call_by_day_type;
    if (
      dayType &&
      marketDayType &&
      dayType.weekend_slower &&
      dayType.weekend_vs_weekday_ratio != null &&
      marketDayType.weekend_vs_weekday_ratio != null &&
      dayType.weekend_vs_weekday_ratio > marketDayType.weekend_vs_weekday_ratio * 1.1 &&
      dayType.weekday &&
      dayType.weekend &&
      dayType.weekday.n >= FIRST_CALL_DAY_TYPE_MIN_N &&
      dayType.weekend.n >= FIRST_CALL_DAY_TYPE_MIN_N
    ) {
      lines.push(
        "На выходных первый звонок заметно медленнее будней (×" +
          fmtNum(dayType.weekend_vs_weekday_ratio) +
          " против ×" +
          fmtNum(marketDayType.weekend_vs_weekday_ratio) +
          " по рынку) — часто ответ переносится на понедельник."
      );
    }

    if (d.no_call_share != null && m && m.no_call_share) {
      if (d.no_call_share > m.no_call_share.mean) {
        lines.push(
          "Зона роста: " +
            fmtPct(d.no_call_share) +
            " заявок без перезвона (рынок ~" +
            fmtPct(m.no_call_share.mean) +
            ")."
        );
      } else {
        lines.push(
          "Покрытие перезвоном: " +
            fmtPct(100 - d.no_call_share) +
            " заявок со звонком."
        );
      }
    }

    if ((d.messenger_penetration_share || 0) === 0) {
      lines.push(
        "SMS или мессенджеров по отправленным заявкам не найдено."
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
        SPEED_LABEL,
        d.avg_call_response != null ? fmtDuration(d.avg_call_response) : "—",
        m && m.avg_call_response
          ? "Рынок: " +
            fmtDuration(m.avg_call_response.mean) +
            " · лучшее: " +
            fmtDuration(m.avg_call_response.best)
          : "",
        compareSpeed(d.avg_call_response, m)
      ),
      kpiCard(
        FIRST_CALL_WEEKDAY_WEEKEND_LABEL,
        formatFirstCallMedianPair(getFirstCallByDayType(d)),
        formatFirstCallByDayTypeBench(m && m.first_call_by_day_type),
        compareFirstCallByDayType(
          getFirstCallByDayType(d),
          m && m.first_call_by_day_type
        )
      ),
      kpiCard(
        NO_CALL_LABEL,
        d.no_call_share != null ? fmtPct(d.no_call_share) : "—",
        m && m.no_call_share ? "Рынок: " + fmtPct(m.no_call_share.mean) : "",
        compareNoCall(d.no_call_share, m)
      ),
      kpiCard(
        MESSENGER_PENETRATION_LABEL,
        d.messenger_penetration_share != null ? fmtPct(d.messenger_penetration_share) : "—",
        m && m.messengers ? "Рынок: " + fmtPct(m.messengers.mean) : "",
        compareMessengers(d.messenger_penetration_share, m)
      ),
      kpiCard(
        AVG_TOUCHES_PER_RESPONDED_APP_LABEL,
        formatAvgTouchesPerRespondedApp(),
        (marketMeanTouchesPerResponded() != null
          ? "Рынок: " + fmtNum(marketMeanTouchesPerResponded())
          : "") +
          " · " +
          AVG_TOUCHES_PER_RESPONDED_BENCH,
        compareTouchesPerResponded(getAvgTouchesPerRespondedApp())
      ),
      kpiCard(
        AVG_TOUCHES_PER_SENT_APP_LABEL,
        formatAvgTouchesPerApp(),
        marketMeanTouchesPerSent() != null
          ? "Рынок: " + fmtNum(marketMeanTouchesPerSent()) + " · все отправленные заявки"
          : "все отправленные заявки",
        compareTouchesPerSent(getAvgTouchesPerApp())
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
    if (company == null || !m || !m.avg_call_response) return "";
    var mean = m.avg_call_response.mean;
    if (company < mean) return deltaTag("good", "Быстрее среднего рынка");
    if (company > mean) return deltaTag("bad", "Медленнее среднего рынка");
    return deltaTag("neutral", "На уровне рынка");
  }

  function compareNoCall(company, m) {
    if (company == null || !m || !m.no_call_share) return "";
    var mean = m.no_call_share.mean;
    if (company > mean) return deltaTag("bad", "Хуже среднего на " + Math.round(company - mean) + " п.п.");
    if (company < mean) return deltaTag("good", "Лучше среднего на " + Math.round(mean - company) + " п.п.");
    return deltaTag("neutral", "На уровне рынка");
  }

  function compareTouchesPerResponded(company) {
    var mean = marketMeanTouchesPerResponded();
    if (company == null || mean == null) return "";
    if (company > mean) return deltaTag("good", "Выше среднего рынка");
    if (company < mean) return deltaTag("bad", "Ниже среднего рынка");
    return deltaTag("neutral", "На уровне рынка");
  }

  function compareTouchesPerSent(company) {
    var mean = marketMeanTouchesPerSent();
    if (company == null || mean == null) return "";
    if (company > mean) return deltaTag("good", "Выше среднего рынка");
    if (company < mean) return deltaTag("bad", "Ниже среднего рынка");
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

  function renderDiagnostics(d, m) {
    var cards = buildDiagnosticCards(d, m);
    if (!cards.length) {
      cards.push({
        tag: "check",
        tagLabel: "Проверка",
        title: "Сильные показатели по агрегатам",
        body: "По текущим метрикам явных отставаний от рынка не видно. Обсудите удержание скорости, защиту от утечек и омниканальность как следующий шаг.",
        checks: ["Сверка заявок в CRM", "Мониторинг спама по заявкам"],
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
          "</article>"
        );
      })
      .join("");
  }

  function buildDiagnosticCards(d, m) {
    var cards = [];

    if (d.avg_call_response != null && m && m.avg_call_response && d.avg_call_response > m.avg_call_response.mean) {
      cards.push({
        tag: "risk",
        tagLabel: "Зона роста",
        title: "Медленный первый звонок",
        body:
          "Медиана " +
          fmtDuration(d.avg_call_response) +
          " против " +
          fmtDuration(m.avg_call_response.mean) +
          " в среднем по рынку.",
        checks: [
          "Проверить маршрутизацию лидов в CRM",
          "Сверить время первого звонка в телефонии",
          "Исключить задержки из-за антиспама оператора",
        ],
      });
    }

    var dayType = getFirstCallByDayType(d);
    var marketDayType = m && m.first_call_by_day_type;
    if (
      dayType &&
      marketDayType &&
      dayType.weekend_slower &&
      dayType.weekend_vs_weekday_ratio != null &&
      marketDayType.weekend_vs_weekday_ratio != null &&
      dayType.weekend_vs_weekday_ratio > marketDayType.weekend_vs_weekday_ratio * 1.1 &&
      dayType.weekday &&
      dayType.weekend &&
      dayType.weekday.n >= FIRST_CALL_DAY_TYPE_MIN_N &&
      dayType.weekend.n >= FIRST_CALL_DAY_TYPE_MIN_N
    ) {
      cards.push({
        tag: "risk",
        tagLabel: "Зона роста",
        title: "Медленный первый звонок в выходные",
        body:
          "Будни " +
          fmtDuration(dayType.weekday.median_minutes) +
          ", выходные " +
          fmtDuration(dayType.weekend.median_minutes) +
          " (×" +
          fmtNum(dayType.weekend_vs_weekday_ratio) +
          "). Рынок: " +
          formatFirstCallMedianPair(marketDayType) +
          ".",
        checks: [
          "Есть ли дежурная смена или автоответ в сб/вс",
          "Попадают ли заявки с сайта в CRM в выходные без задержки до понедельника",
          "Сверить SLA по слотам отправки заявки",
        ],
      });
    }

    if (d.no_call_share != null && m && m.no_call_share && d.no_call_share > m.no_call_share.mean) {
      var missed = Math.round(((d.no_call_share / 100) * (d.applications_sent || 0)));
      cards.push({
        tag: "risk",
        tagLabel: "Зона роста",
        title: "Низкое покрытие звонком",
        body:
          fmtPct(d.no_call_share) +
          " заявок без перезвона (~" +
          missed +
          " из " +
          fmtInt(d.applications_sent) +
          "). Это может быть отсутствие перезвона или звонок не засчитан по правилам рейтинга.",
        checks: [
          "Найти наши заявки в CRM",
          "Проверить статусы и причины недозвона",
          "Проверить блокировки антиспам-фильтрами",
        ],
      });
    }

    var avgTouchesPerResponded = getAvgTouchesPerRespondedApp();
    if (
      (avgTouchesPerResponded || 0) < 2 &&
      d.no_call_share != null &&
      d.no_call_share < 50
    ) {
      cards.push({
        tag: "check",
        tagLabel: "Проверить",
        title: "Мало повторных касаний",
        body:
          "В среднем " +
          fmtNum(avgTouchesPerResponded) +
          " касаний на заявку с ответом. При недозвоне клиент может не получить второй контакт.",
        checks: [
          "Есть ли сценарий повторного звонка или SMS после недозвона",
          "Настроены ли задачи менеджерам в CRM",
        ],
      });
    }

    if ((d.messenger_penetration_share || 0) === 0) {
      cards.push({
        tag: "check",
        tagLabel: "Проверить",
        title: "Не видно SMS и мессенджеров",
        body:
          "По заявкам не зафиксировано сообщений в SMS или мессенджерах",
        checks: [
          "Уходили ли SMS или сообщения в мессенджерах после заявки",
          "Импортируется ли переписка в CRM",
        ],
      });
    }

    if (d.avg_call_response != null && m && m.avg_call_response && d.avg_call_response <= m.avg_call_response.best + 5) {
      cards.unshift({
        tag: "strength",
        tagLabel: "Сильная сторона",
        title: "Высокая скорость первого звонка",
        body:
          "Медиана " +
          fmtDuration(d.avg_call_response) +
          " — на уровне лучших значений рынка. Стоит закрепить как внутренний стандарт.",
        checks: ["Зафиксировать SLA в CRM", "Контролировать скорость по сменам"],
      });
    }

    cards.push({
      tag: "check",
      tagLabel: "Рынок",
      title: "Риск утечек и спама по заявкам",
      body:
        "На рынке значительная доля входящих контактов — спам или чужие звонки. Для доказательной проверки утечек нужен отдельный аудит с tracking numbers, а не сводка в рейтинге.",
      checks: [
        "Оценить долю нецелевых контактов после тестовых заявок",
        "Проверить, не быстрее ли спамеры официального ответа",
      ],
    });

    return cards.slice(0, 5);
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
