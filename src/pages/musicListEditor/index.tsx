import AppBar from "@/components/base/appBar";
import StatusBar from "@/components/base/statusBar";
import VerticalSafeAreaView from "@/components/base/verticalSafeAreaView";
import globalStyle from "@/constants/globalStyle";
import i18n from "@/core/i18n";
import { useParams } from "@/core/router";
import { useSetAtom } from "jotai";
import React, { useEffect } from "react";
import Body from "./components/body";
import Bottom from "./components/bottom";
import { editingMusicListAtom, musicListChangedAtom } from "./store/atom";
import { isSameMediaItem } from "@/utils/mediaUtils";

export default function MusicListEditor() {
    const { musicSheet, musicList, initCheckedItem } =
        useParams<"music-list-editor">();

    const setEditingMusicList = useSetAtom(editingMusicListAtom);
    const setMusicListChanged = useSetAtom(musicListChangedAtom);

    useEffect(() => {
        // 长按进来的话，把长按的那一首预先勾上，省得在长列表里再找一遍
        setEditingMusicList(
            (musicList ?? []).map(_ => ({
                musicItem: _,
                checked: initCheckedItem
                    ? isSameMediaItem(_, initCheckedItem)
                    : false,
            })),
        );
        return () => {
            setEditingMusicList([]);
            setMusicListChanged(false);
        };
    }, []);

    return (
        <VerticalSafeAreaView style={globalStyle.fwflex1}>
            <StatusBar />
            <AppBar>{musicSheet?.title ?? i18n.t("common.sheet")}</AppBar>
            <Body />
            <Bottom />
        </VerticalSafeAreaView>
    );
}
