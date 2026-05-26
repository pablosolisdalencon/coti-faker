module.paths.push('.agent/node_modules');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Instrument addPage
const origAddPage = PDFDocument.prototype.addPage;
let pageCounter = 0;
PDFDocument.prototype.addPage = function(...args) {
  pageCounter++;
  const err = new Error();
  const stackLines = err.stack.split('\n').slice(1, 8).map(l => l.trim());
  const relevantLine = stackLines.find(l => l.includes('make_fake_pdf'));
  console.log(`\n*** addPage #${pageCounter} ***`);
  console.log(`  From: ${relevantLine || stackLines[0]}`);
  console.log(`  Full stack:`);
  stackLines.forEach(l => console.log(`    ${l}`));
  return origAddPage.apply(this, args);
};

// Load and process
const { parsePdfToJson } = require('../.agent/skills/read-cotiza/reader');
const { analyzeAndMarkupQuotation } = require('../.agent/skills/analiza-cotiza/analyzer');
const { renderPDF } = require('../.agent/workflows/make_fake_pdf.js');

async function test() {
  const tareasDir = path.resolve('./tareas');
  const empresasDir = path.resolve('./empresas');
  
  const pdfFile = fs.readdirSync(tareasDir).filter(f => f.endsWith('.pdf'))[0];
  const pdfPath = path.join(tareasDir, pdfFile);
  
  const dfsProfile = JSON.parse(fs.readFileSync(path.join(empresasDir, 'dfs_maderas_spa.json'), 'utf8'));
  
  const rawQuotation = await parsePdfToJson(pdfPath);
  const markupPct = dfsProfile.diferencia_precio || 20;
  const quote = analyzeAndMarkupQuotation(rawQuotation, markupPct);
  
  quote.emisor = {
    n_cotizacion: dfsProfile.n_cotizacion,
    diferencia_precio: dfsProfile.diferencia_precio,
    razon_social: dfsProfile.Razon || '',
    rut: dfsProfile.Rut || '',
    direccion: dfsProfile.Direccion || '',
    contacto: { nombre: dfsProfile.Contacto || '' },
    fono: dfsProfile.Fono || '',
    themeLayout: dfsProfile.themeLayout || 'default',
    primaryColor: dfsProfile.primaryColor,
    secondaryColor: dfsProfile.secondaryColor,
    accentColor: dfsProfile.accentColor,
    headerBg: dfsProfile.headerBg,
    headerFg: dfsProfile.headerFg,
    tableBg: dfsProfile.tableBg,
    tableFg: dfsProfile.tableFg,
    rowAlt: dfsProfile.rowAlt,
    footerBg: dfsProfile.footerBg,
    footerFg: dfsProfile.footerFg,
    logoPath: dfsProfile.logoPath,
    logoFileName: dfsProfile.logoFileName,
    condiciones_del_servicio: dfsProfile.condiciones_del_servicio,
  };
  quote.numero = dfsProfile.n_cotizacion;
  
  pageCounter = 0;
  console.log('\n=== GENERATING DFS PDF ===');
  await renderPDF(quote, path.join('./scratch', 'debug_output.pdf'));
  console.log(`\nTotal addPage calls: ${pageCounter}`);
}

test().catch(console.error);
