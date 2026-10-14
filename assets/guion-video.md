# Guion del vídeo (Session Vitals)

Duración objetivo: 45 a 60 s, sin voz (texto en pantalla) o con voz en off breve. Terminal a pantalla completa, fuente grande.

Capturas de referencia: `bar.png` (aspecto actual de las tres líneas) y `detail-skills.png` (panel al pulsar `skills`).

## Antes de grabar

- Sesión limpia con algo de historial real para que el desglose tenga varias categorías con color.
- Desactivar o ignorar otras líneas bajo el prompt (en la captura aparecen `lean-ctx` y `auto mode`, que no son del mod).
- En `detail-skills.png` se ven la barra de tareas y el botón de Flameshot abajo, y la conversación está pixelada: recortar o regrabar sin eso.
- Cuidado con datos personales en el panel (rutas, nombres de skills propias).

## Escenas

1. **Las tres líneas (0:00 a 0:10).** Plano de `bar.png`. Texto: "Tu sesión de Claude Code de un vistazo". Señalar: directorio, rama, modelo, límites `5h` y `7d` con su hora de reinicio.
2. **Barra de contexto (0:10 a 0:20).** Zoom a la línea 2: barra por colores, `5%`, `50.5k/1.0M`, umbral de auto-compact, cache read/write y la cuenta atrás `TTL`. Texto: "Contexto por categoría, como `/context`".
3. **Leyenda (0:20 a 0:27).** Zoom a la línea 3: system prompt, system tools, MCP, custom agents, memory files, skills, messages, cada una con sus tokens y el color de la barra.
4. **Clic en una categoría (0:27 a 0:42).** Pulsar `skills 6.7k`. Se abre el panel de la derecha (`detail-skills.png`): "37 of 37 skills listed, 6.7k tokens", ordenadas por coste, con su origen (built-in, plugin, userSettings). Texto: "Haz clic y mira qué se envía en cada categoría". Repetir rápido con `system tools` o `memory files`.
5. **`/cache-ttl` (0:42 a 0:52).** Escribir `/cache-ttl 5m`, ver cómo cambia la cuenta atrás; luego `/cache-ttl 1h`. Texto: "Cambia el TTL de la caché a mitad de sesión".
6. **Cierre (0:52 a 0:58).** Texto: "Session Vitals: `claude plugin install session-vitals@iegui-ops`" y requisito "Claude Code 2.1.287+".

## Después de grabar

Subir el vídeo arrastrándolo al editor web del README en GitHub, copiar la URL `user-attachments` y sustituir la del vídeo actual en `README.md`.
