# Semáforo de la luz (propio)

Semáforo de precios de la luz (**PVPC**) **propio**, sin marca ni enlace a
Selectra. Muestra de un vistazo si la hora actual es barata o cara, el detalle
hora a hora, las horas más baratas/caras y una recomendación de uso. Es el
"gancho" visual para que los clientes entren a la app y se mantengan informados.

Sustituye al enlace externo `https://selectra.es/energia/semaforo-selectra`:
ahora los datos son nuestros y la marca también.

## Qué contiene

| Archivo | Para qué |
|---|---|
| `SemaforoEnergetico.html` | Widget autónomo (un solo archivo). Se abre en el navegador o se incrusta en un `WebView`. Ideal para probar el visual o publicarlo como web. |
| `SemaforoEnergetico.js` | Componente **React Native** listo para integrar en la app `HotelCalculator`. Sin dependencias externas. |

## Fuente de datos

Precio regulado **PVPC** de **Red Eléctrica de España (ESIOS)**, consumido a
través de la API pública y gratuita de `preciodelaluz.org` (sin token):

```
https://api.preciodelaluz.org/v1/prices/all?zone=PCB
```

- `PCB` → Península, Baleares y Canarias.
- `CYM` → Ceuta y Melilla.

La API devuelve un objeto con claves por franja horaria (`"00-01"`, `"01-02"`…)
y el precio en **€/MWh**; el widget lo convierte a **€/kWh**. Si la API no está
accesible (sin conexión), se muestra un dataset de ejemplo claramente marcado
como tal, para que el visual nunca aparezca vacío.

### Clasificación del semáforo

Cada hora se clasifica respecto a la distribución de precios del propio día:

| Nivel | Umbral | Color |
|---|---|---|
| ✅ Muy barato | ≤ percentil 25 | verde profundo |
| 🟢 Barato | ≤ mediana | verde |
| 🟡 Normal | < percentil 85 | ámbar |
| 🔴 Caro | ≥ percentil 85 | rojo |

## Integración en la app React Native

```jsx
import SemaforoEnergetico from './SemaforoEnergetico/SemaforoEnergetico';

// En una pantalla:
<SemaforoEnergetico />

// Opciones:
<SemaforoEnergetico zone="PCB" dark={false} onError={(e) => console.warn(e)} />
```

Props (todas opcionales):

- `zone`: `'PCB'` (por defecto) o `'CYM'`.
- `dark`: fuerza tema oscuro; por defecto sigue el `useColorScheme()` del sistema.
- `onError(err)`: callback si falla la carga en directo.

### Alternativa vía WebView

Si prefieres reutilizar el widget HTML dentro de la app en lugar del componente
nativo, empaqueta `SemaforoEnergetico.html` y cárgalo con
`react-native-webview`:

```jsx
import { WebView } from 'react-native-webview';
<WebView source={require('./SemaforoEnergetico/SemaforoEnergetico.html')} />
```

## Notas

- Sin marca Selectra ni enlaces externos: los datos vienen directamente de la
  fuente oficial (REE/ESIOS).
- Temas claro y oscuro incluidos en ambas versiones.
- Los precios PVPC del día siguiente se publican sobre las 20:15; el widget
  refleja siempre el día en curso.
