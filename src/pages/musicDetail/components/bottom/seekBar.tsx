import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import rpx from "@/utils/rpx";
import Slider from "@react-native-community/slider";
import timeformat from "@/utils/timeformat";
import { fontSizeConst } from "@/constants/uiConst";
import TrackPlayer, { useProgress } from "@/core/trackPlayer";

interface ITimeLabelProps {
    time: number;
}

function TimeLabel(props: ITimeLabelProps) {
    return (
        <Text style={style.text}>{timeformat(Math.max(props.time, 0))}</Text>
    );
}

export default function SeekBar() {
    const progress = useProgress(1000);
    const [tmpProgress, setTmpProgress] = useState<number | null>(null);
    const slidingRef = useRef(false);

    /**
     * 松手后的目标位置。
     *
     * 原来的写法是松手时立刻 setTmpProgress(null)，于是时间显示瞬间退回
     * 「拖动前的旧值」；而 seekTo 是异步的、useProgress 每秒才更新一次，
     * 中间这一秒就会看到时间跳回去。
     *
     * 现在改成：松手后继续显示目标值，等真实进度追上来（或超时）再切回。
     */
    const pendingSeekRef = useRef<number | null>(null);
    const pendingTimerRef = useRef<any>(null);

    useEffect(() => {
        const target = pendingSeekRef.current;
        if (target === null) {
            return;
        }
        // 真实进度已追上目标（允许 1.5 秒误差：进度每秒才推一次）
        if (Math.abs(progress.position - target) < 1.5) {
            pendingSeekRef.current = null;
            if (pendingTimerRef.current) {
                clearTimeout(pendingTimerRef.current);
                pendingTimerRef.current = null;
            }
            setTmpProgress(null);
        }
    }, [progress.position]);

    // 组件卸载时清掉兜底定时器
    useEffect(() => {
        return () => {
            if (pendingTimerRef.current) {
                clearTimeout(pendingTimerRef.current);
            }
        };
    }, []);

    return (
        <View style={style.wrapper}>
            <TimeLabel time={tmpProgress ?? progress.position} />
            <Slider
                style={style.slider}
                minimumTrackTintColor={"#cccccc"}
                maximumTrackTintColor={"#999999"}
                thumbTintColor={"#dddddd"}
                minimumValue={0}
                maximumValue={progress.duration}
                onSlidingStart={() => {
                    slidingRef.current = true;
                }}
                onValueChange={val => {
                    if (slidingRef.current) {
                        setTmpProgress(val);
                    }
                }}
                onSlidingComplete={val => {
                    slidingRef.current = false;
                    let target = val;
                    if (target >= progress.duration - 2) {
                        target = progress.duration - 2;
                    }
                    if (target < 0) {
                        target = 0;
                    }
                    // 保持显示目标值，直到真实进度追上来
                    pendingSeekRef.current = target;
                    setTmpProgress(target);
                    if (pendingTimerRef.current) {
                        clearTimeout(pendingTimerRef.current);
                    }
                    // 兜底：seek 失败或进度不更新时，2 秒后强制切回真实进度
                    pendingTimerRef.current = setTimeout(() => {
                        pendingSeekRef.current = null;
                        pendingTimerRef.current = null;
                        setTmpProgress(null);
                    }, 2000);
                    TrackPlayer.seekTo(target);
                }}
                value={progress.position}
            />
            <TimeLabel time={progress.duration} />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(40),
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "row",
    },
    slider: {
        width: "73%",
        height: rpx(40),
    },
    text: {
        fontSize: fontSizeConst.description,
        includeFontPadding: false,
        color: "#cccccc",
    },
});
