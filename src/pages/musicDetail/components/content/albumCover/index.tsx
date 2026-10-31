import React, { useCallback, useEffect, useMemo, useRef } from "react";
import rpx from "@/utils/rpx";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import useOrientation from "@/hooks/useOrientation";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useCurrentMusic } from "@/core/trackPlayer";
import globalStyle from "@/constants/globalStyle";
import { View } from "react-native";
import Operations from "./operations";
import { registerCoverSwitchHandler } from "./switchBus";
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
    const switchSong = useCallback((direction: number) => {
        try {
            if (direction > 0) {
                TrackPlayer.skipToNext();
            } else {
                TrackPlayer.skipToPrevious();
            }
        } catch (e) {
            errorLog("切歌失败", e);
        }
    }, []);

    /** 是否正在播放切歌动画（用于连点时不再叠加动画） */
    const switchingRef = useRef(false);

    const markSwitchIdle = useCallback(() => {
        switchingRef.current = false;
    }, []);

    /** 动画结束后真正切歌，并复位标记 */
    const finishSwitch = useCallback(
        (direction: number) => {
            switchSong(direction);
            switchingRef.current = false;
        },
        [switchSong],
    );

    /**
     * 点上一首 / 下一首按钮时走这里：和左右滑完全同一套动画。
     *
     * 顺序同样是「当前封面滑出 → 切歌 → 新封面从另一侧滑入」，
     * 否则封面会先换掉，滑出去的就是新歌的封面了。
     */
    const handleButtonSwitch = useCallback(
        (direction: number) => {
            // 上一次动画还没结束，直接切，避免动画叠加导致封面乱飞
            if (switchingRef.current) {
                switchSong(direction);
                return;
            }
            switchingRef.current = true;
            translateX.value = withTiming(
                -direction * SLIDE_DISTANCE,
                { duration: 130 },
                finished => {
                    if (!finished) {
                        runOnJS(markSwitchIdle)();
                        return;
                    }
                    // 此刻封面在屏幕外，切换不会被看到
                    runOnJS(finishSwitch)(direction);
                    translateX.value = direction * SLIDE_DISTANCE;
                    translateX.value = withTiming(0, { duration: 200 });
                },
            );
        },
        [finishSwitch, markSwitchIdle, switchSong],
    );

    /**
     * 封面页在前台时，把切歌按钮的请求接管过来；
     * 切到歌词页（组件卸载）后自动注销，按钮恢复成立即切歌。
     */
    useEffect(() => {
        registerCoverSwitchHandler(handleButtonSwitch);
        return () => registerCoverSwitchHandler(null);
    }, [handleButtonSwitch]);

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

                /**
                 * ⚠️ 顺序很关键：必须等「当前这首歌的封面」滑出屏幕之后再切歌。
                 *
                 * 如果像之前那样在这里立刻切歌，FastImage 的 source 会马上
                 * 变成下一首，于是滑出去的那道残影就变成了新歌封面 ——
                 * 而它应该是当前这首歌的封面。
                 *
                 * 所以：当前封面滑出 →（此时已在屏幕外）切歌 → 新封面从另一侧滑入。
                 */
                translateX.value = withTiming(
                    -direction * SLIDE_DISTANCE,
                    { duration: 130 },
                    finished => {
                        if (!finished) {
                            return;
                        }
                        // 此刻封面在屏幕外，切换不会被看到
                        runOnJS(switchSong)(direction);
                        // 新封面挪到另一侧，再滑进来
                        translateX.value = direction * SLIDE_DISTANCE;
                        translateX.value = withTiming(0, { duration: 200 });
                    },
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
