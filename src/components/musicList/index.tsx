import { RequestStateCode } from "@/constants/commonConst";
import TrackPlayer from "@/core/trackPlayer";
import rpx from "@/utils/rpx";
import { FlashList } from "@shopify/flash-list";
import React, { useRef, useCallback, useState, useEffect } from "react";
import { FlatListProps, Pressable, StyleSheet, View } from "react-native";
import ListEmpty from "../base/listEmpty";
import ListFooter from "../base/listFooter";
import MusicItem from "../mediaItem/musicItem";
import { isSameMediaItem } from "@/utils/mediaUtils";
import Icon from "../base/icon";
import { iconSizeConst } from "@/constants/uiConst";
import useColors from "@/hooks/useColors";
import { SortType } from "@/constants/commonConst";
import ThemeText from "../base/themeText";
import {
    buildIndexItems,
    IIndexItem,
    sampleIndexItems,
} from "@/utils/indexKey";

interface IMusicListProps {
    /** 顶部 */
    Header?: FlatListProps<IMusic.IMusicItem>["ListHeaderComponent"];
    /** 音乐列表 */
    musicList?: IMusic.IMusicItem[];
    /** 所在歌单 */
    musicSheet?: IMusic.IMusicSheetItem;
    /** 是否展示序号 */
    showIndex?: boolean;
    /** 点击 */
    onItemPress?: (
        musicItem: IMusic.IMusicItem,
        musicList?: IMusic.IMusicItem[],
    ) => void;
    // 状态
    state: RequestStateCode;
    /** 高亮的音乐 */
    highlightMusicItem?: IMusic.IMusicItem | null;
    onRetry?: () => void;
    onLoadMore?: () => void;
    /**
     * 当前排序方式。
     * 只有按名称排序（标题 / 歌手 / 专辑）时才会出现 A-Z 索引条，
     * 其它排序（时间、未排序）下顺序没有字母规律，索引条没有意义。
     * 不传则不显示。
     */
    sortType?: SortType;
    /**
     * 长按某一项的回调。
     * MusicItem 本来就有 onItemLongPress，但之前没人传，
     * 所以长按实际什么都不做。这里把口子开出来。
     */
    onItemLongPress?: (musicItem: IMusic.IMusicItem) => void;
}
const ITEM_HEIGHT = rpx(120);

