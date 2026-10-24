import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'RotaFix',
  slug: 'rotafix',
  owner: 'brunomnoronha',
  extra: {
    eas: { projectId: 'b0455e6c-0e6c-4910-8c3c-d536458b122d' },
  },
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
      'expo-camera',
      {
        cameraPermission: 'RotaFix usa a câmera para ler etiquetas de envio.',
        recordAudioAndroid: false,
      },
    ],
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
