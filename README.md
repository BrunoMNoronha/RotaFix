# RotaFix

App Android (React Native + Expo) para cadastrar CEPs e gerar a ordem de visita que
reduz o percurso. Local-first: tudo fica em SQLite no aparelho, sem login.

## Como funciona

1. Crie uma rota e adicione CEPs. O endereço vem do ViaCEP (fallback BrasilAPI).
2. Ao salvar, o app resolve latitude/longitude via Nominatim (OpenStreetMap); se houver
   `EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY`, usa Google como fallback.
3. Toque em **Otimizar**: a partir do GPS atual (ou de um ponto inicial fixo, via toque longo
   em um ponto), o app roda Nearest Neighbor + 2-opt e numera os pontos.
4. Veja no **Mapa** (traçado por ruas via OSRM) e **Navegue** no Google Maps ou Waze.
5. Em **Ajustes**, exporte/importe um backup JSON.

## Rodando

```bash
npm install
cp .env.example .env   # preencha GOOGLE_MAPS_ANDROID_API_KEY para o mapa
npx expo run:android   # build nativo (react-native-maps não funciona no Expo Go)
```

Ou pelo EAS: `npx eas-cli@latest build --profile development --platform android`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm test` | testes unitários (otimizador, utilitários, serviço de CEP com rede mockada) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | `expo lint` |

## Estrutura

```
app/                    rotas (expo-router)
  routes/index.tsx      lista de rotas
  routes/[id]/index.tsx pontos + otimizar + mapa + navegar
  routes/[id]/add.tsx   formulário de CEP
  settings.tsx          backup
src/
  db/                   migrações SQL, repositório tipado (expo-sqlite)
  services/             cep, geocode, optimizer, directions (OSRM), navigation, location, http
  store/                Zustand
  components/           StopCard, RouteMap, ui
  utils/                haversine, cep, polyline, uuid
```

## Limites conhecidos

- Google Maps aceita até 9 waypoints + destino por link; rotas maiores abrem em partes.
- Nominatim exige 1 req/s (já limitado no código) e nem sempre acha o número exato.
- Otimização usa distância em linha reta; boa para ≤ 50 pontos urbanos.