/** 音乐列表 */
export default function MusicList(props: IMusicListProps) {
    const {
        Header,
        musicList,
        musicSheet,
        showIndex,
        onItemPress,
        state,
        onRetry,
        onLoadMore,
        highlightMusicItem,
        sortType,
        onItemLongPress,
    } = props;    
    const colors = useColors();
    const flashListRef = useRef<FlashList<IMusic.IMusicItem>>(null);
    const [showBadge, setShowBadge] = useState(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout>();

    // 查找高亮项的索引
    const highlightIndex = React.useMemo(() => {
        if (!highlightMusicItem || !musicList) return -1;
        return musicList.findIndex(item => isSameMediaItem(item, highlightMusicItem));
    }, [highlightMusicItem, musicList]);    
    
    /**
     * 索引条数据：只在按名称排序时才有值
     */
    const indexItems = React.useMemo<IIndexItem[]>(() => {
        if (!sortType || !musicList?.length) {
            return [];
        }
        // 只有这三种是按名称排序的，其余（时间 / 未排序）不出索引条
        let field: "title" | "artist" | "album";
        if (sortType === SortType.Title) {
            field = "title";
        } else if (sortType === SortType.Artist) {
            field = "artist";
        } else if (sortType === SortType.Album) {
            field = "album";
        } else {
            return [];
        }
        return sampleIndexItems(buildIndexItems(musicList, field));
    }, [musicList, sortType]);

    /** 点击索引条：跳到该字母的第一首 */
    const scrollToIndexItem = useCallback((item: IIndexItem) => {
        try {
            /**
             * 跳两次。
             *
             * FlashList 第一次 scrollToIndex 是按 estimatedItemSize **估算**位置的，
             * 跳过去之后真实渲染出来发现高度对不上，会自动修正 —— 表现就是列表"抖一下"。
             * 下一帧再跳一次，此时目标区域已经渲染过、高度准确，就不会再修正了。
             */
            flashListRef.current?.scrollToIndex({
                index: item.index,
                animated: false,
                viewPosition: 0,
            });
            requestAnimationFrame(() => {
                try {
                    flashListRef.current?.scrollToIndex({
                        index: item.index,
                        animated: false,
                        viewPosition: 0,
                    });
                } catch {
                    // 忽略
                }
            });
        } catch {
            // 下标越界等情况直接忽略，不影响使用
        }
    }, []);

    // 处理滚动开始
    const handleScrollBegin = useCallback(() => {
        if (highlightIndex !== -1) {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
            setShowBadge(true);
        }
    }, [highlightIndex]);
    
    // 处理滚动结束
    const handleScrollEnd = useCallback(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
        }
        // 5秒后直接隐藏
        hideTimeoutRef.current = setTimeout(() => {
            setShowBadge(false);
        }, 5000);
    }, []);    
    
    // 滚动到高亮项
    const scrollToHighlight = useCallback(() => {
        if (highlightIndex !== -1 && flashListRef.current) {
            flashListRef.current.scrollToIndex({
                index: highlightIndex,
                animated: false,
                viewPosition: 0,
            });
            // 立即隐藏角标
            setShowBadge(false);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        }
    }, [highlightIndex]);    
    
    // 清理定时器
    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);    
    
    return (
        <View style={styles.container}>
            <FlashList
                ref={flashListRef}
                ListHeaderComponent={Header}
                ListEmptyComponent={<ListEmpty state={state} onRetry={onRetry} />}
                ListFooterComponent={
                    musicList?.length ? <ListFooter state={state} onRetry={onRetry} /> : null
                }
                extraData={highlightMusicItem}
                data={musicList ?? []}
                estimatedItemSize={ITEM_HEIGHT}
                onScrollBeginDrag={handleScrollBegin}
                onScrollEndDrag={handleScrollEnd}
                onMomentumScrollEnd={handleScrollEnd}
                renderItem={({ index, item: musicItem }) => {
                    return (
                        <MusicItem
                            musicItem={musicItem}
                            index={showIndex ? index + 1 : undefined}
                            onItemPress={() => {
                                if (onItemPress) {
                                    onItemPress(musicItem, musicList);
                                } else {
                                    TrackPlayer.playWithReplacePlayList(
                                        musicItem,
                                        musicList ?? [musicItem],
                                    );
                                }
                            }}
                            onItemLongPress={
                                onItemLongPress
                                    ? () => onItemLongPress(musicItem)
                                    : undefined
                            }
                            musicSheet={musicSheet}
                            highlight={isSameMediaItem(musicItem, highlightMusicItem)}
                        />
                    );
                }}
                onEndReached={() => {
                    if (state === RequestStateCode.IDLE || state === RequestStateCode.PARTLY_DONE) {
                        onLoadMore?.();
                    }
                }}
                onEndReachedThreshold={0.1}
            />              
            {indexItems.length > 1 ? (
                <View style={styles.indexBar} pointerEvents="box-none">
                    {indexItems.map(item => (
                        <Pressable
                            key={`${item.key}-${item.index}`}
                            style={styles.indexItem}
                            onPress={() => scrollToIndexItem(item)}>
                            <ThemeText fontSize="description" fontColor="textSecondary">
                                {item.key}
                            </ThemeText>
                        </Pressable>
                    ))}
                </View>
            ) : null}
            {showBadge && (
                <View style={styles.badge} pointerEvents="box-none">
                    <Pressable
                        style={[styles.badgeButton, { backgroundColor: colors.notification }]}
                        onPress={scrollToHighlight}
                    >
                        <Icon
                            name="crosshair"
                            size={iconSizeConst.normal}
                            color={colors.text}
                        />
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    badge: {
        position: "absolute",
        bottom: rpx(80),
        right: rpx(84),
        zIndex: 1000,
    },
    indexBar: {
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        width: rpx(48),
        justifyContent: "center",
        alignItems: "center",
        zIndex: 900,
    },
    indexItem: {
        width: rpx(48),
        paddingVertical: rpx(2),
        alignItems: "center",
        justifyContent: "center",
    },
    badgeButton: {
        width: rpx(64),
        height: rpx(64),
        borderRadius: rpx(32),
        justifyContent: "center",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
});
