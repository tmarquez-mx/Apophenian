/* La app es un solo archivo HTML (regla 5), así que el parche de integración
   pega una copia de src/mentoria/laboratorio.js dentro del <script>. Esta
   prueba impide que la copia y el archivo probado se separen. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const PARCHE = path.join(RAIZ, 'src/mentoria/apophenian-html.patch');
const MODULO = path.join(RAIZ, 'src/mentoria/laboratorio.js');
const INICIO = '/* ==== inicio: src/mentoria/laboratorio.js';
const FIN = '/* ==== fin: src/mentoria/laboratorio.js ==== */';

test('el parche pega el módulo del laboratorio sin cambios', () => {
  const lineas = fs.readFileSync(PARCHE, 'utf8').split('\n');
  const i = lineas.findIndex(l => l.startsWith('+' + INICIO));
  const f = lineas.findIndex(l => l === '+' + FIN);
  assert.ok(i !== -1 && f > i, 'no se encontraron las marcas del módulo en el parche');
  const copia = lineas.slice(i + 1, f).map(l => {
    assert.ok(l.startsWith('+'), 'línea no añadida dentro del bloque: ' + l);
    return l.slice(1);
  }).join('\n');
  assert.equal(copia, fs.readFileSync(MODULO, 'utf8').replace(/\n$/, ''));
});

test('el parche no trae llaves del laboratorio', () => {
  assert.doesNotMatch(fs.readFileSync(PARCHE, 'utf8'), /sk-saptiva-[A-Za-z0-9]{8,}/);
});
