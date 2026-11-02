import { RequestStateCode } from "@/constants/commonConst";
import TrackPlayer from "@/core/trackPlayer";
import rpx from "@/utils/rpx";
import React, { useRef, useCallback, useState, useEffect } from "react";
import {
    FlatList,
    FlatListProps,
    Pressable,
    StyleSheet,
    View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
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
     */
    sortType?: SortType;
    /** 长按某一项的回调 */
    onItemLongPress?: (musicItem: IMusic.IMusicItem) => void;
}

/**
 * 每一行的固定高度。
 * MusicItem 用的是 ListItem 的 heightType="big"，正好等于 rpx(120)。
 * 所有行严格等高，所以可以给 FlatList 提供精确的 getItemLayout。
 */
const ITEM_HEIGHT = rpx(120);

/**
 * A-Z 索引条（含气泡）。
 *
 * 做成独立组件：按索引条只会重渲染这小小的一条，不会带动列表重渲染。
 */
interface IIndexBarProps {
    items: IIndexItem[];
    onSelect: (item: IIndexItem) => void;
}

function IndexBar(props: IIndexBarProps) {
    const { items, onSelect } = props;
    const [activePos, setActivePos] = useState<number | null>(null);
    const heightRef = useRef(0);
    const lastPosRef = useRef(-1);
    const timerRef = useRef<any>(null);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const hideBubble = useCallback(() => {
        clearTimer();
        setActivePos(null);
        lastPosRef.current = -1;
    }, [clearTimer]);

    /** 松手后延迟收起气泡，让用户看清最后停在哪 */
    const release = useCallback(() => {
        clearTimer();
        timerRef.current = setTimeout(hideBubble, 500);
    }, [clearTimer, hideBubble]);

    /** 手指位置 → 第几个字母 → 跳转 */
    const touch = useCallback(
        (y: number) => {
            const total = items.length;
            const height = heightRef.current;
            if (!total || !height) {
                return;
            }
            let pos = Math.floor(y / (height / total));
            if (pos < 0) {
                pos = 0;
            } else if (pos > total - 1) {
                pos = total - 1;
            }
            if (pos === lastPosRef.current) {
                return;
            }
            lastPosRef.current = pos;
            setActivePos(pos);
            // 兜底：onEnd / onFinalize 都没来时气泡也要消失
            clearTimer();
            timerRef.current = setTimeout(hideBubble, 1200);
            onSelect(items[pos]);
        },
        [items, onSelect, clearTimer, hideBubble],
    );

    /**
     * 用 onBegin，不用 onStart。
     * onStart 要等手势激活，轻点（无位移）在 Android 上不一定激活 → 轻点没反应。
     * onBegin 手指一按下就调用，不依赖激活。
     */
    const gesture = React.useMemo(
        () =>
            Gesture.Pan()
                .minDistance(0)
                .onBegin(evt => {
                    runOnJS(touch)(evt.y);
                })
                .onUpdate(evt => {
                    runOnJS(touch)(evt.y);
                })
                .onEnd(() => {
                    runOnJS(release)();
                })
                .onFinalize(() => {
                    runOnJS(release)();
                }),
        [touch, release],
    );

    useEffect(() => clearTimer, [clearTimer]);

    return (
        <>
            <View style={styles.indexBar} pointerEvents="box-none">
                <GestureDetector gesture={gesture}>
                    <View
                        style={styles.indexInner}
                        collapsable={false}
                        onLayout={evt => {
                            heightRef.current = evt.nativeEvent.layout.height;
                        }}>
                        {items.map((item, i) => (
                            <View
                                key={`${item.key}-${item.index}`}
                                style={styles.indexItem}>
                                <ThemeText
                                    fontSize="description"
                                    fontColor={
                                        activePos === i ? "text" : "textSecondary"
                                    }
                                    fontWeight={
                                        activePos === i ? "bold" : "regular"
                                    }>
                                    {item.key}
                                </ThemeText>
                            </View>
                        ))}
                    </View>
                </GestureDetector>
            </View>
            {activePos !== null ? (
                <View style={styles.bubbleWrap} pointerEvents="none">
                    <View style={styles.indexBubble}>
                        <ThemeText
                            fontSize="appbar"
                            fontWeight="bold"
                            fontColor="text">
                            {items[activePos]?.key}
                        </ThemeText>
                    </View>
                </View>
            ) : null}
        </>
    );
}

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
    const listRef = useRef<FlatList<IMusic.IMusicItem>>(null);
    const [showBadge, setShowBadge] = useState(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout>();

    /**
     * 列表头部的真实高度。
     * getItemLayout 必须把它算进 offset，否则跳转会整体偏一个头部高度。
     * 只在数值真的变化时 setState，避免 onLayout 反复触发导致多余重渲染。
     */
    const [headerHeight, setHeaderHeight] = useState(0);
    const headerHeightRef = useRef(0);

    /** 程序化跳转中：这段时间内屏蔽滚动回调引起的 setState */
    const programmaticScrollRef = useRef(false);
    const programmaticTimerRef = useRef<any>(null);
    /** 待跳转的行号：同一帧内只保留最后一次 */
    const pendingIndexRef = useRef<number | null>(null);
    /** 合并跳转用的 rAF 句柄 */
    const rafRef = useRef<number | null>(null);

    // 查找高亮项的索引
    const highlightIndex = React.useMemo(() => {
        if (!highlightMusicItem || !musicList) return -1;
        return musicList.findIndex(item => isSameMediaItem(item, highlightMusicItem));
    }, [highlightMusicItem, musicList]);

    /** 索引条数据：只在按名称排序时才有值 */
    const indexItems = React.useMemo<IIndexItem[]>(() => {
        if (!sortType || !musicList?.length) {
            return [];
        }
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

    /**
     * 精确布局。
     *
     * ⚠️ 这是消除抖动的关键，也是这次和前几版最本质的区别：
     *
     * FlashList 的布局是**估算**的（estimatedItemSize）。无论用 scrollToIndex
     * 还是 scrollToOffset，只要跳到还没渲染过的区域，它都会先按估算滚过去，
     * 等真实内容挂载后再校正一次位置 —— 那一校正就是"抖一下"，而且"有概率"
     * （跳到已渲染区域不抖，跳远处就抖）。前两版一直在跟这个校正较劲，
     * 跳两次、延迟校正、自己算偏移，都没用，因为估算本身还在。
     *
     * 换成 FlatList + getItemLayout：每一行的位置和高度由这里**同步精确给出**，
     * 列表不再需要任何估算，跳转一次到位，不存在"渲染后再修正"。
     *
     * offset 要加上头部高度：FlatList 的 offset 是从内容起点算的，包含 header。
     */
    const getItemLayout = useCallback(
        (_data: any, index: number) => ({
            length: ITEM_HEIGHT,
            offset: headerHeight + index * ITEM_HEIGHT,
            index,
        }),
        [headerHeight],
    );

    /** 标记一次程序化跳转，短暂屏蔽滚动回调的 setState */
    const markProgrammaticScroll = useCallback(() => {
        programmaticScrollRef.current = true;
        if (programmaticTimerRef.current) {
            clearTimeout(programmaticTimerRef.current);
        }
        programmaticTimerRef.current = setTimeout(() => {
            programmaticScrollRef.current = false;
        }, 200);
    }, []);

    /** 真正执行一次跳转（由 rAF 调用） */
    const flushPendingScroll = useCallback(() => {
        rafRef.current = null;
        const index = pendingIndexRef.current;
        pendingIndexRef.current = null;
        const list = listRef.current;
        if (index === null || index < 0 || !list) {
            return;
        }
        markProgrammaticScroll();
        try {
            list.scrollToIndex({
                index,
                animated: false,
                viewPosition: 0,
            });
        } catch {
            // 越界等情况忽略
        }
    }, [markProgrammaticScroll]);

    /**
     * 精确跳到某一行 —— 同一帧内多次调用只执行最后一次。
     *
     * ⚠️ 这是修「滑动索引条时画面空白」的关键：
     * 手指快速滑过十几个字母时，原来会连发十几次 scrollToIndex，
     * 每一次都让 FlatList 重新计算渲染窗口、丢弃刚排好的渲染批次，
     * 结果就是位置到了、cell 还没铺出来 → 白屏。
     *
     * 现在把请求合并到下一帧，一帧最多跳一次，渲染窗口有足够时间铺满。
     * 轻点也只多等一帧（~16ms），手感无影响。
     */
    const scrollToRow = useCallback(
        (index: number) => {
            if (index < 0) {
                return;
            }
            pendingIndexRef.current = index;
            if (rafRef.current === null) {
                rafRef.current = requestAnimationFrame(flushPendingScroll);
            }
        },
        [flushPendingScroll],
    );

    /** 索引条选中某个字母 */
    const onIndexSelect = useCallback(
        (item: IIndexItem) => {
            scrollToRow(item.index);
        },
        [scrollToRow],
    );

    /** 头部包一层测量 View；固定引用避免列表重复测量布局 */
    const headerComponent = React.useMemo(() => {
        if (!Header) {
            return undefined;
        }
        return (
            <View
                collapsable={false}
                onLayout={evt => {
                    const h = evt.nativeEvent.layout.height;
                    if (Math.abs(h - headerHeightRef.current) > 1) {
                        headerHeightRef.current = h;
                        setHeaderHeight(h);
                    }
                }}>
                {Header}
            </View>
        );
    }, [Header]);

    /** 空态 / 底部也固定引用，减少不必要的重渲染 */
    const emptyComponent = React.useMemo(
        () => <ListEmpty state={state} onRetry={onRetry} />,
        [state, onRetry],
    );
    const footerComponent = React.useMemo(
        () =>
            musicList?.length ? (
                <ListFooter state={state} onRetry={onRetry} />
            ) : null,
        [musicList?.length, state, onRetry],
    );

    // 处理滚动开始
    const handleScrollBegin = useCallback(() => {
        // 程序化跳转期间不响应，避免多余的 setState 造成重渲染
        if (programmaticScrollRef.current) {
            return;
        }
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

    // 滚动到高亮项（同样走精确布局）
    const scrollToHighlight = useCallback(() => {
        if (highlightIndex !== -1) {
            scrollToRow(highlightIndex);
            setShowBadge(false);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        }
    }, [highlightIndex, scrollToRow]);

    // 清理定时器
    useEffect(() => {
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
            if (programmaticTimerRef.current) {
                clearTimeout(programmaticTimerRef.current);
            }
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, []);

    const renderItem = useCallback(
        ({ index, item: musicItem }: { index: number; item: IMusic.IMusicItem }) => (
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
        ),
        [
            showIndex,
            onItemPress,
            musicList,
            onItemLongPress,
            musicSheet,
            highlightMusicItem,
        ],
    );

    return (
        <View style={styles.container}>
            <FlatList
                ref={listRef}
                ListHeaderComponent={headerComponent}
                ListEmptyComponent={emptyComponent}
                ListFooterComponent={footerComponent}
                extraData={highlightMusicItem}
                data={musicList ?? []}
                getItemLayout={getItemLayout}
                /**
                 * 跳到远处时，位置由 getItemLayout 一次给准，但渲染窗口要重新铺满。
                 * 默认预算（每批 10 个、批量周期 50ms）跟不上瞬移，会白一下。
                 * 调大批量、缩短周期，让目标区域尽快铺出来。
                 */
                initialNumToRender={24}
                maxToRenderPerBatch={30}
                updateCellsBatchingPeriod={10}
                /**
                 * Android 上裁切子视图会让跳远后的 cell 来不及恢复 → 空白，
                 * 显式关掉。
                 */
                removeClippedSubviews={false}
                onScrollToIndexFailed={() => {
                    // getItemLayout 已给精确布局，理论上不会失败；兜底忽略
                }}
                onScrollBeginDrag={handleScrollBegin}
                onScrollEndDrag={handleScrollEnd}
                onMomentumScrollEnd={handleScrollEnd}
                renderItem={renderItem}
                onEndReached={() => {
                    if (
                        state === RequestStateCode.IDLE ||
                        state === RequestStateCode.PARTLY_DONE
                    ) {
                        onLoadMore?.();
                    }
                }}
                onEndReachedThreshold={0.1}
            />
            {indexItems.length > 1 ? (
                <IndexBar items={indexItems} onSelect={onIndexSelect} />
            ) : null}
            {showBadge && (
                <View style={styles.badge} pointerEvents="box-none">
                    <Pressable
                        style={[
                            styles.badgeButton,
                            { backgroundColor: colors.notification },
                        ]}
                        onPress={scrollToHighlight}>
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
    indexInner: {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        /** 视觉上很窄，把手感区域往左右各扩一点，避免点偏 */
        paddingHorizontal: rpx(12),
    },
    /** 气泡的居中容器 */
    bubbleWrap: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1200,
    },
    indexBubble: {
        width: rpx(140),
        height: rpx(140),
        borderRadius: rpx(70),
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "center",
        alignItems: "center",
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
