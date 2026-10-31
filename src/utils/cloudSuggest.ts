/**
 * 云端联想（用插件真搜）
 *
 * 插件协议里没有「搜索建议」接口，只有 search。
 * 所以云端联想的实现方式就是：拿当前输入的关键词，用插件真搜一次，
 * 把返回的前几条当联想词显示出来。
 *
 * 这样第一次搜一首没听过的新歌也能有联想 —— 本地联想做不到这点。
 *
 * 节流按精简后的方案，只保留真正有用的三样：
 *   1. 防抖 400ms（在 UI 层做，见 suggestPanel）
 *   2. 结果缓存 30 秒（这里）
 *   3. 总开关（设置里）
 * 刻意没做「最小请求间隔」「至少 N 个字」「失败退避」——
 * 那些叠起来会让联想退化成「搜索结果预览」，失去边打边看的意义。
 */

import { errorLog } from "@/utils/log";

/**
 * pluginManager 用**延迟 require**，不静态 import。
 *
 * 原因：pluginManager 依赖链很深（22 个 import），任何静态引用它的模块
 * 都容易卷进循环依赖，Hermes 下会报 "Property 'xxx' doesn't exist"。
 * 这里只在真正要联网时才加载，调用时机远晚于模块初始化，安全。
 */
function getPluginManager(): any {
    try {
        return require("@/core/pluginManager").default;
    } catch {
        return null;
    }
}

function getConfig(): any {
    try {
        return require("@/core/appConfig").default;
    } catch {
        return null;
    }
}

export interface ICloudSuggestItem {
    text: string;
    desc?: string;
}

/** 缓存：小写的 query → {结果, 时间戳} */
const cache = new Map<string, { items: ICloudSuggestItem[]; ts: number }>();
/** 缓存有效期 30 秒：删字重打时秒出，零成本 */
const CACHE_TTL = 30 * 1000;
/** 最多缓存多少条，防止无限增长 */
const MAX_CACHE = 50;
/** 单次最多展示几条联想 */
const MAX_ITEMS = 8;

/** 递增序号，用于处理竞态：只认最后一次请求的结果 */
let seq = 0;

/**
 * 取用于联想的插件
 *
 * 只用一个插件：7 个插件并发请求容易被源站限流，而且结果混在一起没法看。
 * 优先用设置里指定的，没指定就用搜索排序的第一个。
 */
function getSuggestPlugin() {
    const PluginManager = getPluginManager();
    if (!PluginManager) {
        return null;
    }
    const plugins = PluginManager.getSortedSearchablePlugins("music");
    if (!plugins?.length) {
        return null;
    }
    const preferredHash = getConfig()?.getConfig("basic.cloudSuggestPlugin");
    if (preferredHash) {
        const hit = plugins.find(it => it.hash === preferredHash);
        if (hit) {
            return hit;
        }
    }
    return plugins[0];
}

/**
 * 拉取云端联想
 * @returns null 表示「这次请求已经过期」（用户输入变了），调用方应忽略
 */
export async function fetchCloudSuggestions(
    query: string,
): Promise<ICloudSuggestItem[] | null> {
    const q = (query ?? "").trim();
    if (!q) {
        return [];
    }

    const cacheKey = q.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.items;
    }

    const plugin = getSuggestPlugin();
    if (!plugin) {
        return [];
    }

    const mySeq = ++seq;

    try {
        const searchType =
            plugin.instance.defaultSearchType ?? "music";
        const result = await plugin.methods?.search?.(q, 1, searchType as any);
        // 输入已经变了，丢弃这次结果
        if (mySeq !== seq) {
            return null;
        }
        const data = result?.data ?? [];
        const items: ICloudSuggestItem[] = [];
        const seen = new Set<string>();
        for (const item of data) {
            const title = (item as any)?.title;
            if (!title) {
                continue;
            }
            const key = String(title).toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            items.push({
                text: String(title),
                desc: (item as any)?.artist ?? undefined,
            });
            if (items.length >= MAX_ITEMS) {
                break;
            }
        }

        // 写缓存（满了就清掉最旧的一半）
        if (cache.size >= MAX_CACHE) {
            const sorted = [...cache.entries()].sort(
                (a, b) => a[1].ts - b[1].ts,
            );
            for (let i = 0; i < Math.ceil(MAX_CACHE / 2); ++i) {
                cache.delete(sorted[i][0]);
            }
        }
        cache.set(cacheKey, { items, ts: Date.now() });
        return items;
    } catch (e) {
        errorLog("云端联想失败", e);
        return mySeq === seq ? [] : null;
    }
}

/** 清空缓存（切换联想插件时调用） */
export function clearCloudSuggestCache() {
    cache.clear();
}

/** 给设置页用：当前可用于联想的插件列表 */
export function getSuggestPluginOptions() {
    const PluginManager = getPluginManager();
    if (!PluginManager) {
        return [];
    }
    return (PluginManager.getSortedSearchablePlugins("music") ?? []).map(
        (it: any) => ({
            label: it.instance?.platform ?? it.name,
            value: it.hash,
        }),
    );
}
