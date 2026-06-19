# Дашборд расширенной аналитики рейтинга

Внутренний sales-enablement инструмент для менеджеров Интроверта: поиск застройщика из рейтинга, метрики компании и сравнение с обезличенным рынком.

Спецификация: [docs/dashboard-prd.md](docs/dashboard-prd.md)

Публичный рейтинг: [../developer-response-rating/](../developer-response-rating/)

## Запуск

Данные подтягиваются из соседнего проекта `developer-response-rating` (симлинки `data.js` / `data.json`). Перед первым запуском обновите агрегаты, номера цикла и выгрузку событий по компаниям:

```bash
cd ../developer-response-rating
npm run build-data
npm run export-measurement-phones
npm run export-company-events
```

- `export-measurement-phones` — 21 номер для заявок + 1 проверочный из листа `devices` → `measurement-phones.json`
- `export-company-events` — обезличенные заявки и события по каждой компании → `company-events/{slug}.json` (маскированные входящие номера)

Запуск дашборда:

```bash
npm run serve
```

Откройте `http://localhost:4322/?company=Sminex`

## GitHub Pages

Публичный деплой: **https://sorokafoto.github.io/developer-rating-dashboard/**

Репозиторий: https://github.com/sorokafoto/developer-rating-dashboard

На Pages доступны поиск, обзор и KPI по `data.json`. Вкладка «Заявки» требует локальных `company-events/` (не публикуются из‑за PII) — сгенерируйте `npm run export-company-events` в `developer-response-rating` и откройте дашборд через `npm run serve`, либо положите JSON в `company-events/` перед деплоем, если осознанно выкладываете данные на приватный хостинг.

## Приватность

- Каталог `company-events/` содержит PII в маскированном виде и **не коммитится** (см. `.gitignore`).
- Не деплоить `company-events/` на публичный хостинг вместе с дашбордом.
- В браузер подгружается только JSON выбранной компании.

## Структура

```
developer-rating-dashboard/
  index.html
  config.js
  measurement-phones.json
  company-events/          # генерируется, в .gitignore
  data.js -> ../developer-response-rating/data.js
  assets/dashboard.css
  assets/dashboard.js
  docs/dashboard-prd.md
```
