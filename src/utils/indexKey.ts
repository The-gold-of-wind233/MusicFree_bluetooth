import { OTHER_LETTER, getSortKey } from "./pinyin";

/**
 * 列表 A-Z 索引条的分组工具
 *
 * 标签统一用 A-Z（汉字取拼音首字母），数字 / 符号 / 其它文字归到「#」，
 * 「#」排在 Z 后面。
 *
 * 注意：这里**不重新排序**，只是顺着当前列表（已排好序）扫描，
 * 所以结果顺序和屏幕上的顺序天然一致，跳转一定准确。
 * 排序规则见 sortedMusicList.ts —— 两者用的是同一个 getIndexKey。
 */

/** 「#」的标签：数字 / 符号 / 其它文字，排在 Z 之后 */
export const INDEX_SHARP = OTHER_LETTER;

/**
 * 取某个字符串用于索引分组的标签
 *
 * 直接复用排序用的 getSortKey，**保证索引条与列表顺序完全一致**
 * （各标签内部顺序由排序保证，这里只关心标签本身）。
 */
export function getIndexKey(raw?: string | null): string {
    return getSortKey(raw).letter;
}

export interface IIndexItem {
    /** 显示在索引条上的标签 */
    key: string;
    /** 该标签在列表中的第一条的下标 */
    index: number;
}

/** 索引条的排序权重：A-Z 之后才是 # */
function indexRank(key: string): number {
    return key === INDEX_SHARP ? 26 : key.charCodeAt(0) - 65;
}


/**
 * 按字段算出索引分组
 *
 * 列表顺序本身就是「A(英→中) B(英→中) … Z(英→中) #」，
 * 所以这里扫描出来的顺序天然正确；再按权重排一次只是双保险。
 */
export function buildIndexItems(
    musicList: IMusic.IMusicItem[] | undefined | null,
    field: "title" | "artist" | "album",
): IIndexItem[] {
    if (!musicList || !musicList.length) {
        return [];
    }
    const map = new Map<string, number>();
    for (let i = 0; i < musicList.length; ++i) {
        const key = getIndexKey(musicList[i]?.[field]);
        if (!map.has(key)) {
            map.set(key, i);
        }
    }
    return Array.from(map.entries())
        .map(([key, index]) => ({ key, index }))
        .sort((a, b) => indexRank(a.key) - indexRank(b.key) || a.index - b.index);
}

/** 索引条最多显示多少个标签，超出就均匀采样（否则长列表会挤出屏幕） */
export const MAX_INDEX_COUNT = 28;

/**
 * 分组太多时均匀采样，保证索引条放得下。
 * 采样的每一项仍带真实下标，所以跳转依旧准确。
 */
export function sampleIndexItems(items: IIndexItem[]): IIndexItem[] {
    if (items.length <= MAX_INDEX_COUNT) {
        return items;
    }
    const result: IIndexItem[] = [];
    const step = items.length / MAX_INDEX_COUNT;
    // 始终保留第一项（顶部）和最后一项（底部）
    for (let i = 0; i < MAX_INDEX_COUNT; ++i) {
        const idx = Math.min(items.length - 1, Math.round(i * step));
        const item = items[idx];
        if (!result.length || result[result.length - 1].index !== item.index) {
            result.push(item);
        }
    }
    const last = items[items.length - 1];
    if (result[result.length - 1]?.index !== last.index) {
        result.push(last);
    }
    return result;
}
