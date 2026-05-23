const path = require("path");
const { parsePdfToJson } = require("./skills/read-cotiza/reader");

console.log("=== TESTING READ-COTIZA SKILL ===");

const pdfPath = path.join(__dirname, "../tareas/Ppta BAT 1009  Cierre Perimetral para Bicicletero Torre F piso -3   Condominio Andes  _ Macul.pdf");
const outputPath = path.join(__dirname, "../scratch/parsed_ppta_1009.json");

async function runTest() {
  try {
    const result = await parsePdfToJson(pdfPath, outputPath);
    
    console.log("\nParsed Result Preview:");
    console.log(`Documento Tipo: ${result.tipo_documento}`);
    console.log(`Número: ${result.numero}`);
    console.log(`Emisor Razón Social: ${result.emisor.razon_social}`);
    console.log(`Emisor RUT: ${result.emisor.rut}`);
    console.log(`Cliente Razón Social: ${result.receptor.razon_social}`);
    console.log(`Dirección Obra: ${result.receptor.direccion}`);
    console.log(`Fecha Emisión: ${result.fechas.fecha_emision}`);
    
    console.log("\nDetalles de Partidas:");
    result.detalles.forEach(d => {
      console.log(`- Item ${d.item}: ${d.descripcion_resumen} | Cantidad: ${d.cantidad} ${d.unidad} | Total: ${d.total} CLP`);
    });

    console.log("\nTotales:");
    console.log(`Neto:  ${result.totales.monto_neto} CLP`);
    console.log(`IVA:   ${result.totales.iva_19} CLP`);
    console.log(`Total: ${result.totales.monto_total} CLP`);

    // Verify calculations match
    const calculatedTotal = result.totales.monto_neto + result.totales.iva_19;
    if (calculatedTotal === result.totales.monto_total) {
      console.log("\n✅ Success: Calculations match totals from document!");
    } else {
      console.warn(`\n⚠️ Warning: Calculated total (${calculatedTotal}) does not match document total (${result.totales.monto_total})`);
    }
  } catch (error) {
    console.error("Test failed:", error);
  }
}

runTest();
