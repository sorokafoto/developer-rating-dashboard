# Дашборд расширенной аналитики рейтинга

Внутренний sales-enablement инструмент для менеджеров Интроверта: поиск застройщика из рейтинга, метрики компании и сравнение с обезличенным рынком.

Спецификация: [docs/dashboard-prd.md](docs/dashboard-prd.md)

Публичный рейтинг: [../developer-response-rating/](../developer-response-rating/)

## Запуск

Данные подтягиваются из проекта `developer-response-rating`:

```bash
cd ../developer-response-rating
npm run build-data              # → data/working/data.json
npm run sync-dashboard-data     # копия в этот репозиторий
npm run export-company-events   # при необходимости
```

Публичный рейтинг (`estaterating.ru`, GitHub Pages `estate-rating`) обновляется **отдельно** через `npm run promote-public-data` в рейтинге — пуш дашборда не меняет сайт.

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

На Pages доступны поиск, обзор, KPI и вкладка «Заявки» (`company-events/` в репозитории). Входящие номера в JSON маскированы; не публикуйте ссылку широко без необходимости.

## Приватность

- Каталог `company-events/` коммитится для GitHub Pages (маскированные входящие номера).
- Обновление: `npm run export-company-events` в `developer-response-rating`, затем commit + push дашборда.
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
