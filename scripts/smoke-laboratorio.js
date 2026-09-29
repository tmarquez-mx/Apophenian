#!/usr/bin/env node
/* Prueba de humo de MentorIA contra el Laboratorio de IA IBERO real.

   Usa la misma lógica de proveedor que la app (src/mentoria/laboratorio.js)
   y los mismos mensajes que arma armarMensajesRevision() en Apophenian, con
   un borrador ficticio. Node no aplica CORS: esta prueba verifica el
   protocolo (llave, formato, razonamiento, finish_reason, errores), no que
   el navegador pueda llamar al laboratorio desde el origen de la app.

   Requisitos: Node 18 o posterior, estar en la red IBERO o su VPN.

   Variables de entorno:
     LABORATORIO_LLAVE           llave sk-saptiva-... (o INFERNODE_API_KEY)
     LABORATORIO_BASE            predeterminada: https://api.laboratorioia.ibero.mx/infernode/v1
     LABORATORIO_MODELO          predeterminado: Saptiva Omni
     LABORATORIO_RAZONAMIENTO    presupuesto en tokens; 0 (predeterminado) = apagado

   No imprime la llave ni el texto de la revisión: solo estado, modelo
   servido, tiempo, longitud, tokens y qué secciones trae la respuesta. */
'use strict';
const Lab = require('../src/mentoria/laboratorio.js');

const llave = process.env.LABORATORIO_LLAVE || process.env.INFERNODE_API_KEY || '';
const base = process.env.LABORATORIO_BASE || Lab.BASE_PREDETERMINADA;
const modelo = process.env.LABORATORIO_MODELO || Lab.MODELO_PREDETERMINADO;
const razonamiento = Number(process.env.LABORATORIO_RAZONAMIENTO || 0);

/* Por si algún mensaje llegara a repetirla: nunca sale en pantalla. */
function ocultar(texto){
  return llave ? String(texto).split(llave).join('[llave]') : String(texto);
}
function linea(clave, valor){ console.log(ocultar(clave.padEnd(22) + valor)); }

/* Borrador ficticio: ni el barrio ni los datos existen. */
const BORRADOR = [
  'Esta investigación estudia los huertos comunitarios de la colonia San Aurelio, un barrio ficticio ' +
  'del oriente de la ciudad, como espacios donde se negocian formas de pertenencia. Entre 2019 y 2024 ' +
  'el número de huertos pasó de dos a once, y en ese periodo cambiaron también las reglas para decidir ' +
  'quién siembra, quién cosecha y quién puede entrar.',
  'La literatura sobre agricultura urbana suele leer estos espacios como respuestas a la inseguridad ' +
  'alimentaria. Aquí se propone otra lectura: el huerto es un lugar donde se produce comunidad y, al ' +
  'mismo tiempo, se marcan fronteras. Las asambleas de los huertos deciden sobre el agua, el uso del ' +
  'suelo y la llegada de nuevos vecinos, de modo que funcionan como pequeñas instituciones.',
  'La pregunta que guía el trabajo es cómo las reglas de los huertos comunitarios de San Aurelio ' +
  'configuran la pertenencia al barrio. Para responderla se realizarán entrevistas con integrantes de ' +
  'las asambleas y observación en las jornadas de trabajo colectivo. Se espera mostrar que la ' +
  'pertenencia no se hereda por residencia, sino que se gana con trabajo y se pierde con la ausencia.',
  'El capítulo uno revisa la discusión sobre bienes comunes urbanos; el dos describe el barrio y sus ' +
  'huertos; el tres analiza las reglas y el cuatro discute sus efectos en la vida del barrio.'
].join('\n\n');

/* Copia de las reglas de armarMensajesRevision() en Apophenian 0.9.2, sin
   título ni base de conocimiento. Si la app cambia su consigna, cámbiala aquí. */
const SECCIONES_REVISION = ['Fortalezas', 'Debilidades', 'Sugerencias', 'Preguntas'];
function mensajesRevision(){
  const sistema = 'Eres un revisor académico que acompaña la escritura de la tesis ' +
    'en ciencias sociales y humanidades. Tu perfil: Mentor académico.\n\n' +
    'Reglas estrictas de tu función:\n' +
    '1. Respondes en español, con gramática correcta y tono académico sobrio y constructivo.\n' +
    '2. SEÑALAS y PREGUNTAS; nunca redactas. No reescribas oraciones, no propongas párrafos ' +
    'ni frases listas para copiar, no dictes cómo debe decir algo. La escritura es de quien escribe.\n' +
    '3. Estructura tu respuesta exactamente en estas ' + SECCIONES_REVISION.length +
    ' secciones con estos títulos: ' + SECCIONES_REVISION.join(', ') +
    '. En Sugerencias indicas QUÉ trabajar, no CÓMO decirlo.\n' +
    '4. Sé específico: cita el pasaje al que te refieres entre comillas cuando ayude, sin corregirlo.\n' +
    '5. Máximo tres puntos por sección.';
  const palabras = BORRADOR.split(/\s+/).filter(Boolean).length;
  const usuario = 'Apartado: Introducción (' + palabras + ' palabras, meta de 1500).\n\n' +
    'Texto a revisar:\n\n' + BORRADOR;
  return {mensajes: [{role: 'system', content: sistema}, {role: 'user', content: usuario}], palabras: palabras};
}

async function main(){
  console.log('Prueba de humo: MentorIA → ' + Lab.NOMBRE + ' (protocolo desde Node; no prueba CORS)');
  linea('dirección', base);
  linea('modelo pedido', modelo);
  linea('razonamiento', razonamiento > 0 ? 'presupuesto de ' + razonamiento + ' tokens' : 'apagado');
  if(!llave){
    linea('estado', 'FALLO (falta LABORATORIO_LLAVE o INFERNODE_API_KEY)');
    process.exitCode = 1;
    return;
  }
  try{
    const ids = await Lab.listarModelos({base: base, llave: llave});
    linea('GET /models', 'ok, ' + ids.length + ' modelos servidos');
  }catch(e){
    linea('GET /models', 'FALLO ' + (e.tipo || '') + (e.estado ? ' ' + e.estado : '') + ': ' + e.message);
  }
  const {mensajes, palabras} = mensajesRevision();
  linea('borrador ficticio', palabras + ' palabras');
  try{
    const r = await Lab.revisar({base: base, llave: llave, modelo: modelo, mensajes: mensajes,
                                 temperatura: 0.4, razonamiento: razonamiento});
    const encontradas = SECCIONES_REVISION.filter(s => new RegExp('^[#*\\s]*' + s + '\\b', 'im').test(r.texto));
    linea('estado', 'OK (finish_reason=' + r.finalizacion + ')');
    linea('modelo servido', r.modelo || '(no informado)');
    linea('tiempo', r.ms + ' ms');
    linea('longitud', r.texto.length + ' caracteres');
    if(r.uso){
      linea('tokens', 'entrada ' + r.uso.prompt_tokens + ', salida ' + r.uso.completion_tokens);
    }
    linea('secciones', encontradas.length + '/' + SECCIONES_REVISION.length +
      (encontradas.length ? ' (' + encontradas.join(', ') + ')' : ''));
    linea('razonamiento en texto', /<\/?think>/i.test(r.texto) ? 'SÍ (revisar)' : 'no');
  }catch(e){
    linea('estado', 'FALLO ' + (e.tipo || 'desconocido') + (e.estado ? ' ' + e.estado : ''));
    linea('mensaje', e.message);
    if(e.detalle){ linea('detalle', e.detalle); }
    process.exitCode = 1;
  }
}

main();
