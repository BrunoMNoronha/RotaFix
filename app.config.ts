import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'RotaFix',
  slug: 'rotafix',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'rotafix',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.rotafix.app',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '',
      },
    },
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-sharing',
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'RotaFix usa sua localização para iniciar a rota do ponto onde você está.',
      },
    ],
  ],
  experiments: { typedRoutes: true },
});
