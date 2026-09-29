/* =====================================================
   MentorIA con el Laboratorio de IA IBERO (InferNode)
   El laboratorio es el servidor institucional de modelos de la IBERO:
   una interfaz compatible con OpenAI en
   https://api.laboratorioia.ibero.mx/infernode/v1 que pide una llave
   (Authorization: Bearer sk-saptiva-...). Es la única dirección fuera
   de esta computadora que MentorIA admite, y solo si quien escribe lo
   elige en Configuración: A-02 sigue valiendo para Ollama y LM Studio.

   Este bloque es un script clásico, no un módulo ES, por la regla 5
   (el archivo abre desde file://). En la app vive pegado junto a
   esEndpointLocal(); en el repositorio vive en
   src/mentoria/laboratorio.js para que `node --test` lo pruebe sin
   navegador. Las dos copias deben ser idénticas.

   Reglas que aplica, aprendidas con el gateway:
   - Solo finish_reason === 'stop' es una revisión. 'length',
     'content_filter' o una respuesta cortada son fallos, y no se
     muestra texto parcial: media revisión se lee como revisión entera.
   - El razonamiento llega en message.reasoning y cuenta dentro de
     max_tokens. Sin control, un modelo gastó 4096 tokens pensando y
     cerró con 'length' sin texto. Por eso va apagado por defecto y,
     si se enciende, con presupuesto sumado al límite.
   - El razonamiento nunca se muestra ni se registra: ni el campo
     reasoning ni un <think>...</think> incrustado en el contenido.
   - La llave no se escribe en el proyecto (viajaría en exportaciones,
     respaldos y copias compartidas); la app la guarda aparte.
===================================================== */
const LaboratorioIBERO = (function(){
  const BASE_PREDETERMINADA = 'https://api.laboratorioia.ibero.mx/infernode/v1';
  /* Lista blanca por origen exacto: ni la llave ni el borrador pueden ir a
     otro servidor aunque alguien edite la dirección. Si el laboratorio cambia
     de dominio, se cambia aquí, en el código, a propósito. */
  const ORIGENES_PERMITIDOS = ['https://api.laboratorioia.ibero.mx'];
  /* Alias estables del laboratorio. /v1/models devuelve además los nombres
     técnicos (y modelos que no son de chat), así que se ofrecen estos. */
  const MODELOS = ['Saptiva Turbo', 'Saptiva Omni', 'Saptiva Cortex'];
  const MODELO_PREDETERMINADO = 'Saptiva Omni';   /* el más rápido */
  const PRESUPUESTOS_RAZONAMIENTO = [0, 512, 1024, 2048];
  /* Cuatro secciones de hasta tres puntos caben con holgura en 2048 tokens. */
  const TOKENS_RESPUESTA = 2048;
  /* El gateway corta a los 60 s una respuesta sin streaming y devuelve 504.
     Este plazo solo cubre la red colgada, para no esperar indefinidamente. */
  const ESPERA_MS = 90 * 1000;
  const NOMBRE = 'Laboratorio de IA IBERO';

  function normalizarBase(direccion){
    return String(direccion || '').trim().replace(/\/+$/, '');
  }

  function esBaseLaboratorio(direccion){
    let u;
    try{ u = new URL(normalizarBase(direccion)); }catch(e){ return false; }
    return u.protocol === 'https:' && ORIGENES_PERMITIDOS.indexOf(u.origin) !== -1;
  }

  function presupuestoValido(n){
    const v = Number(n);
    return (Number.isFinite(v) && v > 0) ? Math.min(Math.floor(v), 8192) : 0;
  }

  function cuerpoRevision(o){
    const presupuesto = presupuestoValido(o.razonamiento);
    const cuerpo = {
      model: o.modelo,
      messages: o.mensajes,
      temperature: o.temperatura,
      stream: false,
      max_tokens: TOKENS_RESPUESTA + presupuesto,
      chat_template_kwargs: {enable_thinking: presupuesto > 0}
    };
    if(presupuesto > 0){ cuerpo.thinking_token_budget = presupuesto; }
    return cuerpo;
  }

  /* Quita el razonamiento que algunos modelos dejan dentro del contenido.
     Si solo llega el cierre (la plantilla abrió <think> en el prompt), todo
     lo anterior era razonamiento. Un <think> sin cierre es razonamiento
     cortado: no queda revisión. */
  function limpiarRazonamiento(texto){
    let t = String(texto == null ? '' : texto);
    t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
    const cierre = t.toLowerCase().lastIndexOf('</think>');
    if(cierre !== -1){ t = t.slice(cierre + '</think>'.length); }
    const apertura = t.toLowerCase().indexOf('<think>');
    if(apertura !== -1){ t = t.slice(0, apertura); }
    return t.trim();
  }

  function fallo(tipo, mensaje, extra){
    const e = new Error(mensaje);
    e.tipo = tipo;
    Object.keys(extra || {}).forEach(k => { e[k] = extra[k]; });
    return e;
  }

  function interpretarRespuesta(j){
    const opcion = j && Array.isArray(j.choices) ? j.choices[0] : null;
    if(!opcion || !opcion.message){
      throw fallo('incompleta', 'La respuesta del ' + NOMBRE + ' llegó sin revisión (no trae choices). ' +
        'No se muestra nada.');
    }
    const fin = opcion.finish_reason;
    if(fin !== 'stop'){
      let causa;
      if(fin === 'length'){
        causa = 'el modelo llegó al límite de tokens antes de terminar (finish_reason=length). ' +
          'Si el razonamiento está encendido, bájale el presupuesto o apágalo; si no, prueba con un apartado más corto';
      }else if(fin === 'content_filter'){
        causa = 'el laboratorio filtró la respuesta (finish_reason=content_filter)';
      }else{
        causa = 'la respuesta no terminó normalmente (finish_reason=' + (fin == null ? 'ausente' : fin) + ')';
      }
      throw fallo('incompleta', 'La revisión quedó incompleta: ' + causa + '. No se muestra texto parcial.',
        {finalizacion: fin == null ? null : fin});
    }
    /* Solo el contenido: message.reasoning y reasoning_content se ignoran. */
    const texto = limpiarRazonamiento(opcion.message.content);
    if(!texto){
      throw fallo('vacia', 'El modelo terminó sin texto de revisión (solo razonamiento o respuesta vacía). ' +
        'Vuelve a intentarlo o apaga el razonamiento.', {finalizacion: fin});
    }
    return {texto: texto, modelo: (j && j.model) || '', finalizacion: fin, uso: (j && j.usage) || null};
  }

  function segundosDeEspera(valor){
    if(!valor){ return null; }
    const n = Number(valor);
    if(Number.isFinite(n) && n >= 0){ return Math.ceil(n); }
    const fecha = Date.parse(valor);
    return Number.isFinite(fecha) ? Math.max(0, Math.ceil((fecha - Date.now()) / 1000)) : null;
  }

  /* El cuerpo de error de InferNode es {"error":{type, code, message}}. Un
     502 de un proxy puede traer HTML: ese no se muestra. */
  function errorHTTP(estado, cuerpo, reintentar, modelo){
    let detalle = '', codigo = '';
    try{
      const j = JSON.parse(cuerpo);
      if(j && j.error){
        detalle = String(j.error.message || '').slice(0, 200);
        codigo = String(j.error.code || j.error.type || '');
      }
    }catch(e){ /* no era JSON */ }
    const extra = {estado: estado, codigo: codigo};
    const conDetalle = m => m + (detalle ? ' Detalle del servidor: «' + detalle + '».' : '');
    if(estado === 401){
      return fallo('http', conDetalle('El ' + NOMBRE + ' rechazó la llave (401). Revisa que la pegaste ' +
        'completa y que sigue vigente; si la revocaron, pide una nueva.'), extra);
    }
    if(estado === 402){
      return fallo('http', conDetalle('La llave no tiene saldo o cuota disponible en el laboratorio (402).'), extra);
    }
    if(estado === 403){
      return fallo('http', conDetalle('La llave no tiene permiso para usar este modelo (403).'), extra);
    }
    if(estado === 404){
      return fallo('http', /model/i.test(codigo + detalle)
        ? 'El laboratorio no tiene el modelo «' + (modelo || '') + '» (404). Usa uno de estos: ' +
          MODELOS.join(', ') + '.'
        : conDetalle('El laboratorio no reconoce la dirección (404). Revisa la dirección base: ' +
          'la predeterminada es ' + BASE_PREDETERMINADA + '.'), extra);
    }
    if(estado === 429){
      const s = segundosDeEspera(reintentar);
      extra.reintentarEn = s;
      return fallo('http', 'El laboratorio recibió demasiadas solicitudes (429). ' +
        (s != null ? 'Espera ' + s + ' s antes de volver a pedir la revisión.' : 'Espera un momento antes de volver a intentar.'),
        extra);
    }
    if(estado === 504){
      return fallo('http', 'El laboratorio cortó la espera (504): el modelo tardó más de 60 s. Prueba con ' +
        MODELO_PREDETERMINADO + ' (el más rápido), con un apartado más corto o sin la base de conocimiento.', extra);
    }
    if(estado === 502 || estado === 503){
      return fallo('http', 'El laboratorio no pudo atender la solicitud en este momento (' + estado + '). ' +
        'Suele ser pasajero: vuelve a intentar en unos minutos.', extra);
    }
    return fallo('http', conDetalle('El laboratorio respondió con un error (HTTP ' + estado + ').'), extra);
  }

  /* En el navegador, un rechazo de CORS, una red sin acceso y un bloqueo de
     red local producen el mismo TypeError: no se pueden distinguir, así que
     se nombran las tres causas, en el orden en que suelen ocurrir. */
  function errorDeRed(e, origen){
    const causa = e && e.cause && (e.cause.code || e.cause.message);
    let primera;
    if(origen === 'null'){
      primera = '(1) esta página se abrió como archivo (file://) y el laboratorio no acepta llamadas sin ' +
        'origen web: ábrela desde su dirección publicada; ';
    }else if(origen){
      primera = '(1) el laboratorio no acepta llamadas desde este origen (' + origen + '): mientras la ' +
        'plataforma no lo autorice (CORS), el navegador bloquea la llamada; ';
    }else{
      primera = '(1) el laboratorio no acepta el origen de esta página (CORS); ';
    }
    return fallo('red', 'No se pudo contactar al ' + NOMBRE + '. Causas posibles: ' + primera +
      '(2) no estás en la red IBERO ni conectado a su VPN; (3) el navegador bloqueó el acceso a la red ' +
      'local: si apareció un aviso para conectarse a dispositivos de tu red local, permítelo en la ' +
      'configuración del sitio.', {detalle: causa ? String(causa) : ''});
  }

  /* Envía y espera, con un solo plazo para la conexión y la lectura del cuerpo.
     `fetch` se recibe para poder simularlo en pruebas; se llama como función
     suelta porque window.fetch invocado como método de otro objeto lanza
     "Illegal invocation". */
  async function pedir(o, ruta, init){
    if(!esBaseLaboratorio(o.base)){
      throw fallo('destino', 'Envío cancelado: ' + normalizarBase(o.base) + ' no es la dirección del ' +
        NOMBRE + '. Solo se admite ' + ORIGENES_PERMITIDOS.join(', ') + '.');
    }
    const llave = String(o.llave || '').trim();
    if(!llave){
      throw fallo('llave', 'Falta la llave del ' + NOMBRE + '. Pégala en Configuración → MentorIA mayéutica.');
    }
    const traer = o.fetch || fetch;
    const control = new AbortController();
    const plazo = o.esperaMs || ESPERA_MS;
    const reloj = setTimeout(() => control.abort(), plazo);
    const inicio = Date.now();
    try{
      let r;
      try{
        r = await traer(normalizarBase(o.base) + ruta, Object.assign({
          redirect: 'error',      /* E-11: ni la llave ni el borrador siguen redirecciones */
          credentials: 'omit',
          signal: control.signal
        }, init, {headers: Object.assign({'Authorization': 'Bearer ' + llave}, init.headers || {})}));
      }catch(e){
        if(control.signal.aborted){
          throw fallo('tiempo', 'El ' + NOMBRE + ' no respondió en ' + Math.round(plazo / 1000) + ' s. ' +
            'Revisa tu conexión a la red IBERO y vuelve a intentar.');
        }
        throw errorDeRed(e, o.origen);
      }
      let cuerpo;
      try{ cuerpo = await r.text(); }
      catch(e){
        throw control.signal.aborted
          ? fallo('tiempo', 'El ' + NOMBRE + ' dejó de responder a mitad de la respuesta. No se muestra texto parcial.')
          : fallo('incompleta', 'La respuesta del ' + NOMBRE + ' llegó cortada. No se muestra texto parcial.');
      }
      if(!r.ok){ throw errorHTTP(r.status, cuerpo, r.headers.get('Retry-After'), o.modelo); }
      let j;
      try{ j = JSON.parse(cuerpo); }
      catch(e){
        throw fallo('incompleta', 'La respuesta del ' + NOMBRE + ' llegó cortada o no es JSON. ' +
          'No se muestra texto parcial.');
      }
      return {json: j, ms: Date.now() - inicio};
    }finally{
      clearTimeout(reloj);
    }
  }

  /* Pide una revisión. opciones: {base, llave, modelo, mensajes, temperatura,
     razonamiento (tokens; 0 = apagado), origen (location.origin), esperaMs, fetch} */
  async function revisar(o){
    if(!String(o.modelo || '').trim()){
      throw fallo('modelo', 'Falta elegir el modelo del laboratorio: ' + MODELOS.join(', ') + '.');
    }
    const r = await pedir(o, '/chat/completions', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(cuerpoRevision(o))
    });
    const salida = interpretarRespuesta(r.json);
    salida.ms = r.ms;
    return salida;
  }

  /* GET /models: sirve como prueba de conexión y de llave. */
  async function listarModelos(o){
    const r = await pedir(o, '/models', {method: 'GET', headers: {}});
    return ((r.json && r.json.data) || []).map(m => m && m.id).filter(Boolean);
  }

  return {
    NOMBRE: NOMBRE,
    BASE_PREDETERMINADA: BASE_PREDETERMINADA,
    ORIGENES_PERMITIDOS: ORIGENES_PERMITIDOS,
    MODELOS: MODELOS,
    MODELO_PREDETERMINADO: MODELO_PREDETERMINADO,
    PRESUPUESTOS_RAZONAMIENTO: PRESUPUESTOS_RAZONAMIENTO,
    TOKENS_RESPUESTA: TOKENS_RESPUESTA,
    ESPERA_MS: ESPERA_MS,
    esBaseLaboratorio: esBaseLaboratorio,
    cuerpoRevision: cuerpoRevision,
    limpiarRazonamiento: limpiarRazonamiento,
    interpretarRespuesta: interpretarRespuesta,
    errorHTTP: errorHTTP,
    revisar: revisar,
    listarModelos: listarModelos
  };
})();
if(typeof module !== 'undefined' && module.exports){ module.exports = LaboratorioIBERO; }
