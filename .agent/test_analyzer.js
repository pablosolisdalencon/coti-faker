const fs = require("fs");
const path = require("path");
const { analyzeAndMarkupQuotation } = require("./skills/analiza-cotiza/analyzer");
const { formatQuotationText } = require("./skills/quotation_generator/generator");

console.log("=== TESTING ANALIZA-COTIZA SKILL ===");

const inputPath = path.join(__dirname, "../scratch/parsed_ppta_1009.json");
const outputPath = path.join(__dirname, "../scratch/upgraded_ppta_1009.json");

if (!fs.existsSync(inputPath)) {
  console.error(`Error: Missing input file ${inputPath}. Please run test_reader.js first.`);
  process.exit(1);
}

const original = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const targetMarkup = 25; // 25% surcharge

try {
  console.log(`Original Total: ${original.totales.monto_total} CLP`);
  
  const upgraded = analyzeAndMarkupQuotation(original, targetMarkup);
  
  console.log(`\nUpgraded Total: ${upgraded.totales.monto_total} CLP`);
  
  const realMarkup = ((upgraded.totales.monto_total - original.totales.monto_total) / original.totales.monto_total) * 100;
  console.log(`Calculated Surcharge: ${realMarkup.toFixed(2)}% (Target: ${targetMarkup}%)`);
  
  fs.writeFileSync(outputPath, JSON.stringify(upgraded, null, 2), "utf8");
  console.log(`\nSaved upgraded JSON to ${outputPath}`);
  
  console.log("\nUpgraded Details comparison:");
  original.detalles.forEach((d, idx) => {
    const upD = upgraded.detalles[idx];
    if (d.total > 0) {
      console.log(`- Item ${d.item}:`);
      console.log(`  Orig: "${d.descripcion_resumen}" | Total: ${d.total} CLP`);
      console.log(`  Upgr: "${upD.descripcion_resumen}" | Total: ${upD.total} CLP`);
    } else {
      console.log(`- Item ${d.item}:`);
      console.log(`  Orig: "${d.descripcion_resumen}"`);
      console.log(`  Upgr: "${upD.descripcion_resumen}"`);
    }
  });

  // Print text format using generator's formatter
  console.log("\nFormateando Nueva Propuesta Comercial:");
  const textDoc = formatQuotationText(upgraded);
  console.log("----------------------------------------------------------------------");
  console.log(textDoc);
  console.log("----------------------------------------------------------------------");

} catch (error) {
  console.error("Test failed:", error);
}
