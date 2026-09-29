/* Pruebas del proveedor Laboratorio de IA IBERO de MentorIA.
   Corren sin red y sin dependencias: `node --test` desde la raíz del repo
   (Node 18 o posterior). `fetch` se simula en cada prueba; los borradores
   son ficticios. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Lab = require('../src/mentoria/laboratorio.js');

const BASE = 'https://api.laboratorioia.ibero.mx/infernode/v1';
const LLAVE = 'sk-saptiva-prueba-0000000000000000';
const MENSAJES = [
  {role: 'system', content: 'Eres un revisor académico. SEÑALAS y PREGUNTAS; nunca redactas.'},
  {role: 'user', content: 'Apartado: Introducción (40 palabras).\n\nTexto a revisar:\n\nBorrador ficticio sobre huertos urbanos en un barrio inventado.'}
];

/* fetch simulado: anota cada llamada y devuelve (o lanza) lo que se le indique */
function fetchFalso(salida){
  const llamadas = [];
  const f = async function(url, init){
    llamadas.push({url: url, init: init});
    if(salida instanceof Error){ throw salida; }
    return typeof salida === 'function' ? salida(url, init) : salida;
  };
  f.llamadas = llamadas;
  return f;
}
function respuestaJSON(estado, cuerpo, cabeceras){
  return new Response(JSON.stringify(cuerpo), {status: estado, headers: cabeceras || {'Content-Type': 'application/json'}});
}
function completado(contenido, finish, extra){
  return {
    id: 'chatcmpl-ficticio',
    object: 'chat.completion',
    model: 'Nemotron 3 Nano Omni 30B A3B (FP8)',
    choices: [{index: 0, message: Object.assign({role: 'assistant', content: contenido}, extra || {}),
               finish_reason: finish}],
    usage: {prompt_tokens: 120, completion_tokens: 80, total_tokens: 200}
  };
}
function opciones(f, extra){
  return Object.assign({fetch: f, base: BASE, llave: LLAVE, modelo: 'Saptiva Omni',
                        mensajes: MENSAJES, temperatura: 0.4}, extra || {});
}

/* ---------- destino permitido ---------- */

test('solo se admite el origen https del laboratorio', () => {
  assert.equal(Lab.esBaseLaboratorio(BASE), true);
  assert.equal(Lab.esBaseLaboratorio(BASE + '/'), true);
  assert.equal(Lab.esBaseLaboratorio('http://api.laboratorioia.ibero.mx/infernode/v1'), false);
  assert.equal(Lab.esBaseLaboratorio('https://api.laboratorioia.ibero.mx.ejemplo.com/v1'), false);
  assert.equal(Lab.esBaseLaboratorio('https://otro-servidor.ejemplo/v1'), false);
  assert.equal(Lab.esBaseLaboratorio('http://localhost:11434'), false);
  assert.equal(Lab.esBaseLaboratorio('no es una url'), false);
  assert.equal(Lab.esBaseLaboratorio(''), false);
});

test('una dirección ajena cancela el envío sin llamar a la red', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('x', 'stop')));
  await assert.rejects(Lab.revisar(opciones(f, {base: 'https://otro-servidor.ejemplo/v1'})),
    e => e.tipo === 'destino' && /Laboratorio de IA IBERO/.test(e.message));
  assert.equal(f.llamadas.length, 0);
});

test('sin llave no se envía nada', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('x', 'stop')));
  await assert.rejects(Lab.revisar(opciones(f, {llave: '  '})), e => e.tipo === 'llave');
  assert.equal(f.llamadas.length, 0);
});

/* ---------- formato de la solicitud ---------- */

