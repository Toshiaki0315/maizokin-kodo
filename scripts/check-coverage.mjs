// カバレッジが目標値に届かない指標を警告として表示する（仕様書 15.4）。
// 終了コードは常に 0 とし、CI を失敗させない。
import { existsSync, readFileSync } from 'node:fs';

const TARGET = 90;
const SUMMARY = 'coverage/coverage-summary.json';

if (!existsSync(SUMMARY)) {
  console.log(`WARNING: ${SUMMARY} が見つかりません。vitest の coverage.reporter に json-summary を追加してください。`);
  process.exit(0);
}

const { total } = JSON.parse(readFileSync(SUMMARY, 'utf8'));
for (const key of ['lines', 'branches', 'functions', 'statements']) {
  const pct = total[key].pct;
  if (pct < TARGET) {
    const msg = `coverage ${key}: ${pct}% (目標 ${TARGET}%)`;
    console.log(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : `WARNING: ${msg}`);
  }
}
