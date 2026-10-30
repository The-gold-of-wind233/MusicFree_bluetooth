/**
 * 汉字 → 拼音首字母
 *
 * 索引条要按 A-Z 分组，就必须知道汉字的拼音首字母。
 *
 * 数据表在 pinyinIndex.ts（覆盖 GB2312 全部 6763 个常用汉字，约 21KB），
 * 不引第三方拼音库：pinyin-pro 体积大得多，而这个场景只需要首字母。
 *
 * 为了性能，结果做了缓存：600 首歌单里同一个字会被反复用到。
 */

import { getPinyinLetter } from "./pinyinIndex";

/** 单字首字母缓存 */
const cache = new Map<string, string>();

/** 拉丁字母 */
function isLatin(ch: string): boolean {
    return /[a-zA-Z]/.test(ch);
}

/** 汉字（CJK 基本区 + 扩展 A 区，覆盖绝大多数人名/歌名用字） */
function isHan(ch: string): boolean {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch);
}

/**
 * 取一个字符用于索引的首字母
 * - 拉丁字母 → 大写字母
 * - 汉字     → 拼音首字母（大写）
 * - 其它     → 空串（由调用方归到 #）
 */
export function letterOfChar(ch: string): string {
    if (!ch) {
        return "";
    }
    if (isLatin(ch)) {
        return ch.toUpperCase();
    }
    if (!isHan(ch)) {
        return "";
    }
    const cached = cache.get(ch);
    if (cached !== undefined) {
        return cached;
    }
    const letter = getPinyinLetter(ch) ?? "";
    cache.set(ch, letter);
    return letter;
}

/**
 * 分组：
 * 0 = 拉丁字母开头（英文歌在前）
 * 1 = 汉字开头（中文歌在后）
 * 2 = 其它（含数字、符号、日文韩文等）
 */
export type IIndexGroup = 0 | 1 | 2;

export interface ISortKey {
    /** 索引标签：A-Z 或 # */
    letter: string;
    /** 分组，用于「英文在前、中文在后」 */
    group: IIndexGroup;
}

/** 空串统一用 # 表示；# 在排序时排最后 */
export const OTHER_LETTER = "#";

/**
 * 计算一个字符串的索引键
 * 只看第一个字符（和 Intl.Collator 的排序习惯一致）
 */
export function getSortKey(raw?: string | null): ISortKey {
    const text = (raw ?? "").trim();
    if (!text) {
        return { letter: OTHER_LETTER, group: 2 };
    }
    const first = text[0];
    if (isLatin(first)) {
        return { letter: first.toUpperCase(), group: 0 };
    }
    if (isHan(first)) {
        const letter = letterOfChar(first);
        return { letter: letter || OTHER_LETTER, group: letter ? 1 : 2 };
    }
    // 数字、符号、日文、韩文等统统归到 #
    return { letter: OTHER_LETTER, group: 2 };
}

/**
 * 比较两个索引标签：A-Z 升序，# 永远在最后
 */
export function compareLetter(a: string, b: string): number {
    if (a === b) {
        return 0;
    }
    if (a === OTHER_LETTER) {
        return 1;
    }
    if (b === OTHER_LETTER) {
        return -1;
    }
    return a < b ? -1 : 1;
}