test('la solicitud es un chat/completions compatible con OpenAI, con razonamiento apagado', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('Fortalezas\n- Tema claro.', 'stop')));
  await Lab.revisar(opciones(f));
  assert.equal(f.llamadas.length, 1);
  const {url, init} = f.llamadas[0];
  assert.equal(url, BASE + '/chat/completions');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');        /* ni la llave ni el borrador siguen redirecciones */
  assert.equal(init.credentials, 'omit');
  assert.equal(init.headers['Authorization'], 'Bearer ' + LLAVE);
  assert.equal(init.headers['Content-Type'], 'application/json');
  const cuerpo = JSON.parse(init.body);
  assert.equal(cuerpo.model, 'Saptiva Omni');
  assert.deepEqual(cuerpo.messages, MENSAJES);
  assert.equal(cuerpo.temperature, 0.4);
  assert.equal(cuerpo.stream, false);
  assert.equal(cuerpo.max_tokens, Lab.TOKENS_RESPUESTA);
  assert.deepEqual(cuerpo.chat_template_kwargs, {enable_thinking: false});
  assert.equal('thinking_token_budget' in cuerpo, false);
});

test('con presupuesto de razonamiento se pide y se suma al límite de tokens', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('Preguntas\n- ¿Por qué?', 'stop')));
  await Lab.revisar(opciones(f, {razonamiento: 1024}));
  const cuerpo = JSON.parse(f.llamadas[0].init.body);
  assert.deepEqual(cuerpo.chat_template_kwargs, {enable_thinking: true});
  assert.equal(cuerpo.thinking_token_budget, 1024);
  assert.equal(cuerpo.max_tokens, Lab.TOKENS_RESPUESTA + 1024);
});

test('un presupuesto inválido equivale a razonamiento apagado', () => {
  [undefined, null, -5, 'mucho', NaN].forEach(v => {
    const cuerpo = Lab.cuerpoRevision({modelo: 'Saptiva Turbo', mensajes: MENSAJES, temperatura: 0.4, razonamiento: v});
    assert.deepEqual(cuerpo.chat_template_kwargs, {enable_thinking: false});
    assert.equal('thinking_token_budget' in cuerpo, false);
  });
});

test('la barra final de la dirección no duplica separadores', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('Fortalezas\n- Bien.', 'stop')));
  await Lab.revisar(opciones(f, {base: BASE + '///'}));
  assert.equal(f.llamadas[0].url, BASE + '/chat/completions');
});

/* ---------- respuesta normal ---------- */

test('una respuesta completa devuelve el texto y el modelo servido', async () => {
  const texto = 'Fortalezas\n- El problema está delimitado.\nPreguntas\n- ¿Qué distingue a este barrio?';
  const f = fetchFalso(respuestaJSON(200, completado(texto, 'stop')));
  const r = await Lab.revisar(opciones(f));
  assert.equal(r.texto, texto);
  assert.equal(r.modelo, 'Nemotron 3 Nano Omni 30B A3B (FP8)');
  assert.equal(r.finalizacion, 'stop');
  assert.deepEqual(r.uso, {prompt_tokens: 120, completion_tokens: 80, total_tokens: 200});
  assert.equal(typeof r.ms, 'number');
});

/* ---------- finish_reason distinto de stop ---------- */

test('finish_reason=length es un fallo y no entrega texto parcial', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('Fortalezas\n- El proble', 'length')));
  await assert.rejects(Lab.revisar(opciones(f)), e => {
    assert.equal(e.tipo, 'incompleta');
    assert.equal(e.finalizacion, 'length');
    assert.match(e.message, /límite/);
    assert.match(e.message, /no se muestra/i);
    assert.doesNotMatch(e.message, /El proble/);
    return true;
  });
});

test('finish_reason=content_filter es un fallo', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('parcial', 'content_filter')));
  await assert.rejects(Lab.revisar(opciones(f)), e => e.tipo === 'incompleta' && /filtr/.test(e.message));
});

test('sin finish_reason la respuesta se trata como cortada', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('parcial', null)));
  await assert.rejects(Lab.revisar(opciones(f)), e => e.tipo === 'incompleta');
});

