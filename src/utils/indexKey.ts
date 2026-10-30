/**
 * 列表 A-Z 索引条的分组工具
 *
 * 排序用的是 Intl.Collator("zh")，中文按拼音排。
 * 但纯 JS 拿不到汉字拼音（要引第三方库、体积不小），
 * 所以索引标签直接用「排序后的实际首字符」：
 *   - 拉丁字母 / 数字 → 该字符（字母转大写）
 *   - 汉字 → 该汉字本身
 *   - 其它符号 → "#"
 * 这样标签顺序与列表顺序天然一致，跳转一定准确。
 */

/** 取某个字符串用于索引分组的标签 */
export function getIndexKey(raw?: string | null): string {
    const text = (raw ?? "").trim();
    if (!text) {
        return "#";
    }
    const first = text[0];
    // 拉丁字母
    if (/[a-zA-Z]/.test(first)) {
        return first.toUpperCase();
    }
    // 数字
    if (/[0-9]/.test(first)) {
        return first;
    }
    // 汉字（含 CJK 扩展区）
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(first)) {
        return first;
    }
    // 其它：日文、韩文、符号等，统一归到 #
    return "#";
}

export interface IIndexItem {
    /** 显示在索引条上的标签 */
    key: string;
    /** 该标签在列表中的第一条的下标 */
    index: number;
}

/**
 * 按字段算出索引分组
 *
 * 注意：这里**不重新排序**，只是顺着当前列表（已按该字段排好）扫描，
 * 因此结果顺序和屏幕上的顺序完全一致。
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
    return Array.from(map.entries()).map(([key, index]) => ({ key, index }));
}

/** 索引条最多显示多少个标签，超出就均匀采样（否则中文歌单会挤出屏幕） */
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
