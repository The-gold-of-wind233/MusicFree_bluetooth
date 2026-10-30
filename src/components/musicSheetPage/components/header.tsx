import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import rpx from "@/utils/rpx";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import FastImage from "@/components/base/fastImage";
import PlayAllBar from "@/components/base/playAllBar";
import useColors from "@/hooks/useColors";
import { useI18N } from "@/core/i18n";
import { calcSheetDuration, formatDuration } from "@/utils/sheetStats";

interface IHeaderProps {
    musicSheet: IMusic.IMusicSheetItem | null;
    musicList: IMusic.IMusicItem[] | null;
    canStar?: boolean;
}
export default function Header(props: IHeaderProps) {
    const { musicSheet, musicList, canStar } = props;
    const colors = useColors();
    const { t } = useI18N();

    const [maxLines, setMaxLines] = useState<number | undefined>(6);
    // 歌单总时长；没有时长数据时为 undefined，此时不显示
    const durationInfo = useMemo(
        () => calcSheetDuration(musicList),
        [musicList],
    );

    const toggleShowMore = () => {
        if (maxLines) {
            setMaxLines(undefined);
        } else {
            setMaxLines(6);
        }
    };

    return (
        <View style={{ backgroundColor: colors.card }}>
            <View style={style.wrapper}>
                <View style={style.content}>
                    <FastImage
                        style={style.coverImg}
                        source={musicSheet?.artwork ?? musicSheet?.coverImg}
                        placeholderSource={ImgAsset.albumDefault}
                    />
                    <View style={style.details}>
                        <ThemeText numberOfLines={3}>
                            {musicSheet?.title}
                        </ThemeText>
                        <ThemeText
                            fontColor="textSecondary"
                            fontSize="description">
                            共
                            {musicSheet?.worksNum ??
                                (musicList ? musicList.length ?? 0 : "-")}
                            首{" "}
                        </ThemeText>
                        {durationInfo ? (
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="description">
                                {durationInfo.knownCount ===
                                durationInfo.totalCount
                                    ? t("sheetDetail.totalDuration", {
                                          duration: formatDuration(
                                              durationInfo.total,
                                          ),
                                      })
                                    : t("sheetDetail.totalDurationPartial", {
                                          duration: formatDuration(
                                              durationInfo.total,
                                          ),
                                          count: durationInfo.knownCount,
                                      })}
                            </ThemeText>
                        ) : null}
                    </View>
                </View>
                {musicSheet?.description ? (
                    <Pressable onPress={toggleShowMore}>
                        <View
                            style={style.albumDesc}
                            // onLayout={evt => {
                            //     console.log(evt.nativeEvent.layout);
                            // }}
                        >
                            <ThemeText
                                fontColor="textSecondary"
                                fontSize="description"
                                numberOfLines={maxLines}>
                                {musicSheet.description}
                            </ThemeText>
                        </View>
                    </Pressable>
                ) : null}
            </View>
            <PlayAllBar
                canStar={canStar}
                musicList={musicList}
                musicSheet={musicSheet}
            />
        </View>
    );
}

const style = StyleSheet.create({
    wrapper: {
        width: "100%",
        padding: rpx(24),
        justifyContent: "center",
        alignItems: "flex-start",
    },
    content: {
        flex: 1,
        flexDirection: "row",
        justifyContent: "flex-start",
        alignItems: "center",
    },
    coverImg: {
        width: rpx(210),
        height: rpx(210),
        borderRadius: rpx(24),
    },
    details: {
        flex: 1,
        height: rpx(140),
        paddingHorizontal: rpx(36),
        justifyContent: "space-between",
    },
    divider: {
        marginVertical: rpx(18),
    },

    albumDesc: {
        width: "100%",
        marginTop: rpx(28),
    },
});
