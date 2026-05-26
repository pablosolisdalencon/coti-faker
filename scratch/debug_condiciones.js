const fs = require('fs');
const path = require('path');
const profile = JSON.parse(fs.readFileSync(path.join(__dirname, '../empresas/dfs_maderas_spa.json'), 'utf8'));
const text = profile.condiciones_del_servicio;
const lines = text.split('\n');

const headings = [
  'BASES GENERALES DEL SERVICIO',
  'TÉRMINOS Y CONDICIONES DEL SERVICIO',
  'Sobre los Trabajos',
  'Ejecución de los Trabajos',
  'Pagos',
  'Condiciones de Pago',
  'Cosas a Tener en Cuenta',
  'Aspectos Generales',
  'Lo Que No Incluye',
  'Servicios No Incluidos',
  'Garantías y Revisiones',
  'Garantía',
  'Información Adicional',
  'Disposiciones Finales',
  'Programación'
];

console.log('Total lines:', lines.length);
console.log('Line 0 (title):', lines[0]);

// Simulate renderCondicionesServicio
let condY = 95 + 15; // renderHeader returns 95 for green-estimate, +15 gap
condY += 18; // title
condY += 12; // underline gap
let pages = 1;

for (let i = 1; i < lines.length; i++) {
  const trimmed = lines[i].trim();
  if (trimmed === '') {
    condY += 4;
    console.log(`Line ${i}: [empty] -> condY=${condY}`);
    continue;
  }
  
  const isHeading = headings.includes(trimmed);
  if (isHeading) {
    if (condY > 50) condY += 8;
    if (condY > 680) {
      pages++;
      condY = 95 + 15;
      console.log(`*** NEW PAGE ${pages} at line ${i} ***`);
    }
    condY += 14;
    console.log(`Line ${i}: [H] "${trimmed}" -> condY=${condY}`);
  } else {
    // Estimate text height (roughly 12px per 70 chars)
    const estH = Math.max(12, Math.ceil(trimmed.length / 70) * 12);
    if (condY + estH > 680) {
      pages++;
      condY = 95 + 15;
      console.log(`*** NEW PAGE ${pages} at line ${i} ***`);
    }
    condY += estH + 4;
    console.log(`Line ${i}: [T] "${trimmed.substring(0, 50)}..." -> condY=${condY} (estH=${estH})`);
  }
}

console.log('\nFinal condY:', condY, '| Total pages:', pages);
