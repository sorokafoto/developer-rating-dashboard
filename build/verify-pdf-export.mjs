// Smoke-test PDF export. Run: node build/verify-pdf-export.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:4322";

async function loadCompany(page, name) {
  await page.goto(BASE + "/?company=" + encodeURIComponent(name), { waitUntil: "networkidle" });
  await page.waitForSelector("#panel-present:not([hidden])", { timeout: 15000 });
  await page.waitForFunction(
    () => {
      const ctx = window.DashboardExportContext;
      if (!ctx) return false;
      const s = ctx.getState();
      if (!s.company) return false;
      if (s.company.insufficient_data) return true;
      return !s.companyEventsLoading;
    },
    { timeout: 20000 }
  );
}

async function snapshot(page) {
  return page.evaluate(() => {
    const ctx = window.DashboardExportContext;
    const s = ctx.getState();
    const d = s.company;
    const kpis = ctx.buildKpiExportData(d, s.market);
    const lines = ctx.buildExecutiveSummaryLines(d, s.market);
    const events = s.companyEvents;
    const apps = events && events.applications ? events.applications.length : 0;
    return {
      name: d.developer_name,
      insufficient: !!d.insufficient_data,
      kpiCount: kpis.length,
      linesCount: lines.length,
      applications: apps,
      firstKpiValue: kpis[0] && kpis[0].value,
      hasExportBtn: !!document.getElementById("btn-export-pdf"),
      hasLogoInCopy: !!(window.REPORT_COPY && window.REPORT_COPY.logoUrl),
    };
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await loadCompany(page, "Sminex");
  const sminex = await snapshot(page);
  console.log("Sminex:", JSON.stringify(sminex));
  if (!sminex.hasExportBtn) throw new Error("export button missing");
  if (sminex.insufficient) throw new Error("Sminex should have quorum");
  if (sminex.kpiCount !== 7) throw new Error("expected 7 KPIs");
  if (sminex.applications < 1) throw new Error("expected applications data");

  await loadCompany(page, "Гранель");
  const granel = await snapshot(page);
  console.log("Гранель:", JSON.stringify(granel));
  if (!granel.insufficient) throw new Error("Гранель should be insufficient_data");

  await loadCompany(page, "ССК");
  const ssk = await snapshot(page);
  console.log("ССК:", JSON.stringify(ssk));
  if (!ssk.insufficient) throw new Error("ССК should be insufficient_data");

  await loadCompany(page, "Sminex");
  const pdfOk = await page.evaluate(async () => {
    try {
      let captured = "";
      const origHtml2pdf = window.html2pdf;
      window.html2pdf = function () {
        return {
          set: function () {
            return this;
          },
          from: function (el) {
            captured = el.innerHTML;
            return this;
          },
          save: function () {
            return Promise.resolve();
          },
        };
      };

      await window.ReportExport.run();
      window.html2pdf = origHtml2pdf;

      const checks = {
        phonesTitle: captured.includes("Телефонные номера для заявок"),
        printTable: captured.includes("report-pdf__print-table"),
        pageStart: captured.includes("report-pdf__page-start"),
        noResearchHeading: !captured.includes("Подробнее об исследовании"),
        summaryHeading: captured.includes("Сводка по заявкам"),
        appsHeading: captured.includes("Детализация по заявкам"),
        appBundle: captured.includes("report-pdf__app-bundle"),
        eventsCaption: captured.includes('report-pdf__table-caption">События'),
        noKpiNotes: !captured.includes("report-pdf__notes"),
        noMedianHint: !captured.includes("типичное время"),
        noExecutiveSummary: !captured.includes("Краткий вывод"),
        noStatusCol: !captured.includes("<th>Статус</th>"),
        ratingUrl:
          window.REPORT_COPY &&
          window.REPORT_COPY.links &&
          window.REPORT_COPY.links.rating &&
          window.REPORT_COPY.links.rating.url === "https://estaterating.ru/",
      };
      if (!Object.values(checks).every(Boolean)) {
        console.error("PDF content checks failed", checks);
        return false;
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  });
  if (!pdfOk) throw new Error("Sminex PDF export failed");

  await loadCompany(page, "Гранель");
  const reducedOk = await page.evaluate(async () => {
    try {
      await window.ReportExport.run();
      return true;
    } catch (e) {
      return false;
    }
  });
  if (!reducedOk) throw new Error("Гранель reduced PDF export failed");

  console.log("OK: smoke tests passed");
} finally {
  await browser.close();
}
