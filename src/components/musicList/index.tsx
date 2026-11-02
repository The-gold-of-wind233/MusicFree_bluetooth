import { RequestStateCode } from "@/constants/commonConst";
import TrackPlayer from "@/core/trackPlayer";
import rpx from "@/utils/rpx";
import { FlashList } from "@shopify/flash-list";
import React, { useRef, useCallback, useState, useEffect } from "react";
import { FlatListProps, Pressable, StyleSheet, View } from "react-native";
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
 * 所有行严格等高，所以可以直接用 行数 × ITEM_HEIGHT 算精确偏移。
 */
const ITEM_HEIGHT = rpx(120);

/**
 * A-Z 索引条（含气泡）。
 *
 * ⚠️ 必须做成**独立组件**：
 * 之前把「当前按到哪个字母」的 state 放在 MusicList 主组件里，
 * 手指每滑过一个字母就 setState 一次 → 整个 MusicList 重渲染 →
 * FlashList 收到新的 ListHeaderComponent / ListEmptyComponent 引用 →
 * 重新测量布局 → 列表内容抖一下。这正是"点字母会颤抖、而且有概率"的根因。
 *
 * 抽出来之后，按索引条只会重渲染这个小小的索引条，列表完全不受影响。
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
            // 兜底：onEnd / onFinalize 都没来（轻点且手势未激活）时气泡也要消失
            clearTimer();
            timerRef.current = setTimeout(hideBubble, 1200);
            onSelect(items[pos]);
        },
        [items, onSelect, clearTimer, hideBubble],
    );

    /**
     * ⚠️ 用 onBegin，不用 onStart。
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
    const flashListRef = useRef<FlashList<IMusic.IMusicItem>>(null);
    const [showBadge, setShowBadge] = useState(false);
    const hideTimeoutRef = useRef<NodeJS.Timeout>();

    /** 列表头部的真实高度，靠 onLayout 测量（它是可变的，不能写死） */
    const headerHeightRef = useRef(0);

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
     * 精确跳到某一行。
     *
     * ⚠️ 不用 scrollToIndex：
     * FlashList 的 scrollToIndex 按 estimatedItemSize **估算**位置，跳过去之后
     * 目标区域真实渲染出来发现高度对不上，会自己校正一次 —— 那就是"抖一下"。
     * 之前试过跳两次、延迟 80ms 再校正，都没根治，因为校正本身就会发生。
     *
     * 这里改成 **scrollToOffset 直接给像素偏移**，完全绕开估算逻辑：
     *   offset = 头部真实高度 + 第几行 × 每行固定高度
     * 所有行都是严格等高的（ListItem heightType="big" = rpx(120)），所以精确。
     */
    const scrollToRow = useCallback((index: number) => {
        const list = flashListRef.current;
        if (!list || index < 0) {
            return;
        }
        const offset = headerHeightRef.current + index * ITEM_HEIGHT;
        try {
            const anyList = list as any;
            if (typeof anyList.scrollToOffset === "function") {
                anyList.scrollToOffset({ offset, animated: false });
            } else {
                // 极老版本 FlashList 没有 scrollToOffset 时退回按 index 跳
                anyList.scrollToIndex({
                    index,
                    animated: false,
                    viewPosition: 0,
                });
            }
        } catch {
            // 越界等情况忽略
        }
    }, []);

    /** 索引条选中某个字母 */
    const onIndexSelect = useCallback(
        (item: IIndexItem) => {
            scrollToRow(item.index);
        },
        [scrollToRow],
    );

    /**
     * 头部包一层测量用的 View。
     * 用 useMemo 固定引用，避免 FlashList 因为 header 引用变化而重新测量布局。
     */
    const headerComponent = React.useMemo(() => {
        if (!Header) {
            return undefined;
        }
        return (
            <View
                collapsable={false}
                onLayout={evt => {
                    headerHeightRef.current = evt.nativeEvent.layout.height;
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

    // 滚动到高亮项（同样用精确偏移）
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
            <FlashList
                ref={flashListRef}
                ListHeaderComponent={headerComponent}
                ListEmptyComponent={emptyComponent}
                ListFooterComponent={footerComponent}
                extraData={highlightMusicItem}
                data={musicList ?? []}
                estimatedItemSize={ITEM_HEIGHT}
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
