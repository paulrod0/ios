// Vercel Serverless Function — Aviso diario del Semáforo de la luz por email.
//
// Lo dispara Vercel Cron (ver vercel.json). Consulta el PVPC oficial de REE
// (apidatos.ree.es, sin token) y envía un correo con el estado del mercado y
// el precio medio en €/kWh usando Resend.
//
// Variables de entorno necesarias (Project Settings → Environment Variables):
//   RESEND_API_KEY  Token de Resend (https://resend.com/api-keys)
//   EMAIL_TO        Destinatario, p.ej. pablo.lprdz@gmail.com
//   EMAIL_FROM      Remitente. Para pruebas: "Semáforo de la luz <onboarding@resend.dev>"
//   CRON_SECRET     (recomendado) Vercel lo envía como Bearer para autorizar el cron
//   REF_AVG_EUR_MWH (opcional) Referencia para el color del día. Por defecto 130.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const LEVELS = {
  muybarato: { emoji: '✅', label: 'Muy barato', color: '#12805C' },
  barato:    { emoji: '🟢', label: 'Barato',     color: '#2FA84F' },
  normal:    { emoji: '🟡', label: 'Normal',     color: '#E0A11B' },
  caro:      { emoji: '🔴', label: 'Caro',       color: '#D64541' },
};
const DAY = {
  muybarato: { emoji: '✅', title: 'Día anormalmente barato',
    reco: 'Día excelente para consumir: lavadora, lavavajillas, horno o cargar el coche.' },
  barato: { emoji: '🟢', title: 'Día relativamente barato',
    reco: 'Buen día para gastos altos de energía; concéntralos en las horas verdes.' },
  normal: { emoji: '🟡', title: 'Día medio',
    reco: 'Precio en la media. Programa el consumo en las horas más baratas de hoy.' },
  caro: { emoji: '🔴', title: 'Día anormalmente caro, ¡cuidado!',
    reco: 'Hoy la luz está cara. Si puedes, espera; y si no, usa solo las horas más baratas.' },
};

const pad = (n) => (n < 10 ? '0' : '') + n;
const fmt = (mwh) => (mwh / 1000).toFixed(3).replace('.', ',');

function classify(price, sorted) {
  const n = sorted.length;
  const q = (p) => sorted[Math.min(n - 1, Math.floor(p * n))];
  const p25 = q(0.25), p50 = q(0.5), p85 = q(0.85);
  if (price <= p25) return 'muybarato';
  if (price <= p50) return 'barato';
  if (price < p85) return 'normal';
  return 'caro';
}
function dayLevel(avg, ref) {
  const r = avg / ref;
  if (r < 0.6) return 'muybarato';
  if (r < 0.9) return 'barato';
  if (r <= 1.15) return 'normal';
  return 'caro';
}
function topHours(prices, asc, k) {
  return prices.map((p, i) => i)
    .sort((a, b) => (asc ? prices[a] - prices[b] : prices[b] - prices[a]))
    .slice(0, k).sort((a, b) => a - b);
}

// Fecha de hoy en zona horaria de Madrid (YYYY-MM-DD)
function madridToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return parts; // en-CA -> "2026-07-09"
}

async function fetchPVPC() {
  const day = madridToday();
  const url = 'https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real'
    + `?start_date=${day}T00:00&end_date=${day}T23:59&time_trunc=hour`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('REE ' + r.status);
  const json = await r.json();
  const included = json.included || [];
  const pvpc = included.find((x) => (x.attributes && /pvpc/i.test(x.attributes.title || x.type)))
    || included.find((x) => /pvpc/i.test(x.type || ''));
  if (!pvpc || !pvpc.attributes || !Array.isArray(pvpc.attributes.values)) {
    throw new Error('PVPC no encontrado en la respuesta de REE');
  }
  const byHour = new Array(24).fill(null);
  pvpc.attributes.values.forEach((v) => {
    // REE devuelve datetime en hora local de Madrid con offset (p.ej.
    // "2026-07-09T00:00:00.000+02:00"). Tomamos la hora directamente del
    // string para no depender de la zona horaria del servidor (UTC en Vercel).
    const m = /T(\d{2}):/.exec(v.datetime || '');
    if (m && typeof v.value === 'number') byHour[parseInt(m[1], 10)] = v.value; // €/MWh
  });
  // Rellena huecos con el valor anterior por robustez
  for (let i = 0; i < 24; i++) if (byHour[i] == null) byHour[i] = byHour[i - 1] ?? byHour.find((x) => x != null);
  if (byHour.some((v) => v == null)) throw new Error('Serie horaria incompleta');
  return { prices: byHour, day };
}

