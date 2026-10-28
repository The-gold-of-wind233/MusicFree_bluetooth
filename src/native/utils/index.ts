import { NativeModule, NativeModules } from "react-native";

interface INativeUtils extends NativeModule {
    exitApp: () => void;
    checkStoragePermission: () => Promise<boolean>;
    requestStoragePermission: () => void;
    getWindowDimensions: () => { width: number, height: number }; // Fix bug: https://github.com/facebook/react-native/issues/47080
    /** 当前是否有蓝牙音频设备（车机 / 蓝牙耳机）连着 */
    isBluetoothAudioConnected: () => boolean;
}

const NativeUtils = NativeModules.NativeUtils;

export default NativeUtils as INativeUtils;
