/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'mobile' ならスマホ版、'pc' なら PC 版（vite.config.ts で設定） */
  readonly VITE_PLATFORM: 'mobile' | 'pc';
}

/** 端末内のバックエンド（スマホ版は src/mobile/client.ts、PC 版は空の部品。vite.config.ts の alias） */
declare module 'power:local-backend' {
  export function localRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<import('../mobile/router').LocalResponse>;
}
