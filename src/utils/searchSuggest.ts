/**
 * 搜索联想（本地）
 *
 * 插件协议里**没有**搜索建议接口（只有 search），
 * 所以联想只能在本地做：搜索历史 + 本地歌单里的歌名/歌手/专辑/歌单名。
 *
 * 额外做了拼音首字母匹配：输入 "zjl" 也能联想到「周杰伦」。
 * 拼音结果带缓存，避免每次输入都重算。
 */

import MusicSheet from "@/core/musicSheet";
import { getPinyinLetter } from "./pinyinIndex";

export type ISuggestKind = "history" | "music" | "artist" | "album" | "sheet";

export interface ISuggestItem {
    /** 建议显示的文本 */
    text: string;
    /** 类型，用于决定图标和副标题 */
    kind: ISuggestKind;
    /** 副标题，比如歌手名 */
    desc?: string;
}

/** 拼音缓存：文本 → 拼音首字母串（小写） */
const pinyinCache = new Map<string, string>();

/** 取一段文本的拼音首字母串（小写，只保留字母） */
function firstLetters(text: string): string {
    if (!text) {
        return "";
    }
    const cached = pinyinCache.get(text);
    if (cached !== undefined) {
        return cached;
    }
    let result = "";
    for (const ch of text) {
        const letter = getPinyinLetter(ch);
        if (letter) {
            result += letter.toLowerCase();
        } else if (/[a-zA-Z]/.test(ch)) {
            // 英文字符本身也算一个字母位，这样 "zjl" 之外的混排也能匹配
            result += ch.toLowerCase();
        }
    }
    pinyinCache.set(text, result);
    return result;
}

/** 本地索引项 */
interface IIndexEntry {
    text: string;
    lower: string;
    kind: ISuggestKind;
    desc?: string;
    /** 拼音首字母，懒计算 */
    py?: string;
}

/** 单条建议最多显示多少条 */
const MAX_SUGGEST = 20;
/** 拼音匹配最多扫描多少条，避免卡顿 */
const MAX_PY_SCAN = 800;

let cachedEntries: IIndexEntry[] | null = null;
let cachedAt = 0;
/** 索引缓存有效期：5 分钟。歌单变化后最多晚 5 分钟生效，联想不准不影响使用 */
const CACHE_TTL = 5 * 60 * 1000;

/** 构建本地索引（本地歌曲的歌名/歌手/专辑 + 歌单名） */
function getEntries(): IIndexEntry[] {
    const now = Date.now();
    if (cachedEntries && now - cachedAt < CACHE_TTL) {
        return cachedEntries;
    }

    const entries: IIndexEntry[] = [];
    const seen = new Set<string>();

    const push = (
        text: string | undefined,
        kind: ISuggestKind,
        desc?: string,
    ) => {
        const value = (text ?? "").trim();
        if (!value) {
            return;
        }
        const key = `${kind}::${value.toLowerCase()}`;
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        entries.push({
            text: value,
            lower: value.toLowerCase(),
            kind,
            desc,
        });
    };

    try {
        const sheets = MusicSheet.getSheetsBase() ?? [];
        for (const sheet of sheets) {
            push(sheet.title, "sheet");
            const list = MusicSheet.getSortedMusicListBySheetId(sheet.id);
            for (const item of list.musicList) {
                push(item.title, "music", item.artist);
                push(item.artist, "artist");
                push(item.album, "album");
            }
        }
    } catch {
        // 取不到就算了，联想只是辅助功能
    }

    cachedEntries = entries;
    cachedAt = now;
    return entries;
}

/**
 * 生成联想列表
 * @param query 当前输入
 * @param history 搜索历史
 */
export function buildSuggestions(
    query: string,
    history: string[] = [],
): ISuggestItem[] {
    const q = (query ?? "").trim();
    if (!q) {
        return [];
    }
    const lowerQ = q.toLowerCase();
    const isLatinQuery = /^[a-z]+$/.test(lowerQ);

    const result: ISuggestItem[] = [];
    const pushed = new Set<string>();

    const add = (item: ISuggestItem) => {
        const key = `${item.kind}::${item.text.toLowerCase()}`;
        if (pushed.has(key)) {
            return;
        }
        pushed.add(key);
        result.push(item);
    };

    // 1. 搜索历史优先（用户搜过的更可能是想要的）
    for (const h of history) {
        if (h.toLowerCase().includes(lowerQ)) {
            add({ text: h, kind: "history" });
        }
        if (result.length >= MAX_SUGGEST) {
            return result;
        }
    }

    const entries = getEntries();

    // 2. 文本直接包含（最快，也最常见）
    for (const entry of entries) {
        if (entry.lower.includes(lowerQ)) {
            add({ text: entry.text, kind: entry.kind, desc: entry.desc });
            if (result.length >= MAX_SUGGEST) {
                return result;
            }
        }
    }

    // 3. 拼音首字母匹配：只有纯字母输入才做，且限制扫描量
    if (isLatinQuery && lowerQ.length >= 2) {
        let scanned = 0;
        for (const entry of entries) {
            if (scanned >= MAX_PY_SCAN) {
                break;
            }
            if (entry.py === undefined) {
                entry.py = firstLetters(entry.text);
            }
            ++scanned;
            if (entry.py && entry.py.includes(lowerQ)) {
                add({ text: entry.text, kind: entry.kind, desc: entry.desc });
                if (result.length >= MAX_SUGGEST) {
                    return result;
                }
            }
        }
    }

    return result;
}

/** 歌单内容变化后调用，让索引下次重新构建 */
export function invalidateSuggestIndex() {
    cachedEntries = null;
    cachedAt = 0;
}
