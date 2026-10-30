/**
 * 歌单总时长统计
 *
 * 只要总时长，歌手数 / 专辑数不做（用户明确说没必要）。
 */

export interface IDurationInfo {
    /** 已知时长的歌曲数 */
    knownCount: number;
    /** 歌单总歌曲数 */
    totalCount: number;
    /** 已知部分的时长总和（秒） */
    total: number;
}

/** 把秒数格式化成「x小时y分」/「y分」/「z秒」 */
export function formatDuration(seconds: number): string {
    if (!seconds || seconds < 0) {
        return "0秒";
    }
    const total = Math.floor(seconds);
    const hour = Math.floor(total / 3600);
    const minute = Math.floor((total % 3600) / 60);
    const second = total % 60;
    if (hour > 0) {
        return minute > 0 ? `${hour}小时${minute}分` : `${hour}小时`;
    }
    if (minute > 0) {
        return `${minute}分`;
    }
    return `${second}秒`;
}

/**
 * 统计歌单总时长
 *
 * 返回 undefined 表示「一首都没有时长信息」——
 * 很多在线歌曲在未播放过之前不带 duration，这时显示「0秒」会误导，
 * 所以宁可整行不显示。
 *
 * 只接受 0~3600 秒之间的值，避免脏数据把总和拉爆。
 */
export function calcSheetDuration(
    musicList?: IMusic.IMusicItem[] | null,
): IDurationInfo | undefined {
    if (!musicList || !musicList.length) {
        return undefined;
    }
    let sum = 0;
    let count = 0;
    for (const item of musicList) {
        const duration = item?.duration;
        if (typeof duration === "number" && duration > 0 && duration < 3600) {
            sum += duration;
            ++count;
        }
    }
    if (count === 0) {
        return undefined;
    }
    return {
        knownCount: count,
        totalCount: musicList.length,
        total: sum,
    };
}
