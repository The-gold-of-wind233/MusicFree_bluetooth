import React from "react";
import Header from "./header";
import MusicList from "@/components/musicList";
import { useParams } from "@/core/router";
import HorizontalSafeAreaView from "@/components/base/horizontalSafeAreaView.tsx";
import globalStyle from "@/constants/globalStyle";
import MusicSheet, { useSheetItem } from "@/core/musicSheet";
import { RequestStateCode, SortType } from "@/constants/commonConst";
import { useCurrentMusic } from "@/core/trackPlayer";
import { ROUTE_PATH } from "@/core/router";
import { useNavigation } from "@react-navigation/native";

export default function SheetMusicList() {
    const { id = "favorite" } = useParams<"local-sheet-detail">();
    const navigation = useNavigation<any>();
    const musicSheet = useSheetItem(id);
    const currentMusic = useCurrentMusic();
    // 把排序方式传给列表：只有按名称排序时才显示 A-Z 索引条
    const sortType = MusicSheet.getSheetMeta(id, "sort") as SortType | undefined;

    return (
        <HorizontalSafeAreaView style={globalStyle.flex1}>
            <MusicList
                Header={<Header />}
                musicList={musicSheet?.musicList}
                musicSheet={musicSheet}
                showIndex
                state={RequestStateCode.IDLE}
                highlightMusicItem={currentMusic}
                sortType={sortType}
                onItemLongPress={musicItem => {
                    // 长按直接进入「批量编辑歌曲」页，并把这首预选中
                    navigation.navigate(ROUTE_PATH.MUSIC_LIST_EDITOR, {
                        musicSheet: musicSheet,
                        musicList: musicSheet?.musicList ?? [],
                        initCheckedItem: musicItem,
                    });
                }}
            />
        </HorizontalSafeAreaView>
    );
}
