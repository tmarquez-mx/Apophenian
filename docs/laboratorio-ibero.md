# MentorIA con el Laboratorio de IA IBERO

MentorIA puede revisar un apartado con los modelos del Laboratorio de IA IBERO, además de Ollama y LM Studio. El laboratorio ofrece una interfaz compatible con la de OpenAI (la misma forma de solicitud que usa LM Studio) y pide una llave. La consigna de MentorIA no cambia: el modelo señala y pregunta, y la escritura sigue siendo de quien investiga.

## Qué hace falta

| Requisito | Quién lo resuelve |
|---|---|
| Llave del laboratorio (empieza con `sk-saptiva-`) | Quien administra el laboratorio |
| Estar en la red IBERO o conectado a su VPN (red privada virtual): el nombre del servidor solo se resuelve dentro de esa red | Quien usa la app |
| Que el laboratorio acepte llamadas desde la dirección de la app (CORS) | Plataforma del laboratorio |
| Permitir el acceso a la red local en el navegador, una vez | Quien usa la app |

CORS (Cross-Origin Resource Sharing, intercambio de recursos entre orígenes) es la regla con la que un servidor le dice al navegador qué páginas pueden llamarlo. Al 29 de septiembre de 2026, el laboratorio responde 400 sin autorización a la dirección publicada de la app (`https://apophenian.netlify.app`), así que el navegador bloquea la llamada aunque la llave sea válida. La autorización es una configuración del laboratorio (su lista de orígenes permitidos); este repositorio no la controla.

El servidor del laboratorio tiene una dirección de red privada. Cuando una página publicada en internet lo llama, Chrome pide permiso para "conectarse a dispositivos de tu red local". Hay que responder **Permitir**. Si se bloqueó por error, se cambia en Configuración de Chrome, Privacidad y seguridad, Configuración de sitios, Acceso a la red local.

**Abierta como archivo.** Si la app se descarga y se abre con doble clic (`file://`), el navegador no le asigna un origen web y el laboratorio no puede autorizarla. Con el laboratorio hay que usar la dirección publicada. Ollama y LM Studio siguen funcionando igual desde el archivo.

## Configuración en la app

En **Configuración, MentorIA mayéutica**:

1. En **Motor**, elige **Laboratorio de IA IBERO**.
2. **Dirección del laboratorio**: viene llena con `https://api.laboratorioia.ibero.mx/infernode/v1`. La app solo admite ese servidor para este motor; cualquier otra dirección se rechaza, para que ni la llave ni el borrador lleguen a otro lado.
3. **Llave del laboratorio**: pégala y sal del campo. El campo se vacía y muestra "Llave guardada en este navegador".
4. **Razonamiento**: déjalo en **Apagado (recomendado)** salvo que quieras probar otra cosa (ver abajo).
5. **Modelo**: viene con **Saptiva Omni**. La lista ofrece los tres modelos del laboratorio.
6. Pulsa **Probar conexión**. Si todo está en orden, dice "Conectado. La llave es válida".

Con Ollama o LM Studio todo sigue como antes: solo se admiten direcciones de la propia computadora.

## Qué viaja y dónde queda la llave

- **El borrador.** Con este motor, el texto del apartado que se revisa viaja al servidor del laboratorio para cada revisión, junto con la base de conocimiento del proyecto si está activada ("Darle como contexto la base de conocimiento del proyecto"). No va a ningún otro servidor. La app lo dice en Configuración, en la nota de cada revisión, en el registro de uso de IA y en la declaración de uso de IA del documento de Word.
- **La llave.** Se guarda en el almacenamiento local de este navegador, aparte del proyecto. No entra en el archivo del proyecto, así que no viaja en exportaciones, en la copia de seguridad automática ni en la copia compartida con la supervisión.
- **Riesgos de la llave.** Queda sin cifrar en el perfil del navegador: quien use ese navegador, o un programa que lea su perfil, podría obtenerla. En un equipo compartido, pulsa **Olvidar llave** al terminar. Si una llave se expone, pide que la revoquen.

## Modelos

Cifras de una revisión con un borrador ficticio de 217 palabras, razonamiento apagado, el 29 de septiembre de 2026 (prueba de humo, sección "Pruebas").

| Modelo en la app | Modelo que responde | Tiempo | Tokens de salida |
|---|---|---|---|
| Saptiva Omni | Nemotron 3 Nano Omni 30B A3B (FP8) | 2.9 s | 565 |
| Saptiva Turbo | Qwen3.6 35B A3B (FP8) | 11.7 s | 854 |
| Saptiva Cortex | Qwen3.8 27B (FP8) | sin medir | sin medir |

Los dos modelos medidos devolvieron las cuatro secciones de la revisión (Fortalezas, Debilidades, Sugerencias y Preguntas). Omni es el más rápido y es el predeterminado.

## Razonamiento

Estos modelos pueden "pensar" antes de responder. Ese razonamiento llega aparte del texto y consume el mismo límite de tokens que la respuesta: sin control, un modelo puede gastar todo el límite pensando y terminar sin revisión.

- **Apagado** (predeterminado): la app pide `chat_template_kwargs: {"enable_thinking": false}`.
- **Con presupuesto** (512, 1024 o 2048 tokens): la app pide `enable_thinking: true` y `thinking_token_budget` con ese número, y suma el presupuesto al límite de la respuesta (2048 tokens). Con 1024 tokens, Turbo tardó 12.3 s y usó 1,632 tokens de salida.

