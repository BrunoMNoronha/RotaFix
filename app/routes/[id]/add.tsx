import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useRoutesStore } from '@/store/useRoutesStore';
import { CepNotFoundError } from '@/services/cep';
import { formatCep, isValidCep, normalizeCep } from '@/utils/cep';
import { Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

export default function AddStopScreen() {
  const params = useLocalSearchParams<{
    id: string;
    cep?: string;
    number?: string;
    label?: string;
    complement?: string;
  }>();
  const routeId = params.id;
  const lookupCep = useRoutesStore((s) => s.lookupCep);
  const addStop = useRoutesStore((s) => s.addStop);

  // Valores iniciais podem vir da leitura de etiqueta (scan.tsx)
  const [cep, setCep] = useState(normalizeCep(params.cep ?? ''));
  const [street, setStreet] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [number, setNumber] = useState(params.number ?? '');
  const [complement, setComplement] = useState(params.complement ?? '');
  const [label, setLabel] = useState(params.label ?? '');
  const fromScan = Boolean(params.cep);
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const lastLooked = useRef('');

  useEffect(() => {
    const digits = normalizeCep(cep);
    if (!isValidCep(digits) || digits === lastLooked.current) return;
    lastLooked.current = digits;
    setError(null);
    setLooking(true);
    lookupCep(digits)
      .then((a) => {
        setStreet(a.street);
        setNeighborhood(a.neighborhood);
        setCity(a.city);
        setState(a.state);
        numberRef.current?.focus();
      })
      .catch((e: unknown) => {
        if (e instanceof CepNotFoundError) {
          setError('CEP não encontrado. Você pode preencher o endereço manualmente.');
        } else {
          setError('Não foi possível consultar o CEP agora. Preencha manualmente ou tente de novo.');
        }
      })
      .finally(() => setLooking(false));
  }, [cep, lookupCep]);

  const canSave = isValidCep(cep) && city.trim().length > 0 && state.trim().length > 0 && !looking;

  const save = async () => {
    if (!routeId || !canSave) return;
    setSaving(true);
    try {
      await addStop({
        routeId,
        cep: normalizeCep(cep),
        street: street.trim(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
        state: state.trim().toUpperCase(),
        number: number.trim() || null,
        complement: complement.trim() || null,
        label: label.trim() || null,
        lat: null,
        lng: null,
        geocodeStatus: 'pending',
        geocodePrecision: null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Field label="CEP">
            <TextInput
              value={formatCep(cep)}
              onChangeText={(t) => setCep(normalizeCep(t))}
              keyboardType="number-pad"
              maxLength={9}
              autoFocus={!fromScan}
              placeholder="00000-000"
              style={styles.input}
            />
          </Field>
          {fromScan ? <Text style={styles.hint}>Dados lidos da etiqueta. Confira antes de salvar.</Text> : null}
          {looking ? <Text style={styles.hint}>Buscando endereço…</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Field label="Logradouro">
            <TextInput
              value={street}
              onChangeText={setStreet}
              placeholder="Rua / Avenida"
              style={styles.input}
            />
          </Field>
          <View style={styles.row}>
            <Field label="Número" style={{ flex: 1 }}>
              <TextInput
                ref={numberRef}
                value={number}
                onChangeText={setNumber}
                placeholder="123"
                keyboardType="number-pad"
                style={styles.input}
              />
            </Field>
            <Field label="Complemento" style={{ flex: 2 }}>
              <TextInput value={complement} onChangeText={setComplement} placeholder="Apto, bloco…" style={styles.input} />
            </Field>
          </View>
          <Field label="Bairro">
            <TextInput value={neighborhood} onChangeText={setNeighborhood} placeholder="Bairro" style={styles.input} />
          </Field>
          <View style={styles.row}>
            <Field label="Cidade" style={{ flex: 3 }}>
              <TextInput value={city} onChangeText={setCity} placeholder="Cidade" style={styles.input} />
            </Field>
            <Field label="UF" style={{ flex: 1 }}>
              <TextInput
                value={state}
                onChangeText={(t) => setState(t.toUpperCase())}
                placeholder="UF"
                maxLength={2}
                autoCapitalize="characters"
                style={styles.input}
              />
            </Field>
          </View>
          <Field label="Apelido (opcional)">
            <TextInput value={label} onChangeText={setLabel} placeholder="Ex.: Cliente João" style={styles.input} />
          </Field>
        </Card>

        <Button title="Salvar ponto" onPress={() => void save()} disabled={!canSave} loading={saving} />
        <Text style={styles.footnote}>
          A localização no mapa é obtida automaticamente após salvar. Se falhar, você pode tentar de novo na lista.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ gap: 4 }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  card: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  hint: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, fontSize: 13 },
  footnote: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
