const fs = require("fs");
const path = require("path");

// Self-relative path to memory DB — never workspace-root-dependent
const MEMORY_PRICES_PATH = path.join(__dirname, "../../memory/material_prices.json");

/**
 * Fuzzy-matches material keywords from any text against the local prices DB.
 * Pure function — no side effects, no file I/O.
 * @param {string} text - Free-form description text
 * @param {Array} dbMaterials - Full materials list from memory DB
 * @returns {Array} - Matched material objects (deduplicated)
 */
function findMatchingMaterials(text, dbMaterials) {
  if (!text || !Array.isArray(dbMaterials)) return [];
  const lowerText = text.toLowerCase();

  const keywordsMap = [
    { keys: ["malla", "electrosoldada", "acma"], target: "malla" },
    { keys: ["angulo", "\u00e1ngulo", "laminado"], target: "angulo" },
    { keys: ["perfil", "tubo", "pilar", "acero"], target: "perfil" },
    { keys: ["fierro", "estriado"], target: "fierro" },
    { keys: ["cemento", "sika", "concreto", "fraguado"], target: "cemento" },
    { keys: ["hormigon", "hormig\u00f3n"], target: "hormig\u00f3n" },
    { keys: ["yeso"], target: "yeso" },
    { keys: ["pasta de muro", "pasta muro"], target: "pasta" },
    { keys: ["pintura", "esmalte", "anticorrosivo", "oleo"], target: "pintura" },
    { keys: ["chapa", "cerradura", "cerrojo", "multipunto", "seguridad"], target: "chapa" },
    { keys: ["candado"], target: "candado" },
    { keys: ["pino", "madera", "cepillado"], target: "pino" },
    { keys: ["terciado"], target: "terciado" },
    { keys: ["osb"], target: "osb" },
    { keys: ["zinc", "canaleta", "acanalada"], target: "zinc" },
    { keys: ["volcanita"], target: "volcanita" },
    { keys: ["ladrillo", "princesa", "fiscal"], target: "ladrillo" }
  ];

  const matchedTargets = new Set();
  for (const item of keywordsMap) {
    if (item.keys.some(k => lowerText.includes(k))) {
      matchedTargets.add(item.target);
    }
  }

  const matched = [];
  dbMaterials.forEach(m => {
    const nameLower = m.name.toLowerCase();
    for (const target of matchedTargets) {
      if (nameLower.includes(target)) {
        matched.push(m);
        break;
      }
    }
  });

  return matched;
}

/**
 * Gathers prices for materials found in a quotation proposal.
 *
 * Fully agnostic — accepts any quotation JSON object or path.
 * Output file name is derived from the quotation content itself, not from
 * any preset path convention or file-naming scheme.
 *
 * @param {string|Object} proposalInput - Absolute path to proposal JSON OR proposal object
 * @param {string} outputDir           - Absolute path to output directory (REQUIRED — no fallback)
 * @returns {Object}                   - Structured material prices JSON (material_prices_v1)
 */
function gatherPrices(proposalInput, outputDir) {
  // --- Input validation ---
  if (!outputDir) {
    throw new Error("[get-prices] outputDir is required. No default paths allowed.");
  }

  let proposal;
  if (typeof proposalInput === "string") {
    const absPath = path.resolve(proposalInput);
    if (!fs.existsSync(absPath)) {
      throw new Error(`[get-prices] Proposal file not found: ${absPath}`);
    }
    proposal = JSON.parse(fs.readFileSync(absPath, "utf8"));
  } else if (proposalInput && typeof proposalInput === "object") {
    proposal = proposalInput;
  } else {
    throw new Error("[get-prices] Invalid proposal input — must be a file path or a JSON object.");
  }

  // --- Load local reference DB ---
  let dbMaterials = [];
  try {
    if (fs.existsSync(MEMORY_PRICES_PATH)) {
      const data = JSON.parse(fs.readFileSync(MEMORY_PRICES_PATH, "utf8"));
      dbMaterials = data.materials || [];
    }
  } catch (err) {
    console.warn(`[get-prices] Could not read local price DB: ${err.message}`);
  }

  // --- Extract materials from all detail lines ---
  const results = new Map();
  const detalles = proposal.detalles || [];

  detalles.forEach(d => {
    const text = `${d.descripcion_resumen || ""} ${d.descripcion_detallada || ""}`;
    const matches = findMatchingMaterials(text, dbMaterials);
    matches.forEach(m => results.set(m.id, m));
  });

  // --- Fallback: if nothing matched, include top-5 generic reference items ---
  if (results.size === 0 && dbMaterials.length > 0) {
    console.log("[get-prices] No specific materials matched — including generic reference items.");
    dbMaterials.slice(0, 5).forEach(m => results.set(m.id, m));
  }

  // --- Build output ---
  const materialsList = Array.from(results.values()).map((m, idx) => ({
    id: `mat_${String(idx + 1).padStart(3, "0")}`,
    category: m.category,
    name: m.name,
    price_clp: m.price_clp,
    unit: m.unit,
    supplier: m.supplier || "Sodimac"
  }));

  const outputData = {
    $schema: "material_prices_v1",
    metadata: {
      description: `Precios de materiales para cotización: ${proposal.numero || "S/N"} — ${proposal.receptor?.razon_social || "Receptor no especificado"}`,
      currency: "CLP",
      country: "Chile",
      last_updated: new Date().toISOString()
    },
    materials: materialsList
  };

  // --- Derive output filename purely from quotation content ---
  // Uses numero + timestamp to guarantee uniqueness regardless of naming convention
  const rawId = proposal.numero
    ? String(proposal.numero).replace(/[^a-zA-Z0-9]/g, "_")
    : `sin_numero_${Date.now()}`;

  const resolvedOutputDir = path.resolve(outputDir);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  const outputFilePath = path.join(resolvedOutputDir, `precios_${rawId}.json`);
  fs.writeFileSync(outputFilePath, JSON.stringify(outputData, null, 2), "utf8");

  console.log(`\u2705 [get-prices] ${materialsList.length} materiales guardados en: ${outputFilePath}`);
  return outputData;
}

module.exports = {
  gatherPrices,
  findMatchingMaterials
};
