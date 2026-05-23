/**
 * test_get_prices.js
 * Prueba de la skill get-prices con una propuesta arbitraria.
 * Requiere un argumento: ruta al JSON de la propuesta.
 * Segundo argumento (opcional): directorio de salida para los precios.
 *
 * Uso:
 *   node .agent/test_get_prices.js <ruta_json_propuesta> [dir_salida]
 *
 * Ejemplo:
 *   node .agent/test_get_prices.js scratch/parsed_quote_BAT_1009.json precios/
 */
const fs = require("fs");
const path = require("path");
const { gatherPrices } = require("./skills/get-prices/get_prices");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("❌ ERROR: Se requiere la ruta al JSON de la propuesta como argumento.");
  console.error("   Uso: node .agent/test_get_prices.js <ruta_json> [dir_salida]");
  process.exit(1);
}

const proposalPath = path.resolve(args[0]);
const outputDir = args[1] ? path.resolve(args[1]) : path.resolve("precios");

if (!fs.existsSync(proposalPath)) {
  console.error(`❌ ERROR: Archivo no encontrado: ${proposalPath}`);
  process.exit(1);
}

console.log("=== TEST: GET-PRICES SKILL ===");
console.log(`Propuesta : ${proposalPath}`);
console.log(`Salida    : ${outputDir}`);
console.log();

try {
  const result = gatherPrices(proposalPath, outputDir);
  console.log(`\nMateriales encontrados: ${result.materials.length}`);
  result.materials.forEach(m => {
    const price = m.price_clp.toLocaleString("es-CL");
    console.log(`  - [${m.category}] ${m.name} | ${m.unit} | $${price} | ${m.supplier}`);
  });
  console.log("\n✅ Test completado exitosamente.");
} catch (err) {
  console.error("❌ Test falló:", err.message || err);
  process.exit(1);
}
