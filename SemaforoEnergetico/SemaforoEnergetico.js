/**
 * SemaforoEnergetico — Semáforo de la luz (PVPC) propio, sin marca Selectra.
 *
 * Componente React Native autónomo (sin dependencias externas). Consulta el
 * precio regulado de la luz hora a hora desde la API pública de REE/ESIOS
 * (vía preciodelaluz.org) y lo clasifica en un semáforo de 4 niveles:
 * muy barato / barato / normal / caro.
 *
 * Uso:
 *   import SemaforoEnergetico from './SemaforoEnergetico';
 *   ...
 *   <SemaforoEnergetico />
 *
 * Props (todas opcionales):
 *   zone   'PCB' (Península/Baleares/Canarias, por defecto) | 'CYM' (Ceuta y Melilla)
 *   dark   fuerza el tema oscuro (por defecto sigue useColorScheme())
 *   onError(err)  callback si falla la carga en directo
 */

import React from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';

const API_BASE = 'https://api.preciodelaluz.org/v1/prices/all?zone=';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Dataset de respaldo (€/MWh) para cuando no hay conexión.
const SAMPLE = [92, 85, 80, 78, 79, 84, 95, 110, 125, 118, 100, 88,
                72, 65, 62, 68, 82, 105, 130, 155, 172, 168, 140, 108];

const LEVELS = {
  muybarato: { key: 'muybarato', emoji: '✅', label: 'Muy barato',
    reco: 'Momento ideal para poner lavadora, lavavajillas o cargar el coche.' },
  barato: { key: 'barato', emoji: '🟢', label: 'Barato',
    reco: 'Buen momento para gastos altos de energía.' },
  normal: { key: 'normal', emoji: '🟡', label: 'Normal',
    reco: 'Precio en la media del día. Sin prisa ni urgencia.' },
  caro: { key: 'caro', emoji: '🔴', label: 'Caro',
    reco: 'Mejor evita ahora los electrodomésticos de alto consumo.' },
};

const pad = (n) => (n < 10 ? '0' : '') + n;
const fmtPrice = (mwh) => (mwh / 1000).toFixed(3).replace('.', ',');

function classify(price, sorted) {
  const n = sorted.length;
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const p25 = q(0.25), p50 = q(0.5), p85 = q(0.85);
  if (price <= p25) return 'muybarato';
  if (price <= p50) return 'barato';
  if (price < p85) return 'normal';
  return 'caro';
}

function parseApi(json) {
  const out = new Array(24).fill(null);
  let dateLabel = null;
  Object.keys(json).forEach((k) => {
    const m = /^(\d{2})-(\d{2})$/.exec(k);
    if (!m) return;
    const idx = parseInt(m[1], 10);
    const row = json[k];
    if (row && typeof row.price === 'number') {
      out[idx] = row.price; // €/MWh
      if (!dateLabel && row.date) dateLabel = row.date;
    }
  });
  if (out.some((v) => v === null)) return null;
  return { prices: out, dateLabel };
}

