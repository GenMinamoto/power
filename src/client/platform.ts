/** スマホ版としてビルドしたとき true（vite build --mode mobile） */
export const IS_MOBILE = import.meta.env.VITE_PLATFORM === 'mobile';
