# Pokemon GO 活動曆

Pokemon GO 本週、本月、本季活動一覽，寶可夢圖卡，一鍵追蹤同步到 iPhone 行事曆。

- 網站：`https://<GitHub帳號>.github.io/pogo-calendar/`
- 版本列表：`/versions.html`
- 依類型訂閱：`webcal://<GitHub帳號>.github.io/pogo-calendar/cal/all.ics`（或 `community-day.ics` 等）

## 運作方式

```
GitHub Actions（每 6 小時）
  └─ 抓 ScrapedDuck 活動資料 → 加中文名 → events.json + 各類型 .ics → GitHub Pages
Cloudflare Worker + KV
  └─ 每位使用者一個專屬訂閱網址，按「追蹤」就會出現在 iPhone 行事曆
```

## 開發

```powershell
cd v1.0.0
npm test          # 用樣本資料建置 + 驗證 ICS + Worker 測試
```

版本與部署規則見 [CLAUDE.md](CLAUDE.md)。

## 資料來源與聲明

活動資料來自 [LeekDuck.com](https://leekduck.com)，經由 [ScrapedDuck](https://github.com/bigfoott/ScrapedDuck) 取得；中文名來自 [PokeAPI](https://pokeapi.co)。
本站為非官方網站，與 Niantic、The Pokémon Company、任天堂無關。不收費、不放廣告。