export default function SemaforoEnergetico({ zone = 'PCB', dark, onError }) {
  const scheme = useColorScheme();
  const isDark = dark != null ? dark : scheme === 'dark';
  const C = isDark ? DARK : LIGHT;

  const [state, setState] = React.useState({ loading: true, prices: null, isLive: false, dateLabel: null });

  const load = React.useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = setTimeout(() => ctrl && ctrl.abort(), 7000);

    fetch(API_BASE + zone, ctrl ? { signal: ctrl.signal } : undefined)
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then((json) => {
        clearTimeout(timer);
        const parsed = parseApi(json);
        if (!parsed) throw new Error('shape');
        setState({ loading: false, prices: parsed.prices, isLive: true, dateLabel: parsed.dateLabel });
      })
      .catch((err) => {
        clearTimeout(timer);
        if (onError) onError(err);
        setState({ loading: false, prices: SAMPLE, isLive: false, dateLabel: null });
      });
  }, [zone, onError]);

  React.useEffect(() => { load(); }, [load]);

  if (state.loading && !state.prices) {
    return (
      <View style={[styles.center, { backgroundColor: C.bg }]}>
        <ActivityIndicator color={C.accent} />
        <Text style={[styles.loadingText, { color: C.inkSoft }]}>Cargando el precio de la luz…</Text>
      </View>
    );
  }

  const prices = state.prices;
  const sorted = prices.slice().sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const cheapHour = prices.indexOf(min);
  const expHour = prices.indexOf(max);

  const now = new Date();
  const h = now.getHours();
  const lvl = LEVELS[classify(prices[h], sorted)];
  const lvlColor = C[lvl.key];

  const today = state.dateLabel || `${now.getDate()} de ${MONTHS[now.getMonth()]}`;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.wrap}>
      {/* Cabecera */}
      <View style={styles.top}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.h1, { color: C.ink }]}>Semáforo de la luz</Text>
          <Text style={[styles.sub, { color: C.inkSoft }]}>
            Precio regulado PVPC · {zone === 'CYM' ? 'Ceuta y Melilla' : 'Península, Baleares y Canarias'}
          </Text>
        </View>
        <Text style={[styles.today, { color: C.inkSoft }]}>{today.toUpperCase()}</Text>
      </View>

      {/* Hero: hora actual */}
      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.line }]}>
        <View style={styles.heroRow}>
          <View style={[styles.ring, { borderColor: lvlColor, backgroundColor: C.card2 }]}>
            <Text style={styles.ringEmoji}>{lvl.emoji}</Text>
            <Text style={[styles.ringState, { color: lvlColor }]}>{lvl.label.toUpperCase()}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={[styles.nowLabel, { color: C.inkSoft }]}>
              Precio de {pad(h)}:00 a {pad((h + 1) % 24)}:00
            </Text>
            <View style={styles.priceRow}>
              <Text style={[styles.priceBig, { color: C.ink }]}>{fmtPrice(prices[h])}</Text>
              <Text style={[styles.priceUnit, { color: C.inkSoft }]}>€/kWh</Text>
            </View>
            <Text style={[styles.reco, { color: C.ink }]}>
              <Text style={styles.recoBold}>{lvl.label}. </Text>{lvl.reco}
            </Text>
          </View>
        </View>
      </View>

      {/* Barras hora a hora */}
      <View style={[styles.card, { backgroundColor: C.card, borderColor: C.line }]}>
        <View style={styles.panelHead}>
          <Text style={[styles.panelTitle, { color: C.ink }]}>Hora a hora</Text>
          <Text style={[styles.panelHint, { color: C.inkSoft }]}>media {fmtPrice(avg)} €/kWh</Text>
        </View>
        <View style={styles.barsRow}>
          {prices.map((p, i) => {
            const key = classify(p, sorted);
            const hPct = 8 + ((p - min) / (max - min || 1)) * 92;
            const isNow = i === h;
            return (
              <View key={i} style={styles.barCol}>
                <View style={styles.barTrack}>
                  <View
                    style={{
                      height: `${hPct}%`,
                      backgroundColor: C[key],
                      borderRadius: 3,
                      borderTopLeftRadius: 4,
                      borderTopRightRadius: 4,
                      borderWidth: isNow ? 1.5 : 0,
                      borderColor: C.ink,
                    }}
                  />
                </View>
                <Text style={[styles.axisLabel, { color: isNow ? C.ink : C.inkSoft, fontWeight: isNow ? '800' : '600' }]}>
                  {i % 3 === 0 || isNow ? pad(i) : ''}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Tiles */}
      <View style={styles.tiles}>
        <Tile C={C} edge={C.muybarato} k="Más barata" v={fmtPrice(min)}
          m={`${pad(cheapHour)}:00–${pad((cheapHour + 1) % 24)}:00`} />
        <Tile C={C} edge={C.accent} k="Media" v={fmtPrice(avg)} m="€/kWh" />
        <Tile C={C} edge={C.caro} k="Más cara" v={fmtPrice(max)}
          m={`${pad(expHour)}:00–${pad((expHour + 1) % 24)}:00`} />
      </View>

      {/* Leyenda */}
      <View style={styles.legend}>
        <LegendItem C={C} color={C.muybarato} label="Muy barato" />
        <LegendItem C={C} color={C.barato} label="Barato" />
        <LegendItem C={C} color={C.normal} label="Normal" />
        <LegendItem C={C} color={C.caro} label="Caro" />
      </View>

      {/* Fuente */}
      <View style={styles.srcRow}>
        <View style={styles.srcBadge}>
          <View style={[styles.liveDot, { backgroundColor: state.isLive ? C.barato : C.normal }]} />
          <Text style={[styles.srcText, { color: C.inkSoft }]}>
            {state.isLive
              ? 'Datos en directo: Red Eléctrica de España (ESIOS) · PVPC'
              : 'Datos de ejemplo (sin conexión) · Fuente real: REE / ESIOS'}
          </Text>
        </View>
        <TouchableOpacity onPress={load} style={[styles.refresh, { borderColor: C.line, backgroundColor: C.card2 }]}>
          <Text style={[styles.refreshText, { color: C.ink }]}>
            {state.loading ? 'Actualizando…' : 'Actualizar'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function Tile({ C, edge, k, v, m }) {
  return (
    <View style={[styles.tile, { backgroundColor: C.card, borderColor: C.line, borderLeftColor: edge }]}>
      <Text style={[styles.tileK, { color: C.inkSoft }]}>{k.toUpperCase()}</Text>
      <Text style={[styles.tileV, { color: C.ink }]}>{v}</Text>
      <Text style={[styles.tileM, { color: C.inkSoft }]}>{m}</Text>
    </View>
  );
}

function LegendItem({ C, color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSw, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: C.inkSoft }]}>{label}</Text>
    </View>
  );
}

const LIGHT = {
  bg: '#F5F8F5', card: '#FFFFFF', card2: '#F0F4F0', ink: '#16201B',
  inkSoft: '#5A6B60', line: '#E2E9E2', accent: '#0E7C7B',
  barato: '#2FA84F', muybarato: '#12805C', normal: '#E0A11B', caro: '#D64541',
};
const DARK = {
  bg: '#10161A', card: '#172026', card2: '#1E282E', ink: '#EAF1EC',
  inkSoft: '#93A69A', line: '#263139', accent: '#2BB6B0',
  barato: '#3BC062', muybarato: '#1E9C72', normal: '#F0B429', caro: '#E85D58',
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingText: { marginTop: 12, fontSize: 14 },
  wrap: { padding: 18, gap: 16 },

  top: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  h1: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  sub: { fontSize: 13, fontWeight: '500', marginTop: 3 },
  today: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textAlign: 'right', maxWidth: 120 },

  card: { borderWidth: 1, borderRadius: 18, padding: 20, marginTop: 4 },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ring: { width: 108, height: 108, borderRadius: 54, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  ringEmoji: { fontSize: 30 },
  ringState: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 3 },
  heroInfo: { flex: 1, gap: 5 },
  nowLabel: { fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7 },
  priceBig: { fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  priceUnit: { fontSize: 15, fontWeight: '600', marginBottom: 6 },
  reco: { fontSize: 14, lineHeight: 20, fontWeight: '500', marginTop: 2 },
  recoBold: { fontWeight: '700' },

  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  panelHint: { fontSize: 12, fontWeight: '600' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 150, marginTop: 14 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barTrack: { flex: 1, width: '62%', justifyContent: 'flex-end' },
  axisLabel: { fontSize: 8.5, marginTop: 6, height: 12 },

  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, padding: 13, gap: 4 },
  tileK: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 },
  tileV: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  tileM: { fontSize: 11.5, fontWeight: '600' },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  legendSw: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 12.5, fontWeight: '600' },

  srcRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', paddingTop: 4 },
  srcBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  srcText: { fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  refresh: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
  refreshText: { fontSize: 12, fontWeight: '600' },
});
