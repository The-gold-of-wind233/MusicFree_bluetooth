import React, { useMemo } from "react";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import useOrientation from "@/hooks/useOrientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCurrentMusic } from "@/core/trackPlayer";
import globalStyle from "@/constants/globalStyle";
import { View } from "react-native";
import Operations from "./operations";
import { showPanel } from "@/components/panels/usePanel.ts";
import TrackPlayer from "@/core/trackPlayer";
import Config from "@/core/appConfig";
import { errorLog } from "@/utils/log";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";

interface IProps {
    onTurnPageClick?: () => void;
}

/**
 * 触发切歌所需的水平位移
 *
 * 原来在歌词页用的是固定 60，滑起来明显偏重。这里改成按屏幕宽度换算
 * （rpx(72) 约为屏幕宽度的 9.6%，常见机型约 35dp），配合跟手动画，
 * 手指移动一点就能看到反馈，不需要滑很远。
 */
const SWIPE_THRESHOLD = rpx(72);
/** 允许的垂直偏移上限：超过就判定为竖向操作，不切歌 */
const SWIPE_MAX_Y = rpx(60);

export default function AlbumCover(props: IProps) {
    const { onTurnPageClick } = props;

    const musicItem = useCurrentMusic();
    const orientation = useOrientation();

    const artworkStyle = useMemo(() => {
        if (orientation === "vertical") {
            return {
                width: rpx(500),
                height: rpx(500),
            };
        } else {
            return {
                width: rpx(260),
                height: rpx(260),
            };
        }
    }, [orientation]);

    // 跟手位移：手指拖动时封面跟着动，松手再回弹或切歌
    const translateX = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const longPress = Gesture.LongPress()
        .onStart(() => {
            if (musicItem?.artwork) {
                showPanel("ImageViewer", {
                    url: musicItem.artwork,
                });
            }
        })
        .runOnJS(true);

    const tap = Gesture.Tap()
        .onStart(() => {
            onTurnPageClick?.();
        })
        .runOnJS(true);

    /**
     * 左右滑切歌：左滑下一首、右滑上一首
     *
     * - activeOffsetX：水平位移到阈值才激活，避免和点击/长按抢事件
     * - failOffsetY：竖向移动超过上限就放弃，不干扰页面内其它手势
     * - onUpdate 里实时跟手（带阻尼），这是「好滑」的关键：
     *   没跟手反馈时，再小的阈值也会让人觉得没反应
     */
    const swipe = Gesture.Pan()
        .enabled(Config.getConfig("basic.lyricSwipeToSwitch") ?? true)
        .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
        .failOffsetY([-SWIPE_MAX_Y, SWIPE_MAX_Y])
        .onUpdate(evt => {
            translateX.value = evt.translationX * 0.55;
        })
        .onEnd(evt => {
            const dx = evt.translationX;
            const shouldSwitch = Math.abs(dx) >= SWIPE_THRESHOLD;
            const direction = dx < 0 ? 1 : -1;

            if (!shouldSwitch) {
                // 距离不够，回弹
                translateX.value = withTiming(0, { duration: 180 });
                return;
            }

            // 先滑出屏幕，再切歌（切歌会在回调里发生，封面随即更新）
            translateX.value = withTiming(
                direction * rpx(750),
                { duration: 160 },
                finished => {
                    if (!finished) {
                        return;
                    }
                    runOnJS(switchSong)(direction);
                    // 从另一侧滑入，衔接下一首/上一首
                    translateX.value = -direction * rpx(750);
                    translateX.value = withTiming(0, { duration: 220 });
                },
            );
        });

    /** 真正的切歌动作（reanimated 的工作线程回调里通过 runOnJS 调用） */
    function switchSong(direction: number) {
        try {
            if (direction > 0) {
                TrackPlayer.skipToNext();
            } else {
                TrackPlayer.skipToPrevious();
            }
        } catch (e) {
            errorLog("滑动切歌失败", e);
        }
    }

    const combineGesture = Gesture.Race(tap, longPress, swipe);

    return (
        <>
            <GestureDetector gesture={combineGesture}>
                <View style={globalStyle.fullCenter}>
                    <Animated.View style={animatedStyle}>
                        <FastImage
                            style={artworkStyle}
                            source={musicItem?.artwork}
                            placeholderSource={ImgAsset.albumDefault}
                        />
                    </Animated.View>
                </View>
            </GestureDetector>
            <Operations />
        </>
    );
}
