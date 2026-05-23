const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const fs = require("fs");
const path = require("path");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const AGENT_DIR = path.join(__dirname);
const SCHEMAS_DIR = path.join(AGENT_DIR, "schemas");

// Load schemas
const skillSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, "skill_v1.json"), "utf8"));
const workflowSchema = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, "workflow_v1.json"), "utf8"));
const systemSchemas = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, "system_v1.json"), "utf8"));
const memorySchemas = JSON.parse(fs.readFileSync(path.join(SCHEMAS_DIR, "memory_v1.json"), "utf8"));

const validators = {
  "skill_v1": ajv.compile(skillSchema),
  "workflow_v1": ajv.compile(workflowSchema),
  "core_v1": ajv.compile(systemSchemas.schemas.core_v1),
  "index_v1": ajv.compile(systemSchemas.schemas.index_v1),
  "manifest_v1": ajv.compile(systemSchemas.schemas.manifest_v1),
  "working_memory_v1": ajv.compile(memorySchemas.schemas.working_memory_v1),
  "episodic_memory_v1": ajv.compile(memorySchemas.schemas.episodic_memory_v1),
  "semantic_memory_v1": ajv.compile(memorySchemas.schemas.semantic_memory_v1),
  "material_prices_v1": ajv.compile(memorySchemas.schemas.material_prices_v1),
};

// Find all JSONs recursively (excluding schemas, node_modules, package.json)
function findJsonFiles(dir) {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === "schemas" || entry.name === "node_modules") continue;
    if (entry.isDirectory()) results = results.concat(findJsonFiles(full));
    else if (entry.name.endsWith(".json") && entry.name !== "package.json" && entry.name !== "package-lock.json")
      results.push(full);
  }
  return results;
}

const files = findJsonFiles(AGENT_DIR);
let passed = 0, failed = 0, skipped = 0;

for (const file of files) {
  const rel = path.relative(AGENT_DIR, file).replace(/\\/g, "/");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const schema = data["$schema"];

  if (!schema) {
    console.log(`⚠️  NO SCHEMA: ${rel}`);
    skipped++;
    continue;
  }

  const validate = validators[schema];
  if (!validate) {
    console.log(`⚠️  UNKNOWN SCHEMA "${schema}": ${rel}`);
    skipped++;
    continue;
  }

  const valid = validate(data);
  if (valid) {
    console.log(`✅ PASS: ${rel}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${rel}`);
    for (const err of validate.errors) {
      console.log(`   → ${err.instancePath || "/"} ${err.message}`);
    }
    failed++;
  }
}

console.log(`\n═══ RESULTADO: ${passed} passed | ${failed} failed | ${skipped} skipped ═══`);
process.exit(failed > 0 ? 1 : 0);
