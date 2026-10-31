/**
 * 封面切歌动画的「总线」
 *
 * 需求：点播放页的上一首 / 下一首按钮时，封面也要像左右滑那样滑出去再滑进来。
 *
 * 难点在于**时序**：动画必须「先滑出当前封面 → 切歌 → 新封面滑入」，
 * 也就是说切歌动作要延后到动画中途执行。按钮那边直接调 skipToNext 的话，
 * 封面会瞬间换掉，动画就没意义了。
 *
 * 所以做成：封面页挂载时把自己注册进来，按钮调用 requestCoverSwitch 把
 * 「切哪一边」交给封面页处理，由封面页决定什么时候真正切歌。
 */

/** direction: 1 = 下一首，-1 = 上一首 */
export type ICoverSwitchHandler = (direction: number) => void;

let handler: ICoverSwitchHandler | null = null;

/** 封面页挂载 / 卸载时调用 */
export function registerCoverSwitchHandler(h: ICoverSwitchHandler | null) {
    handler = h;
}

/**
 * 由切歌按钮调用。
 * @returns true 表示已交给封面动画处理（不要再自己切歌）；
 *          false 表示封面页不在前台（比如在歌词页），调用方应直接切歌。
 */
export function requestCoverSwitch(direction: number): boolean {
    if (!handler) {
        return false;
    }
    handler(direction);
    return true;
}
