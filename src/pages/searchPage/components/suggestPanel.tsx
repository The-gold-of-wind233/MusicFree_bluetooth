import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import ListItem from "@/components/base/listItem";
import Icon from "@/components/base/icon.tsx";
import { iconSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import { useAtomValue, useSetAtom } from "jotai";
import {
    PageStatus,
    initSearchResults,
    pageStatusAtom,
    queryAtom,
    searchResultsAtom,
} from "../store/atoms";
import useSearch from "../hooks/useSearch";
import { addHistory, getHistory } from "../common/historySearch";
import { buildSuggestions } from "@/utils/searchSuggest";
import { fetchCloudSuggestions } from "@/utils/cloudSuggest";
import Config from "@/core/appConfig";
import { useI18N } from "@/core/i18n";

/** 各类型对应的图标 */
function iconOf(kind: string): any {
    switch (kind) {
        case "history":
            return "clock-outline";
        case "music":
            return "musical-note";
        case "artist":
            return "user";
        case "album":
            return "album-outline";
        case "sheet":
            return "playlist";
        default:
            return "magnifying-glass";
    }
}

/** 云端联想的防抖时长 */
const CLOUD_DEBOUNCE = 400;

export default function SuggestPanel() {
    const query = useAtomValue(queryAtom);
    const setQuery = useSetAtom(queryAtom);
    const setPageStatus = useSetAtom(pageStatusAtom);
    const setSearchResultsState = useSetAtom(searchResultsAtom);
    const search = useSearch();
    const colors = useColors();
    const { t } = useI18N();

    const [history, setHistory] = useState<string[]>([]);
    const [cloudItems, setCloudItems] = useState<
        { text: string; desc?: string }[]
    >([]);

    const timerRef = useRef<any>(null);

    useEffect(() => {
        getHistory().then(h => setHistory(h ?? []));
    }, []);

    // 第一层：本地联想（同步计算，瞬间出，不发请求）
    const localItems = useMemo(
        () => buildSuggestions(query, history),
        [query, history],
    );

    // 第二层：云端联想（防抖 400ms，用 1 个插件真搜）
    useEffect(() => {
        const q = (query ?? "").trim();
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        const enabled = Config.getConfig("basic.cloudSuggest") !== false;
        if (!enabled || !q) {
            setCloudItems([]);
            return;
        }

        timerRef.current = setTimeout(async () => {
            const result = await fetchCloudSuggestions(q);
            // 返回 null 表示这次请求已过期（输入变了），忽略
            if (result === null) {
                return;
            }
            setCloudItems(result);
        }, CLOUD_DEBOUNCE);

        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
            }
        };
    }, [query]);

    const onPick = async (text: string) => {
        setQuery(text);
        setSearchResultsState(initSearchResults);
        setPageStatus(PageStatus.SEARCHING);
        await search(text, 1);
        await addHistory(text);
    };

    // 云端结果里去掉本地已经出现过的，避免重复
    const localTexts = new Set(localItems.map(it => it.text.toLowerCase()));
    const cloudUnique = cloudItems.filter(
        it => !localTexts.has(it.text.toLowerCase()),
    );

    const hasLocal = localItems.length > 0;
    const hasCloud = cloudUnique.length > 0;

    if (!hasLocal && !hasCloud) {
        return null;
    }

    return (
        <View style={style.wrapper}>
            <FlatList
                data={[
                    ...(hasLocal
                        ? [{ header: t("searchPage.suggestLocal"), key: "__local__" }]
                        : []),
                    ...localItems.map((it, index) => ({
                        item: it,
                        key: `local-${it.kind}-${it.text}-${index}`,
                    })),
                    ...(hasCloud
                        ? [{ header: t("searchPage.suggestCloud"), key: "__cloud__" }]
                        : []),
                    ...cloudUnique.map((it, index) => ({
                        cloudItem: it,
                        key: `cloud-${it.text}-${index}`,
                    })),
                ]}
                keyboardShouldPersistTaps="handled"
                keyExtractor={item => item.key}
                renderItem={({ item }: any) => {
                    if (item.header) {
                        return (
                            <ThemeText
                                fontSize="description"
                                fontColor="textSecondary"
                                style={style.header}>
                                {item.header}
                            </ThemeText>
                        );
                    }
                    if (item.item) {
                        const it = item.item;
                        return (
                            <ListItem
                                heightType="small"
                                onPress={() => onPick(it.text)}>
                                <Icon
                                    name={iconOf(it.kind)}
                                    color={colors.textSecondary}
                                    size={iconSizeConst.normal}
                                    style={style.icon}
                                />
                                <ListItem.Content
                                    title={it.text}
                                    description={it.desc}
                                />
                            </ListItem>
                        );
                    }
                    const it = item.cloudItem;
                    return (
                        <ListItem
                            heightType="small"
                            onPress={() => onPick(it.text)}>
                            <Icon
                                name="language"
                                color={colors.textSecondary}
                                size={iconSizeConst.normal}
                                style={style.icon}
                            />
                            <ListItem.Content
                                title={it.text}
                                description={it.desc}
                            />
                        </ListItem>
                    );
                }}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        flex: 1,
        paddingHorizontal: rpx(24),
    },
    header: {
        paddingVertical: rpx(20),
    },
    icon: {
        marginRight: rpx(16),
    },
});
