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
    withSequence,
    withTiming,
} from "react-native-reanimated";

interface IProps {
    onTurnPageClick?: () => void;
}

/**
 * ⚠️ 以下常量必须在「模块顶层」算好
 *
 * reanimated 的手势回调跑在 UI 线程（worklet），里面不能调用任何依赖
 * JS 模块的普通函数。rpx() 内部用了 react-native 的 Dimensions，
 * 在 worklet 里调用会直接崩溃 —— 上一版就是踩了这个坑导致滑动闪退。
 * 所以这里一次性在 JS 侧算成数字，worklet 里只用数字。
 */
/** 触发切歌所需的水平位移（按屏幕宽度换算，约屏幕宽的 9.6%） */
const SWIPE_THRESHOLD = rpx(72);
/** 允许的垂直偏移上限：超过就判定为竖向操作，不切歌 */
const SWIPE_MAX_Y = rpx(60);
/** 滑出屏幕的距离 */
const SLIDE_DISTANCE = rpx(750);
/** 跟手阻尼：手指移动 1px，封面移动 0.55px */
const FOLLOW_DAMPING = 0.55;

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

    // 跟手位移：手指拖动时封面跟着动
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
     * 切歌动作。通过 runOnJS 从 worklet 回到 JS 线程执行
     * @param direction 1 = 下一首，-1 = 上一首
     */
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

    /**
     * 左右滑切歌：左滑下一首、右滑上一首
     *
     * - activeOffsetX：水平位移到阈值才激活，避免和点击 / 长按抢事件
     * - failOffsetY：竖向移动超过上限就放弃
     * - onUpdate 实时跟手（带阻尼），这是「好滑」的关键
     *
     * ⚠️ 这个回调整体是 worklet，内部只能用数字常量和纯函数，
     * 不能调用 rpx()、Config 这类需要 JS 运行时的东西
     */
    const swipe = Gesture.Pan()
        .enabled(Config.getConfig("basic.lyricSwipeToSwitch") ?? true)
        .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
        .failOffsetY([-SWIPE_MAX_Y, SWIPE_MAX_Y])
        .onUpdate(evt => {
            translateX.value = evt.translationX * FOLLOW_DAMPING;
        })
        .onEnd(evt => {
            const dx = evt.translationX;

            if (dx < -SWIPE_THRESHOLD || dx > SWIPE_THRESHOLD) {
                // dx < 0 是左滑 → 下一首（direction = 1）
                const direction = dx < 0 ? 1 : -1;

                // 切歌放在这里立刻触发：封面加载是异步的，
                // 等动画跑完再切反而会看到旧封面卡一下
                runOnJS(switchSong)(direction);

                // 旧封面滑出去 → 瞬间挪到另一侧 → 新封面滑进来
                translateX.value = withSequence(
                    withTiming(-direction * SLIDE_DISTANCE, { duration: 130 }),
                    withTiming(direction * SLIDE_DISTANCE, { duration: 0 }),
                    withTiming(0, { duration: 200 }),
                );
            } else {
                // 距离不够，回弹
                translateX.value = withTiming(0, { duration: 180 });
            }
        });

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