El razonamiento nunca se muestra ni se guarda en el registro: se descarta el campo `reasoning` y cualquier bloque `<think>...</think>` dentro del texto.

## Cuándo una revisión cuenta

Solo se acepta una revisión que el modelo terminó (`finish_reason` igual a `stop`). Si se cortó por el límite de tokens (`length`), por un filtro de contenido (`content_filter`) o llegó incompleta, la app lo dice y no muestra texto parcial, porque media revisión se leería como una revisión entera. En esos casos ofrece la revisión simulada con reglas locales, como ya hacía con los modelos locales.

## Mensajes de error

| Situación | Qué dice la app |
|---|---|
| Llave inválida o revocada (401) | El laboratorio rechazó la llave; revisar que esté completa y vigente |
| Sin saldo o cuota (402) | La llave no tiene saldo o cuota disponible |
| Modelo que no existe (404) | El laboratorio no tiene ese modelo; usar Saptiva Turbo, Omni o Cortex |
| Demasiadas solicitudes (429) | Esperar los segundos que indica el laboratorio |
| El modelo tardó más de 60 s (504) | Probar con Omni, un apartado más corto o sin base de conocimiento |
| Laboratorio no disponible (502 o 503) | Suele ser pasajero; volver a intentar en unos minutos |
| CORS, red o permiso de red local | Las tres causas posibles, con la dirección de la página |
| Sin respuesta del laboratorio en 90 s | Revisar la conexión a la red IBERO y volver a intentar |

En el navegador, un rechazo por CORS, una red sin acceso y un permiso de red local denegado producen el mismo error, así que la app nombra las tres causas en ese orden.

## Límites

- El laboratorio corta a los 60 s una respuesta sin transmisión por partes. Con los tiempos medidos (3-12 s) hay margen, pero un apartado muy largo con la base de conocimiento activada y Turbo puede acercarse.
- Los nombres de la lista de modelos son los alias del laboratorio. El registro de uso de IA anota el alias elegido (por ejemplo, Saptiva Omni), no el nombre técnico del modelo que respondió.
- La dirección permitida está escrita en el código (`ORIGENES_PERMITIDOS` en `src/mentoria/laboratorio.js`). Si el laboratorio cambia de dominio, hay que cambiarla ahí.

## Cómo se integra en la app

El código de la app vive fuera de este repositorio, en un solo archivo HTML publicado (regla 5 del proyecto: se descarga, se abre y funciona). Por eso la integración viene en dos piezas:

- `src/mentoria/laboratorio.js`: la lógica del laboratorio (dirección permitida, solicitud, razonamiento, `finish_reason`, errores). Es un script clásico para que funcione dentro del archivo único.
- `src/mentoria/apophenian-html.patch`: el cambio al HTML. Pega una copia de `laboratorio.js` junto a `esEndpointLocal()` y agrega la opción en Configuración, la llave, el razonamiento y los textos de transparencia.

El parche se generó sobre la versión 0.9.2 publicada el 29 de septiembre de 2026 (SHA-256 `eaf3fac46c776baae4231319331d0c043d3bd29fc7ade389c8efbd0a9fe76a9c`). Para aplicarlo:

```bash
curl -sSo apophenian.html https://apophenian.netlify.app/apophenian
sha256sum apophenian.html        # debe coincidir con el de arriba
patch --dry-run apophenian.html < src/mentoria/apophenian-html.patch
patch apophenian.html < src/mentoria/apophenian-html.patch
```

Si la copia de trabajo es posterior a la publicada, `--dry-run` dice qué partes no encajan. La copia de `laboratorio.js` dentro del HTML debe quedar idéntica al archivo del repositorio; `test/integracion.test.js` lo comprueba sobre el parche.

## Pruebas

Requieren Node 18 o posterior y ninguna dependencia.

```bash
node --test
```

Corre 27 pruebas sin red: `fetch` se simula y los borradores son ficticios. Cubren el formato de la solicitud, la respuesta normal, `finish_reason` distinto de `stop`, el razonamiento fuera del texto, los códigos de error HTTP (el protocolo de la web), la red y el tiempo de espera, y que la copia del módulo en el parche sea idéntica.

Prueba de humo contra el laboratorio real, desde la red IBERO o su VPN:

```bash
set -a; . ~/.config/laboratorio.env; set +a    # archivo con LABORATORIO_LLAVE=sk-saptiva-...
LABORATORIO_MODELO="Saptiva Turbo" node scripts/smoke-laboratorio.js
```

Cargar la llave desde un archivo evita que quede en el historial de la terminal.

Usa la misma lógica y los mismos mensajes que la app, con un borrador ficticio. Imprime el estado, el modelo que respondió, el tiempo, la longitud, los tokens y las secciones encontradas; no imprime la llave ni el texto de la revisión. Variables opcionales: `LABORATORIO_BASE`, `LABORATORIO_RAZONAMIENTO` (presupuesto en tokens; 0 es apagado). También lee `INFERNODE_API_KEY` si `LABORATORIO_LLAVE` no está definida.

Node no aplica CORS: la prueba de humo verifica el protocolo (llave, formato, razonamiento, errores) y no que el navegador pueda llamar al laboratorio desde la dirección de la app.
