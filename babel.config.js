module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Reanimated を使用するライブラリ（ドラッグ&ドロップ等）のため
      'react-native-reanimated/plugin',
    ],
  };
};
