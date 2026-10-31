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

    /** 索引条当前按到的位置（用于气泡和字母高亮），null = 没在按 */
    const [activeIndexPos, setActiveIndexPos] = useState<number | null>(null);
    /** 索引条可点击区域的高度，用来算手指落在哪个字母上 */
    const indexBarHeightRef = useRef(0);
    /** 上一次触发的位置，避免同一字母重复跳转 */
    const lastIndexPosRef = useRef(-1);
    /** 等待「精确校正」的目标，保证连续滑动时只有最后一次生效 */
    const pendingIndexRef = useRef<number | null>(null);
    /** 气泡自动收起的兜底定时器 */
    const bubbleTimerRef = useRef<any>(null);

    /** 跳到某个字母的第一首 */
    const scrollToIndexItem = useCallback((item: IIndexItem) => {
        const list = flashListRef.current;
        if (!list) {
            return;
        }
        pendingIndexRef.current = item.index;
        try {
            list.scrollToIndex({
                index: item.index,
                animated: false,
                viewPosition: 0,
            });
        } catch {
            return;
        }
        /**
         * 抖动的根因：FlashList 第一次跳转是按 estimatedItemSize **估算**位置的，
         * 目标区域渲染出来后它会自己校正一次，画面就"抖一下"。
         *
         * 所以这里等它校正完（80ms，够渲染几帧）再精确跳一次 ——
         * 此时目标已经在渲染窗口内、高度是真实值，不会再校正，画面就稳了。
         *
         * pendingIndexRef 保证连续滑动时只有最后一次校正生效，不会互相打断。
         */
        setTimeout(() => {
            if (pendingIndexRef.current !== item.index) {
                return;
            }
            pendingIndexRef.current = null;
            try {
                list.scrollToIndex({
                    index: item.index,
                    animated: false,
                    viewPosition: 0,
                });
            } catch {
                // 忽略
            }
        }, 80);
    }, []);

    /**
     * 手指在索引条上的位置 → 对应的字母
     *
     * 索引条每项等高，所以直接用「相对高度 / 单项高度」算出第几个，
     * 不用逐个测量，滑动时开销也小。
     */
    const handleIndexTouch = useCallback(
        (y: number) => {
            const total = indexItems.length;
            const height = indexBarHeightRef.current;
            if (!total || !height) {
                return;
            }
            const itemHeight = height / total;
            let pos = Math.floor(y / itemHeight);
            if (pos < 0) {
                pos = 0;
            } else if (pos > total - 1) {
                pos = total - 1;
            }
            if (pos === lastIndexPosRef.current) {
                return;
            }
            lastIndexPosRef.current = pos;
            setActiveIndexPos(pos);
            /**
             * 兜底：万一 onEnd / onFinalize 都没来（轻点且手势没激活时可能这样），
             * 气泡也得自己消失，否则会一直挂在屏幕中间。
             */
            if (bubbleTimerRef.current) {
                clearTimeout(bubbleTimerRef.current);
            }
            bubbleTimerRef.current = setTimeout(() => {
                setActiveIndexPos(null);
                lastIndexPosRef.current = -1;
            }, 1200);
            scrollToIndexItem(indexItems[pos]);
        },
        [indexItems, scrollToIndexItem],
    );

    /** 松手后延迟收起气泡，让用户看清最后停在哪 */
    const handleIndexRelease = useCallback(() => {
        if (bubbleTimerRef.current) {
            clearTimeout(bubbleTimerRef.current);
            bubbleTimerRef.current = null;
        }
        setTimeout(() => {
            setActiveIndexPos(null);
            lastIndexPosRef.current = -1;
        }, 500);
    }, []);

    /**
     * 索引条手势。
     *
     * ⚠️ 这里用的是 **onBegin，不是 onStart**。
     * onStart 要等手势「激活」才调用，而 Pan 在手指完全没移动时（也就是轻点）
     * 在 Android 上不一定激活 —— 表现就是轻点没反应、滑动才有用。
     * onBegin 是手指一按下就调用，不依赖激活，所以轻点也能立刻跳转。
     *
     * onUpdate 负责滑动过程中的连续切换，onEnd 负责收起气泡。
     * 回调跑在 UI 线程，所以通过 runOnJS 回到 JS 线程。
     */
    const indexGesture = React.useMemo(
        () =>
            Gesture.Pan()
                .minDistance(0)
                .onBegin(evt => {
                    runOnJS(handleIndexTouch)(evt.y);
                })
                .onUpdate(evt => {
                    runOnJS(handleIndexTouch)(evt.y);
                })
                .onEnd(() => {
                    runOnJS(handleIndexRelease)();
                })
                .onFinalize(() => {
                    // 手势被取消（比如被系统手势打断）也要收起气泡
                    runOnJS(handleIndexRelease)();
                }),
        [handleIndexTouch, handleIndexRelease],
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
            if (bubbleTimerRef.current) {
                clearTimeout(bubbleTimerRef.current);
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
                    <GestureDetector gesture={indexGesture}>
                        <View
                            style={styles.indexInner}
                            collapsable={false}
                            onLayout={evt => {
                                indexBarHeightRef.current =
                                    evt.nativeEvent.layout.height;
                            }}>
                            {indexItems.map((item, i) => (
                                <View
                                    key={`${item.key}-${item.index}`}
                                    style={styles.indexItem}>
                                    <ThemeText
                                        fontSize="description"
                                        fontColor={
                                            activeIndexPos === i
                                                ? "text"
                                                : "textSecondary"
                                        }
                                        fontWeight={
                                            activeIndexPos === i
                                                ? "bold"
                                                : "regular"
                                        }>
                                        {item.key}
                                    </ThemeText>
                                </View>
                            ))}
                        </View>
                    </GestureDetector>
                </View>
            ) : null}
            {activeIndexPos !== null ? (
                <View style={styles.bubbleWrap} pointerEvents="none">
                    <View style={styles.indexBubble}>
                        <ThemeText
                            fontSize="appbar"
                            fontWeight="bold"
                            fontColor="text">
                            {indexItems[activeIndexPos]?.key}
                        </ThemeText>
                    </View>
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
    indexInner: {
        width: "100%",
        justifyContent: "center",
        alignItems: "center",
        /** 索引条视觉上很窄，把手感区域往左右各扩一点，避免点偏 */
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
