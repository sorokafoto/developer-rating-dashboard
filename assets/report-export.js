/* Экспорт PDF-отчёта по застройщику. Спека: ../docs/prd-pdf-export.md */
(function () {
  "use strict";

  var PHONES_SECTION_TITLE = "Телефонные номера для заявок";

  function waitFonts() {
    if (document.fonts && document.fonts.ready) return document.fonts.ready;
    return Promise.resolve();
  }

  function formatReportDate() {
    return new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function buildHeader(ctx) {
    var state = ctx.getState();
    var d = state.company;
    var copy = ctx.REPORT_COPY || {};
    var p = ctx.periodPhones();
    var study = p && p.study_from && p.study_to ? ctx.formatStudyRange(p.study_from, p.study_to) : "";
    var periodLabel = (p && p.label) || "II квартал 2026";
    var siteHref = d.url ? "https://" + String(d.url).replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : "";
    var siteDisplay = d.url || "";

    return (
      '<header class="report-pdf__header">' +
      '<div class="report-pdf__header-main">' +
      "<h1 class=\"report-pdf__title\">" +
      ctx.esc(copy.title || "Расширенный отчёт по реакции на заявки") +
      "</h1>" +
      '<p class="report-pdf__company">' +
      ctx.esc(d.developer_name) +
      "</p>" +
      '<p class="report-pdf__meta">' +
      ctx.esc(periodLabel) +
      (study ? " · исследование " + ctx.esc(study) : "") +
      "<br>" +
      (siteHref ? '<a href="' + ctx.esc(siteHref) + '">' + ctx.esc(siteDisplay) + "</a> · " : "") +
      "сформирован " +
      ctx.esc(formatReportDate()) +
      "</p></div>" +
      '<a class="report-pdf__logo-link" href="' +
      ctx.esc(copy.logoUrl || "https://introvert.bz/") +
      '">' +
      '<img class="report-pdf__logo" src="icons/introvert-systems.svg" alt="Интроверт" height="11">' +
      "</a></header>"
    );
  }

  function buildKpiSection(ctx) {
    var state = ctx.getState();
    var copy = ctx.REPORT_COPY || {};
    var kpis = ctx.buildKpiExportData(state.company, state.market);
    var explanations = copy.metricExplanations || {};

    var cards = kpis
      .map(function (kpi) {
        var explain = explanations[kpi.explanationKey] || "";
        return (
          '<article class="report-pdf__kpi">' +
          '<p class="report-pdf__kpi-label">' +
          ctx.esc(kpi.label) +
          "</p>" +
          '<p class="report-pdf__kpi-value">' +
          ctx.esc(kpi.value) +
          "</p>" +
          (kpi.bench ? '<p class="report-pdf__kpi-bench">' + ctx.esc(kpi.bench) + "</p>" : "") +
          (kpi.deltaText ? '<p class="report-pdf__kpi-delta">' + ctx.esc(kpi.deltaText) + "</p>" : "") +
          (explain ? '<p class="report-pdf__kpi-explain">' + ctx.esc(explain) + "</p>" : "") +
          "</article>"
        );
      })
      .join("");

    return (
      '<section class="report-pdf__section">' +
      '<h2 class="report-pdf__section-title">Ключевые показатели</h2>' +
      '<div class="report-pdf__kpi-grid">' +
      cards +
      "</div></section>"
    );
  }

  function printTableRow(cells) {
    return "<tr>" + cells.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr>";
  }

  var SUMMARY_TABLE_COLGROUP = "<colgroup><col><col></colgroup>";

  function buildApplicationsSummaryPrintHtml(ctx, data) {
    var touchEvents = (data.events || []).filter(ctx.isTouchInRating);
    var channelCounts = ctx.channelCountsForEvents(touchEvents);
    var sent = (data.applications || []).length;

    var statsHtml =
      '<h3 class="report-pdf__subsection-title report-pdf__subsection-title--first">Сводка по заявкам</h3>' +
      '<table class="report-pdf__print-table report-pdf__print-table--summary">' +
      SUMMARY_TABLE_COLGROUP +
      "<thead><tr><th>Показатель</th><th>Значение</th></tr></thead><tbody>" +
      printTableRow([
        ctx.esc("Заявок отправлено"),
        ctx.esc(ctx.fmtInt(sent) + " из " + ctx.fmtInt(ctx.PLANNED_APPLICATIONS)),
      ]) +
      printTableRow([
        ctx.esc("Заявок без касаний"),
        ctx.esc(ctx.formatApplicationsWithoutTouches()),
      ]) +
      printTableRow([
        ctx.esc(ctx.AVG_TOUCHES_PER_SENT_APP_LABEL),
        ctx.esc(ctx.formatAvgTouchesPerApp()),
      ]) +
      "</tbody></table>";

    var channelsHtml =
      '<h3 class="report-pdf__subsection-title">Касания по каналам</h3>' +
      '<table class="report-pdf__print-table report-pdf__print-table--summary">' +
      SUMMARY_TABLE_COLGROUP +
      "<thead><tr><th>Канал</th><th>Кол-во</th></tr></thead><tbody>" +
      printTableRow([ctx.esc("Звонки"), ctx.esc(ctx.fmtInt(channelCounts.call))]) +
      printTableRow([ctx.esc("SMS"), ctx.esc(ctx.fmtInt(channelCounts.sms))]) +
      printTableRow([ctx.esc("Max"), ctx.esc(ctx.fmtInt(channelCounts.max))]) +
      printTableRow([ctx.esc("WhatsApp"), ctx.esc(ctx.fmtInt(channelCounts.whatsapp))]) +
      printTableRow([ctx.esc("Telegram"), ctx.esc(ctx.fmtInt(channelCounts.telegram))]) +
      "</tbody></table>";

    return '<div class="report-pdf__print-block">' + statsHtml + channelsHtml + "</div>";
  }

  function buildApplicationsTablePrintHtml(ctx, rows) {
    var copy = ctx.REPORT_COPY || {};
    var colCount = 11;
    var hasSpam = rows.some(function (r) {
      return r.hasSpamEvents;
    });

    var body = rows
      .map(function (row) {
        var app = row.app;
        var events = row.events;
        var counts = row.channelCounts;

        var main =
          "<tr>" +
          '<td class="report-pdf__cell-nowrap">' +
          ctx.esc(String(row.order)) +
          ' <span class="report-pdf__app-id">' +
          ctx.esc(app.application_id) +
          "</span></td>" +
          "<td>" +
          ctx.esc(ctx.formatShortDateTime(app.submitted_at)) +
          "</td>" +
          "<td>" +
          ctx.esc(ctx.translateDay(app.day_of_week)) +
          "</td>" +
          "<td>" +
          ctx.esc(ctx.translateSlot(app.time_slot)) +
          "</td>" +
          '<td class="report-pdf__cell-nowrap">' +
          ctx.esc(ctx.applicationPhone(app)) +
          "</td>" +
          "<td>" +
          ctx.esc(ctx.fmtInt(row.totalIdentified)) +
          (row.hasSpamEvents ? "*" : "") +
          "</td>" +
          '<td class="report-pdf__num">' +
          ctx.esc(ctx.fmtInt(counts.call)) +
          "</td>" +
          '<td class="report-pdf__num">' +
          ctx.esc(ctx.fmtInt(counts.sms)) +
          "</td>" +
          '<td class="report-pdf__num">' +
          ctx.esc(ctx.fmtInt(counts.max)) +
          "</td>" +
          '<td class="report-pdf__num">' +
          ctx.esc(ctx.fmtInt(counts.whatsapp)) +
          "</td>" +
          '<td class="report-pdf__num">' +
          ctx.esc(ctx.fmtInt(counts.telegram)) +
          "</td>" +
          "</tr>";

        var detail;
        if (events.length) {
          var eventRows = events
            .map(function (e) {
              return (
                "<tr>" +
                "<td>" +
                ctx.esc(ctx.formatDateTime(e.event_at)) +
                "</td>" +
                "<td>" +
                ctx.esc(ctx.channelLabel(e.channel)) +
                "</td>" +
                '<td class="report-pdf__cell-nowrap">' +
                ctx.esc(ctx.eventPhone(e)) +
                "</td>" +
                "<td>" +
                ctx.esc(e.minutes_since_application != null ? ctx.fmtDuration(e.minutes_since_application) : "—") +
                "</td>" +
                "</tr>"
              );
            })
            .join("");
          detail =
            '<tr class="report-pdf__events-row"><td colspan="' +
            colCount +
            '">' +
            '<table class="report-pdf__print-table report-pdf__print-table--nested">' +
            '<caption class="report-pdf__table-caption">События</caption>' +
            "<thead><tr><th>Время</th><th>Канал</th><th>Номер</th><th>Через</th></tr></thead>" +
            "<tbody>" +
            eventRows +
            "</tbody></table></td></tr>";
        } else {
          detail =
            '<tr class="report-pdf__events-row"><td colspan="' +
            colCount +
            '"><p class="report-pdf__events-empty">' +
            ctx.esc(copy.noEvents || "Событий не зафиксировано") +
            "</p></td></tr>";
        }

        return '<tbody class="report-pdf__app-bundle">' + main + detail + "</tbody>";
      })
      .join("");

    var footnote = hasSpam
      ? '<p class="report-pdf__footnote">* ' + ctx.esc(copy.spamFootnote || "") + "</p>"
      : "";

    return (
      '<h3 class="report-pdf__subsection-title">Детализация по заявкам</h3>' +
      '<table class="report-pdf__print-table report-pdf__print-table--apps">' +
      "<thead><tr>" +
      "<th>№</th><th>Отправлена</th><th>День</th><th>Слот</th><th>Номер</th>" +
      "<th>Касаний</th><th>Звонок</th><th>SMS</th><th>Max</th><th>WA</th><th>TG</th>" +
      "</tr></thead>" +
      body +
      "</table>" +
      footnote
    );
  }

  function buildApplicationsSection(ctx) {
    var copy = ctx.REPORT_COPY || {};
    var state = ctx.getState();
    var data = state.companyEvents;

    if (!data || !data.applications || !data.applications.length) {
      return (
        '<section class="report-pdf__section report-pdf__page-start">' +
        '<h2 class="report-pdf__section-title">Заявки и события</h2>' +
        '<p class="report-pdf__placeholder">' +
        ctx.esc(copy.applicationsUnavailable || "Детализация по заявкам для этой компании пока недоступна.") +
        "</p></section>"
      );
    }

    var rows = ctx.sortApplicationsRows(ctx.buildApplicationsExportRows(data));

    return (
      '<section class="report-pdf__section report-pdf__page-start">' +
      '<h2 class="report-pdf__section-title">Заявки и события</h2>' +
      buildApplicationsSummaryPrintHtml(ctx, data) +
      buildApplicationsTablePrintHtml(ctx, rows) +
      "</section>"
    );
  }

  function buildPhonesSection(ctx) {
    var copy = ctx.REPORT_COPY || {};
    var p = ctx.periodPhones();
    if (!p) {
      return (
        '<section class="report-pdf__section report-pdf__page-start">' +
        '<h2 class="report-pdf__section-title">' +
        ctx.esc(PHONES_SECTION_TITLE) +
        "</h2>" +
        '<p class="report-pdf__placeholder">Данные по телефонам для этого периода недоступны.</p></section>'
      );
    }

    var appPhones = p.application_phones || [];
    var verify = p.verification_phones || (p.verification_phone ? [p.verification_phone] : []);

    return (
      '<section class="report-pdf__section report-pdf__page-start">' +
      '<h2 class="report-pdf__section-title">' +
      ctx.esc(PHONES_SECTION_TITLE) +
      "</h2>" +
      '<div class="report-pdf__phones-grid">' +
      '<div><h3 class="report-pdf__phones-col-title">Заявки (' +
      appPhones.length +
      ")</h3>" +
      '<ul class="report-pdf__phones-list">' +
      appPhones
        .map(function (ph) {
          return "<li>" + ctx.esc(ctx.formatPhone(ph)) + "</li>";
        })
        .join("") +
      '</ul><p class="report-pdf__phones-note">' +
      ctx.esc(copy.phonesApplicationNote || "") +
      "</p></div>" +
      '<div><h3 class="report-pdf__phones-col-title">Проверочный (' +
      verify.length +
      ")</h3>" +
      '<ul class="report-pdf__phones-list">' +
      verify
        .map(function (ph) {
          return "<li>" + ctx.esc(ctx.formatPhone(ph)) + "</li>";
        })
        .join("") +
      '</ul><p class="report-pdf__phones-note">' +
      ctx.esc(copy.phonesVerificationNote || "") +
      "</p></div></div></section>"
    );
  }

  function buildFooter(ctx) {
    var copy = ctx.REPORT_COPY || {};
    var links = copy.links || {};

    return (
      '<footer class="report-pdf__footer">' +
      '<h2 class="report-pdf__section-title">О методе подсчёта</h2>' +
      "<p>" +
      ctx.esc(copy.disclaimer || "") +
      "</p>" +
      "<p>" +
      ctx.esc(copy.disclaimerExtra || "") +
      "</p>" +
      '<ul class="report-pdf__footer-links">' +
      (links.rating
        ? '<li><a href="' + ctx.esc(links.rating.url) + '">' + ctx.esc(links.rating.label) + "</a></li>"
        : "") +
      (links.introvert
        ? '<li><a href="' + ctx.esc(links.introvert.url) + '">' + ctx.esc(links.introvert.label) + "</a></li>"
        : "") +
      "</ul></footer>"
    );
  }

  function buildReportHtml(ctx) {
    var copy = ctx.REPORT_COPY || {};
    var d = ctx.getState().company;
    var reduced = !!(d && d.insufficient_data);

    var html =
      buildHeader(ctx) +
      '<p class="report-pdf__methodology">' +
      ctx.esc(copy.methodology || "") +
      "</p>";

    if (reduced) {
      html +=
        '<div class="report-pdf__warn">' +
        ctx.esc(
          typeof copy.insufficientDataWarning === "function"
            ? copy.insufficientDataWarning(d.applications_sent || 0)
            : "Недостаточно данных для расчёта метрик."
        ) +
        "</div>";
    } else {
      html += buildKpiSection(ctx) + buildApplicationsSection(ctx);
    }

    html += buildPhonesSection(ctx) + buildFooter(ctx);
    return html;
  }

  function run() {
    var ctx = window.DashboardExportContext;
    if (!ctx) return Promise.reject(new Error("DashboardExportContext missing"));
    var state = ctx.getState();
    if (!state.company) return Promise.reject(new Error("No company selected"));

    var root = document.getElementById("report-pdf-root");
    if (!root) return Promise.reject(new Error("report-pdf-root missing"));
    if (typeof html2pdf === "undefined") return Promise.reject(new Error("html2pdf not loaded"));

    return waitFonts().then(function () {
      root.innerHTML = '<div class="report-pdf">' + buildReportHtml(ctx) + "</div>";
      root.classList.add("report-pdf-root--render");

      var element = root.querySelector(".report-pdf");
      var filename = "introvert-rating-" + ctx.companySlug(state.company) + "-" + state.period + ".pdf";

      var opt = {
        margin: [12, 12, 18, 12],
        filename: filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: {
          mode: ["css", "legacy"],
          avoid: [".report-pdf__app-bundle", ".report-pdf__print-block", ".report-pdf__kpi"],
        },
        enableLinks: true,
      };

      return html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(function () {
          root.innerHTML = "";
          root.classList.remove("report-pdf-root--render");
        })
        .catch(function (err) {
          root.innerHTML = "";
          root.classList.remove("report-pdf-root--render");
          throw err;
        });
    });
  }

  window.ReportExport = { run: run };
})();
