import { z } from 'zod';
import { IS_MOBILE } from './platform';

// スマホ版：入力チェック（zod）が eval を試さないようにする（CSP で eval を禁止しているため）。
// 入力チェックの定義が作られる前に設定する必要があるので、main.tsx の最初で読み込む。
if (IS_MOBILE) z.config({ jitless: true });