test('una respuesta sin choices o que no es JSON es un fallo', async () => {
  const f1 = fetchFalso(respuestaJSON(200, {object: 'chat.completion', choices: []}));
  await assert.rejects(Lab.revisar(opciones(f1)), e => e.tipo === 'incompleta');
  const f2 = fetchFalso(new Response('{"choices":[{"message":{"content":"Forta', {status: 200}));
  await assert.rejects(Lab.revisar(opciones(f2)), e => e.tipo === 'incompleta');
});

/* ---------- razonamiento fuera del texto ---------- */

test('el campo reasoning nunca pasa al texto de la revisión', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('Debilidades\n- Falta el método.', 'stop',
    {reasoning: 'Primero pienso en la estructura del texto...', reasoning_content: 'más razonamiento'})));
  const r = await Lab.revisar(opciones(f));
  assert.equal(r.texto, 'Debilidades\n- Falta el método.');
});

test('se descarta el razonamiento incrustado en el contenido', () => {
  assert.equal(Lab.limpiarRazonamiento('<think>esto es razonamiento</think>\nFortalezas\n- A.'), 'Fortalezas\n- A.');
  /* plantillas que abren <think> en el prompt: solo llega el cierre */
  assert.equal(Lab.limpiarRazonamiento('razonamiento sin apertura</think>Preguntas\n- ¿B?'), 'Preguntas\n- ¿B?');
  /* un <think> sin cierre es razonamiento cortado: no hay revisión */
  assert.equal(Lab.limpiarRazonamiento('<think>pensando y pensando'), '');
  assert.equal(Lab.limpiarRazonamiento('Sugerencias\n- C.'), 'Sugerencias\n- C.');
  assert.equal(Lab.limpiarRazonamiento(null), '');
});

test('si solo llegó razonamiento, la revisión se declara vacía', async () => {
  const f = fetchFalso(respuestaJSON(200, completado('<think>solo razonamiento</think>', 'stop')));
  await assert.rejects(Lab.revisar(opciones(f)), e => e.tipo === 'vacia');
  const g = fetchFalso(respuestaJSON(200, completado(null, 'stop', {reasoning: 'todo fue razonamiento'})));
  await assert.rejects(Lab.revisar(opciones(g)), e => e.tipo === 'vacia');
});

/* ---------- errores HTTP ---------- */

function errorInferNode(tipo, codigo, mensaje){
  return {error: {type: tipo, code: codigo, message: mensaje, param: null, request_id: 'req_ficticio'}};
}

test('401: la llave fue rechazada, sin repetir la llave en el mensaje', async () => {
  const f = fetchFalso(respuestaJSON(401, errorInferNode('authentication_error', 'identity.unauthorized',
    'Token is invalid, revoked, or for a suspended org / disabled user.')));
  await assert.rejects(Lab.revisar(opciones(f)), e => {
    assert.equal(e.tipo, 'http');
    assert.equal(e.estado, 401);
    assert.match(e.message, /llave/);
    assert.equal(e.message.indexOf(LLAVE), -1);
    return true;
  });
});

test('402: sin saldo o cuota', async () => {
  const f = fetchFalso(respuestaJSON(402, errorInferNode('billing_error', 'insufficient_quota', 'Quota exceeded')));
  await assert.rejects(Lab.revisar(opciones(f)), e => e.estado === 402 && /cuota|saldo/.test(e.message));
});

test('404 de modelo: sugiere los alias disponibles', async () => {
  const f = fetchFalso(respuestaJSON(404, errorInferNode('not_found_error', 'model_not_found', 'model not found')));
  await assert.rejects(Lab.revisar(opciones(f, {modelo: 'llama3.2:3b'})), e => {
    assert.equal(e.estado, 404);
    assert.match(e.message, /llama3\.2:3b/);
    Lab.MODELOS.forEach(m => assert.match(e.message, new RegExp(m)));
    return true;
  });
});

