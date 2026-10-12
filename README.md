# Note Visualizer Web

Visualizador de tono vocal y afinador en tiempo real de alta precisión construido con Web Audio API, algoritmo YIN y Canvas 2D a 60 FPS.

## Demo en vivo

Puedes probar la aplicación directamente en:
👉 [https://palaso-dev.github.io/Note-visualizer-web/](https://palaso-dev.github.io/Note-visualizer-web/)

---

## Características

- **Visualizador de Cascada (Waterfall / Pitch Roll):**
  - Mapeo 1:1 de carriles cromáticos con el teclado.
  - Trazo continuo de neón en tiempo real sin saltos parásitos.
  - Flujo configurable: saliendo del piano o hacia el piano.

- **Teclado Piano 2D Continuo:**
  - Desplazamiento suave con aceleración por GPU (`translate3d`) y cámara flotante con interpolación exponencial (`lerp`).
  - Cobertura de 7 octavas (C1 a C8).
  - Orientación dual: en la base (vertical) o lateral (estilo DAW Piano Roll).
  - Modos de nomenclatura: Latino (Do, Re, Mi) y Anglosajón (C, D, E).

- **Afinador de Precisión (Speedometer Gauge):**
  - Cuadrante circular de desviación en Cents (-50 a +50¢).
  - Aguja con inercia física analógica.
  - Lectura digital integrada y estado de afinación en tiempo real.

- **DSP & Detección:**
  - Algoritmo YIN con interpolación parabólica sub-sample.
  - Puerta de ruido (Noise Gate) calibrable con medidor VU en vivo.
  - Filtro pasa-banda vocal opcional.

- **Temas:**
  - Modo Oscuro (Studio Industrial).
  - Modo Claro (Titanium / Slate).
  - Modo Sistema (sigue automáticamente la preferencia del sistema operativo).