function buildEmail(prices, day) {
  const ref = Number(process.env.REF_AVG_EUR_MWH) || 130;
  const sorted = prices.slice().sort((a, b) => a - b);
  const min = sorted[0], max = sorted[sorted.length - 1];
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const cheapHour = prices.indexOf(min), expHour = prices.indexOf(max);
  const cheap3 = topHours(prices, true, 3), exp3 = topHours(prices, false, 3);
  const d = DAY[dayLevel(avg, ref)];
  const dColor = LEVELS[dayLevel(avg, ref)].color;

  const [y, m, dd] = day.split('-').map(Number);
  const fecha = `${dd} de ${MONTHS[m - 1]}`;

  const rows = prices.map((p, i) => {
    const c = LEVELS[classify(p, sorted)];
    return `<tr>
      <td style="padding:4px 10px;font-variant-numeric:tabular-nums;color:#5A6B60">${pad(i)}:00</td>
      <td style="padding:4px 10px"><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c.color};margin-right:6px"></span>${c.label}</td>
      <td style="padding:4px 10px;text-align:right;font-variant-numeric:tabular-nums;font-weight:600">${fmt(p)} €/kWh</td>
    </tr>`;
  }).join('');

  const subject = `${d.emoji} Luz hoy (${fecha}): ${d.title} · media ${fmt(avg)} €/kWh`;

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16201B">
    <h2 style="margin:0 0 4px">Semáforo de la luz · ${fecha}</h2>
    <div style="background:${dColor};color:#fff;border-radius:14px;padding:16px 18px;margin:12px 0">
      <div style="font-size:20px;font-weight:800">${d.emoji} ${d.title}</div>
      <div style="margin-top:6px;font-size:14px;opacity:.95">${d.reco}</div>
      <div style="margin-top:10px;font-size:13px;font-weight:700;background:rgba(255,255,255,.2);display:inline-block;padding:5px 11px;border-radius:999px">Media del día: ${fmt(avg)} €/kWh</div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 16px">
      <tr>
        <td style="padding:10px;background:#F0F4F0;border-radius:10px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5A6B60;font-weight:700">Horas más baratas</div>
          <div style="font-size:15px;font-weight:750;color:#12805C;margin-top:4px">${cheap3.map((i) => pad(i) + ':00').join(' · ')}</div>
          <div style="font-size:12px;color:#5A6B60;margin-top:2px">mín ${fmt(min)} €/kWh (${pad(cheapHour)}:00)</div>
        </td>
        <td style="width:10px"></td>
        <td style="padding:10px;background:#F0F4F0;border-radius:10px">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5A6B60;font-weight:700">Horas a evitar</div>
          <div style="font-size:15px;font-weight:750;color:#D64541;margin-top:4px">${exp3.map((i) => pad(i) + ':00').join(' · ')}</div>
          <div style="font-size:12px;color:#5A6B60;margin-top:2px">máx ${fmt(max)} €/kWh (${pad(expHour)}:00)</div>
        </td>
      </tr>
    </table>
    <details>
      <summary style="cursor:pointer;font-weight:650;margin-bottom:8px">Ver precio hora a hora</summary>
      <table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
    </details>
    <p style="font-size:12px;color:#93A69A;margin-top:18px">Datos: Red Eléctrica de España (ESIOS/REE) · PVPC. Ver el semáforo en vivo:
      <a href="https://semaforo-luz.vercel.app" style="color:#0E7C7B">semaforo-luz.vercel.app</a></p>
  </div>`;

  const text = `Semáforo de la luz · ${fecha}\n${d.title} — media ${fmt(avg)} €/kWh\n`
    + `Más baratas: ${cheap3.map((i) => pad(i) + ':00').join(', ')} (mín ${fmt(min)} €/kWh)\n`
    + `A evitar: ${exp3.map((i) => pad(i) + ':00').join(', ')} (máx ${fmt(max)} €/kWh)\n`
    + `https://semaforo-luz.vercel.app`;

  return { subject, html, text };
}

export default async function handler(req, res) {
  // Autorización del cron (Vercel envía Authorization: Bearer $CRON_SECRET)
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers['authorization'] || '';
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });
  }

  const to = process.env.EMAIL_TO;
  const from = process.env.EMAIL_FROM || 'Semáforo de la luz <onboarding@resend.dev>';
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return res.status(500).json({ error: 'Faltan RESEND_API_KEY o EMAIL_TO' });

  try {
    const { prices, day } = await fetchPVPC();
    const { subject, html, text } = buildEmail(prices, day);

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'Resend', detail: body });
    return res.status(200).json({ ok: true, sent: body.id || null, day, avgLevel: subject });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message || e) });
  }
}