test('429: respeta Retry-After', async () => {
  const f = fetchFalso(respuestaJSON(429, errorInferNode('rate_limit_error', 'rate_limited', 'Too many requests'),
    {'Content-Type': 'application/json', 'Retry-After': '7'}));
  await assert.rejects(Lab.revisar(opciones(f)), e => {
    assert.equal(e.estado, 429);
    assert.equal(e.reintentarEn, 7);
    assert.match(e.message, /7 s/);
    return true;
  });
});

test('502, 503 y 504: el laboratorio no pudo atender', async () => {
  for(const estado of [502, 503, 504]){
    const f = fetchFalso(new Response('<html>Bad gateway</html>', {status: estado}));
    await assert.rejects(Lab.revisar(opciones(f)), e => {
      assert.equal(e.tipo, 'http');
      assert.equal(e.estado, estado);
      assert.match(e.message, new RegExp(String(estado)));
      assert.doesNotMatch(e.message, /<html>/);   /* el HTML del proxy no se pinta */
      return true;
    });
  }
  const g = fetchFalso(new Response('', {status: 504}));
  await assert.rejects(Lab.revisar(opciones(g)), e => /60 s/.test(e.message));
});

/* ---------- red, CORS y tiempo ---------- */

test('un fallo de red se explica como CORS o red IBERO, con el origen de la página', async () => {
  const f = fetchFalso(new TypeError('Failed to fetch'));
  await assert.rejects(Lab.revisar(opciones(f, {origen: 'https://apophenian.netlify.app'})), e => {
    assert.equal(e.tipo, 'red');
    assert.match(e.message, /no acepta/);
    assert.match(e.message, /https:\/\/apophenian\.netlify\.app/);
    assert.match(e.message, /red IBERO/);
    assert.match(e.message, /VPN/);
    return true;
  });
});

test('abierta como archivo (origen null) se explica que hace falta la dirección publicada', async () => {
  const f = fetchFalso(new TypeError('Failed to fetch'));
  await assert.rejects(Lab.revisar(opciones(f, {origen: 'null'})), e => e.tipo === 'red' && /archivo/.test(e.message));
});

test('si el laboratorio no contesta a tiempo, se aborta con un mensaje de tiempo', async () => {
  const colgado = (url, init) => new Promise((resolver, rechazar) => {
    init.signal.addEventListener('abort', () => rechazar(new DOMException('abortado', 'AbortError')));
  });
  await assert.rejects(Lab.revisar(opciones(colgado, {esperaMs: 20})), e => e.tipo === 'tiempo' && /no respondió/.test(e.message));
});

/* ---------- listado de modelos ---------- */

test('listarModelos consulta /models con la llave y devuelve los identificadores', async () => {
  const f = fetchFalso(respuestaJSON(200, {object: 'list', data: [
    {id: 'Qwen3.6 35B A3B (FP8)', object: 'model'}, {id: 'Nemotron 3 Nano Omni 30B A3B (FP8)', object: 'model'}]}));
  const ids = await Lab.listarModelos({fetch: f, base: BASE, llave: LLAVE});
  assert.deepEqual(ids, ['Qwen3.6 35B A3B (FP8)', 'Nemotron 3 Nano Omni 30B A3B (FP8)']);
  const {url, init} = f.llamadas[0];
  assert.equal(url, BASE + '/models');
  assert.equal(init.method, 'GET');
  assert.equal(init.redirect, 'error');
  assert.equal(init.headers['Authorization'], 'Bearer ' + LLAVE);
});

test('listarModelos traduce los mismos errores', async () => {
  const f = fetchFalso(respuestaJSON(401, errorInferNode('authentication_error', 'identity.unauthorized', 'bad')));
  await assert.rejects(Lab.listarModelos({fetch: f, base: BASE, llave: LLAVE}), e => e.estado === 401);
});
