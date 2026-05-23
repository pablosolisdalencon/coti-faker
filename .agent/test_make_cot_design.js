/**
 * test_make_cot_design.js
 * Prueba y validación piloto de la skill make-cot-design.
 * 
 * Uso:
 *   node .agent/test_make_cot_design.js [ruta_logo1.png] [ruta_logo2.png] ...
 */
const fs = require("fs");
const path = require("path");
const { generateQuotationDesigns } = require("./skills/make-cot-design/make_cot_design");

async function run() {
  const args = process.argv.slice(2);
  let logosToProcess = [];

  if (args.length > 0) {
    logosToProcess = args.map(arg => path.resolve(arg));
  } else {
    // Fallback: discover logos in the logos directory
    const logosDir = path.join(__dirname, "../logos");
    if (fs.existsSync(logosDir)) {
      const files = fs.readdirSync(logosDir).filter(f => f.toLowerCase().endsWith(".png"));
      logosToProcess = files.map(f => path.join(logosDir, f));
      console.log(`[test] No se recibieron argumentos. Auto-detectando ${logosToProcess.length} logos en ${logosDir}`);
    }
  }

  if (logosToProcess.length === 0) {
    console.error("❌ ERROR: No se encontraron logotipos para procesar.");
    console.error("   Uso: node .agent/test_make_cot_design.js [ruta_al_logo.png]");
    process.exit(1);
  }

  const outputDir = path.join(__dirname, "../diseños");
  console.log(`[test] Carpeta de salida para diseños: ${outputDir}`);

  try {
    const results = await generateQuotationDesigns(logosToProcess, outputDir);
    console.log("\n=============================================");
    console.log(`🎉 PROCESO COMPLETADO: ${results.length} diseños generados.`);
    console.log("=============================================");
    results.forEach(res => {
      console.log(`- Marca: ${res.brand} [Layout: ${res.style.toUpperCase()}]`);
      console.log(`  Logo:  ${res.logo}`);
      console.log(`  Colores Extraídos: Primario=${res.colors.primary}, Secundario=${res.colors.secondary}`);
      console.log(`  PDF Destino:       ${res.outputPath}`);
      console.log("");
    });
  } catch (err) {
    console.error("❌ ERROR al ejecutar generateQuotationDesigns:", err.message || err);
    process.exit(1);
  }
}

run();
