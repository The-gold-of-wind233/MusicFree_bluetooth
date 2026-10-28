import NativeUtils from "@/native/utils";

/**
 * 当前是否有蓝牙音频设备连接
 *
 * 原生侧检测失败会返回 false；这里再做一层容错，
 * 万一模块缺失（比如换了包名导致找不到）也不会让歌词推送崩掉。
 */
export function isBluetoothAudioConnected(): boolean {
    try {
        const fn = NativeUtils?.isBluetoothAudioConnected;
        if (typeof fn !== "function") {
            return false;
        }
        return !!fn.call(NativeUtils);
    } catch {
        return false;
    }
}
