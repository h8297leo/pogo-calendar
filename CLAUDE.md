# Pokemon GO 活動曆 — 專案規則（給 Claude Code）

公開網站：Pokemon GO 本週／本月／本季活動、寶可夢圖卡、追蹤後同步到 iPhone 行事曆。
介面一律繁體中文（台灣用語），時間以 Asia/Taipei 顯示。

- GitHub repo：`pogo-calendar`（public）
- 網站：`https://<GitHub帳號>.github.io/pogo-calendar/`
- 帳號名稱用 `gh api user --jq .login` 查詢，不要猜。
- 使用者用 Windows + PowerShell；路徑含空格與中文，指令中的路徑一律加引號。

## 目錄結構

```
/                       ← git repo 根目錄
├─ CLAUDE.md, README.md, CHANGELOG.md
├─ versions.json        ← 版本清單與狀態（stable / test / archived）
├─ index.html           ← 導向 stable 版本（沒有 stable 時導向最新 test）
├─ versions.html        ← 版本列表
├─ tools/assemble.mjs   ← 建置所有版本並組出 _site/
├─ .github/workflows/deploy.yml
└─ vX.Y.Z/              ← 每個版本是獨立、完整的資料夾
   ├─ scripts/core.mjs        共用：類型對照、時間、ICS（不可用 Node API，Worker 也會 import）
   ├─ scripts/build.mjs       抓 ScrapedDuck → site/data/events.json + site/cal/*.ics
   ├─ scripts/validate-ics.mjs
   ├─ site/                   前端（純 HTML/CSS/JS）；config.js 放版本號與 Worker 網址
   ├─ worker/                 Cloudflare Worker（個人追蹤 → 專屬 ICS）
   └─ test/                   樣本資料與測試（npm test）
```

部署後的網址：
- `/vX.Y.Z/`：各版本
- `/cal/*.ics`、`/data/events.json`：永遠是正式版的資料（沒有正式版時用最新 test），所以訂閱網址不會因為換版本而改變

## 版本規則（嚴格遵守）

1. 版本號用語意化版本 `vMAJOR.MINOR.PATCH`。
2. 開新版本：複製上一版整個資料夾 → 改名成新版本號 → 修改。**舊版本資料夾不得更動。**
   - 同時要改：`site/config.js` 的 `version`、`worker/wrangler.toml` test 環境的 `EVENTS_URL` 路徑、`package.json` 的 name。
   - 在 `versions.json` 加一筆 `status: "test"`，並更新 `CHANGELOG.md`。
3. 新版本一律先以 **test** 公開。test 版頁面頂端會自動顯示「測試版」橫幅（依 versions.json 判斷）。
4. 使用者說「升級正式版」時：把該版改成 `stable`，原本的 stable 改成 `archived`。如果 Worker 有改，要用 `npx wrangler deploy`（正式環境）部署新版本的 worker。
5. **不做本機伺服器測試。** 測試流程是：`npm test`（樣本資料單元測試）→ push → 等 Actions 完成 → 用 curl 驗證公開網址。

## 資料來源與條款

- 來源：`https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.min.json`（LeekDuck.com 的資料）。
- 條款：不得收費、不得放廣告，頁面必須註明 ScrapedDuck 與 LeekDuck.com。
- 時間：字串結尾有 `Z` 代表全球同時（UTC）；沒有的是玩家當地時間 → 網站當成 +08:00，ICS 寫成 floating time（不帶時區）。
- 中文名：由 PokeAPI 的 `pokemon_species_names.csv` 取得（zh-Hant），快取在 `vX.Y.Z/data/zh-names.json`（不進 git，Actions 有 cache）。

## 首次部署（v1.0.0）

需要使用者協助的步驟（登入、授權），停下來清楚說明要做什麼。

0. 把 `tools/deploy.yml` 移到 `.github/workflows/deploy.yml`（遠端工具無法直接寫入 .github 資料夾，所以先放在 tools/）：
   ```powershell
   New-Item -ItemType Directory -Force ".github/workflows" | Out-Null
   Move-Item "tools/deploy.yml" ".github/workflows/deploy.yml" -Force
   ```
1. 確認登入：`gh auth status`、`npx wrangler whoami`。
2. 在 `v1.0.0` 跑 `npm test`，必須全部通過。
3. 建立 repo 並推送：
   ```powershell
   git init -b main
   git add -A
   git commit -m "v1.0.0：初版"
   gh repo create pogo-calendar --public --source . --push
   ```
4. 啟用 Pages（來源設為 GitHub Actions）：
   ```powershell
   gh api -X POST "repos/{owner}/pogo-calendar/pages" -f build_type=workflow
   ```
   （已存在就改用 `-X PUT`。）然後 `gh workflow run deploy.yml`，用 `gh run watch` 等它完成。
5. 驗證公開網址（全部要回應 200 且內容正確）：
   - `/`（會導向 `/v1.0.0/`）
   - `/v1.0.0/`、`/v1.0.0/data/events.json`（events 數量 > 0）
   - `/cal/all.ics`、任一 `/v1.0.0/cal/event/<id>.ics`
   - 從 events.json 抽查：社群日的 `start` 沒有 Z，ICS 的 DTSTART 沒有 Z（floating）
6. Cloudflare Worker：
   ```powershell
   cd "v1.0.0/worker"
   npx wrangler kv namespace create TRACKS
   npx wrangler kv namespace create TRACKS --env test
   ```
   把兩個 KV id 與 GitHub 帳號（小寫）填進 `wrangler.toml`，然後：
   ```powershell
   npx wrangler deploy --env test
   npx wrangler deploy
   ```
7. 把 Worker 網址填進 `v1.0.0/site/config.js`（`test` 填 pogo-calendar-test 的網址，`stable` 填 pogo-calendar 的網址），commit 並 push，等部署完成。
8. 用 curl 驗證 Worker 的完整流程（token 是 22 字元 base64url）：
   PUT `/u/<token>/track/<id>` → GET `/u/<token>.ics` 要包含該活動 → DELETE → 確認已移除。
   注意：正式環境的 EVENTS_URL 指向根目錄 `/data/events.json`，在還沒有 stable 版本時，會使用最新 test 版本的資料。
9. 回報：網站網址、v1.0.0 網址、兩個 Worker 網址、驗證結果，以及請使用者在 iPhone 上確認的清單：
   - 社群日在行事曆顯示為 14:00–17:00
   - 提醒正常出現（前 1 小時、社群日前 1 天）
   - 按追蹤後，數小時內出現在「我的追蹤」行事曆；取消後會消失

## 常用指令

- 開新測試版：「以 v1.0.0 為基礎建立 v1.1.0（test），修改：……，部署並驗證公開網址」
- 升級正式版：「把 v1.1.0 升級為正式版，舊正式版改為 archived，部署並驗證」
