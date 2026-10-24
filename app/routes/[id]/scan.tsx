import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { parseLabel } from '@/services/labelParser';
import { formatCep, isValidCep } from '@/utils/cep';
import { Button } from '@/components/ui';
import { colors, spacing } from '@/theme';

/** Correios imprime o CEP de destino como Code 128 de 8 dígitos. */
function cepFromBarcode(r: BarcodeScanningResult): string | null {
  const digits = r.data.trim();
  return /^\d{8}$/.test(digits) ? digits : null;
}

export default function ScanLabelScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [barcodeCep, setBarcodeCep] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const onBarcode = useCallback((r: BarcodeScanningResult) => {
    const cep = cepFromBarcode(r);
    if (cep) setBarcodeCep((prev) => prev ?? cep);
  }, []);

  const goToForm = (fields: { cep: string; number?: string | null; label?: string | null; complement?: string | null }) => {
    if (!routeId) return;
    router.replace({
      pathname: '/routes/[id]/add',
      params: {
        id: routeId,
        cep: fields.cep,
        number: fields.number ?? '',
        label: fields.label ?? '',
        complement: fields.complement ?? '',
      },
    });
  };

  const readLabel = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    setHint(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) throw new Error('Não foi possível capturar a imagem');
      const ocr = await TextRecognition.recognize(photo.uri);
      const parsed = parseLabel(ocr.text ?? '');
      // CEP do código de barras é exato; o do OCR pode ter erro de leitura
      const cep = barcodeCep ?? parsed.cep;

      if (!cep || !isValidCep(cep)) {
        setHint('Não achei um CEP na etiqueta. Aproxime a câmera do bloco do destinatário e tente de novo.');
        return;
      }

      if (parsed.allCeps.length > 1 && !barcodeCep) {
        // Mais de um CEP (destinatário + remetente): deixa o usuário confirmar
        Alert.alert(
          'Qual é o CEP de entrega?',
          'A etiqueta tem mais de um CEP.',
          [
            ...parsed.allCeps.slice(0, 3).map((c) => ({
              text: formatCep(c) + (c === parsed.cep ? ' (destinatário)' : ''),
              onPress: () => goToForm({ ...parsed, cep: c }),
            })),
            { text: 'Cancelar', style: 'cancel' as const },
          ],
        );
        return;
      }

      goToForm({ ...parsed, cep });
    } catch (e) {
      setHint(e instanceof Error ? e.message : 'Falha ao ler a etiqueta');
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { padding: spacing.xl, gap: spacing.lg }]}>
        <Text style={styles.text}>O RotaFix precisa da câmera para ler a etiqueta de envio.</Text>
        <Button title="Permitir câmera" onPress={() => void requestPermission()} />
        <Button title="Digitar CEP" variant="ghost" onPress={() => router.replace({ pathname: '/routes/[id]/add', params: { id: routeId ?? '' } })} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39', 'itf14', 'qr', 'datamatrix', 'pdf417'] }}
        onBarcodeScanned={onBarcode}
      />

      <View style={styles.overlay} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.overlayText}>Enquadre o bloco do destinatário (nome, endereço e CEP)</Text>
      </View>

      <View style={styles.footer}>
        {barcodeCep ? (
          <Pressable onPress={() => setBarcodeCep(null)} style={styles.chip}>
            <Text style={styles.chipText}>CEP lido no código de barras: {formatCep(barcodeCep)} ✕</Text>
          </Pressable>
        ) : null}
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        <View style={styles.row}>
          <Button
            title="Digitar"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.replace({ pathname: '/routes/[id]/add', params: { id: routeId ?? '', cep: barcodeCep ?? '' } })}
          />
          <Button title="Ler etiqueta" style={{ flex: 2 }} onPress={() => void readLabel()} loading={busy} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  camera: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  frame: {
    width: '85%',
    aspectRatio: 1.4,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  overlayText: {
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  footer: { padding: spacing.lg, gap: spacing.sm, backgroundColor: colors.card },
  row: { flexDirection: 'row', gap: spacing.md },
  chip: { alignSelf: 'flex-start', backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipText: { color: colors.primaryDark, fontWeight: '600', fontSize: 13 },
  hint: { color: colors.danger, fontSize: 13 },
  text: { color: colors.text, textAlign: 'center', fontSize: 15 },
});
