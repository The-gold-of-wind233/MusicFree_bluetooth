import React, { memo, useEffect, useState } from "react";
import { Keyboard, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import { CircularProgressBase } from "react-native-circular-progress-indicator";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showPanel } from "../panels/usePanel";
import useColors from "@/hooks/useColors";
import IconButton from "../base/iconButton";
import TrackPlayer, { useCurrentMusic, useMusicState, useProgress } from "@/core/trackPlayer";
import { musicIsPaused } from "@/utils/trackUtils";
import MusicInfo from "./musicInfo";
import Icon from "@/components/base/icon.tsx";
import MusicSheet from "@/core/musicSheet";

/**
 * 播放时把真实时长回填到歌单里（只做一次）
 *
 * 很多在线歌曲在未播放之前不带 duration 字段，歌单总时长因此算不出来。
 * 播过之后 RNTP 会给出真实时长，这里写回歌单，
 * 于是「总时长」会随着听歌逐渐变准。
 *
 * 放在音乐栏是因为它常年显示在前台（后台 service 里的 jotai store 是空的，
 * 在那里回填不会生效，所以不能用 service 的进度事件）。
 */
function useBackfillDuration() {
    const progress = useProgress();
    const currentMusic = useCurrentMusic();

    useEffect(() => {
        const duration = progress?.duration;
        if (duration && duration > 0 && currentMusic) {
            MusicSheet.backfillDuration(currentMusic, duration);
        }
    }, [progress?.duration, currentMusic]);
}

function MusicBarInner() {
    useBackfillDuration();
    return null;
}

function CircularPlayBtn() {
    const progress = useProgress();
    const musicState = useMusicState();
    const colors = useColors();

    const isPaused = musicIsPaused(musicState);

    return (
        <CircularProgressBase
            activeStrokeWidth={rpx(4)}
            inActiveStrokeWidth={rpx(2)}
            inActiveStrokeOpacity={0.2}
            value={
                progress?.duration
                    ? (100 * progress.position) / progress.duration
                    : 0
            }
            duration={100}
            radius={rpx(36)}
            activeStrokeColor={colors.musicBarText}
            inActiveStrokeColor={colors.textSecondary}>
            <IconButton
                accessibilityLabel={"播放或暂停歌曲"}
                name={isPaused ? "play" : "pause"}
                sizeType={"normal"}
                hitSlop={{
                    top: 10,
                    left: 10,
                    right: 10,
                    bottom: 10,
                }}
                color={colors.musicBarText}
                onPress={async () => {
                    if (isPaused) {
                        await TrackPlayer.play();
                    } else {
                        await TrackPlayer.pause();
                    }
                }}
            />
        </CircularProgressBase>
    );
}
function MusicBar() {
    const musicItem = useCurrentMusic();

    const [showKeyboard, setKeyboardStatus] = useState(false);

    const colors = useColors();
    const safeAreaInsets = useSafeAreaInsets();

    useEffect(() => {
        const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
            setKeyboardStatus(true);
        });
        const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
            setKeyboardStatus(false);
        });

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return (
        <>
            {/* 独立于 memo：MusicBar 被 memo 成永不重渲染，
                这个子组件自己订阅进度，才能持续回填时长 */}
            <MusicBarInner />
            {musicItem && !showKeyboard && (
                <View
                    style={[
                        style.wrapper,
                        {
                            backgroundColor: colors.musicBar,
                            paddingRight: safeAreaInsets.right + rpx(24),
                        },
                    ]}
                    accessible
                    accessibilityLabel={`歌曲: ${musicItem.title} 歌手: ${musicItem.artist}`}
                    // onPress={() => {
                    //     navigate(ROUTE_PATH.MUSIC_DETAIL);
                    // }}
                >
                    <MusicInfo musicItem={musicItem} />
                    <View style={style.actionGroup}>
                        <CircularPlayBtn />
                        <Icon
                            accessible
                            accessibilityLabel="播放列表"
                            name="playlist"
                            size={rpx(56)}
                            onPress={() => {
                                showPanel("PlayList");
                            }}
                            color={colors.musicBarText}
                            style={[style.actionIcon]}
                        />
                    </View>
                </View>
            )}
        </>
    );
}

export default memo(MusicBar, () => true);

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        height: rpx(132),
        flexDirection: "row",
        alignItems: "center",
        paddingRight: rpx(24),
    },
    actionGroup: {
        width: rpx(200),
        justifyContent: "flex-end",
        flexDirection: "row",
        alignItems: "center",
    },
    actionIcon: {
        marginLeft: rpx(36),
    },
});
