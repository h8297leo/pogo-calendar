// 本版本的設定。部署 Cloudflare Worker 後，把網址填進 worker（不要結尾斜線）。
// 留空字串 = 追蹤只存在本機，並提供一次性下載 .ics 作為備援。
export default {
  version: 'v1.0.0',
  worker: {
    stable: '', // 例：https://pogo-calendar.<帳號>.workers.dev
    test: '',   // 例：https://pogo-calendar-test.<帳號>.workers.dev
  },
};
