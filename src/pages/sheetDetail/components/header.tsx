import FastImage from "@/components/base/fastImage";
import PlayAllBar from "@/components/base/playAllBar";
import ThemeText from "@/components/base/themeText";
import { ImgAsset } from "@/constants/assetsConst";
import { useI18N } from "@/core/i18n";
import { useSheetItem } from "@/core/musicSheet";
import { useParams } from "@/core/router";
import useColors from "@/hooks/useColors";
import rpx from "@/utils/rpx";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { calcSheetDuration, formatDuration } from "@/utils/sheetStats";

export default function Header() {
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const sheet = useSheetItem(id);
    const colors = useColors();
    const { t } = useI18N();
    /**
     * 歌单总时长。
     * 很多在线歌曲在没播放过之前不带 duration 字段，
     * 所以这里是「已知 N 首的时长」，播过的歌会自动补上（见下方回填逻辑）。
     */
    const durationInfo = useMemo(
        () => calcSheetDuration(sheet?.musicList),
        [sheet?.musicList],
    );

    return (
        <View style={{ backgroundColor: colors.card }}>
            <View style={style.content}>
                <FastImage
                    style={style.coverImg}
                    source={sheet?.coverImg}
                    placeholderSource={ImgAsset.albumDefault}
                />
                <View style={style.details}>
                    <ThemeText fontSize="title" numberOfLines={3}>
                        {sheet?.title}
                    </ThemeText>
                    <ThemeText fontColor="textSecondary" fontSize="subTitle">
                        {t("sheetDetail.totalMusicCount", {
                            count: sheet?.musicList?.length ?? 0,
                        })}
                    </ThemeText>
                    {durationInfo ? (
                        <ThemeText
                            fontColor="textSecondary"
                            fontSize="description">
                            {durationInfo.knownCount === durationInfo.totalCount
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
            <PlayAllBar musicList={sheet?.musicList} musicSheet={sheet} />
        </View>
    );
}

const style = StyleSheet.create({
    content: {
        width: "100%",
        height: rpx(300),
        paddingHorizontal: rpx(24),
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
        paddingHorizontal: rpx(36),
        flex: 1,
        height: rpx(140),
        justifyContent: "space-between",
        gap: rpx(14),
    },
});
