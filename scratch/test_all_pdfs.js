const fs = require("fs");
const path = require("path");
const { parsePdfToJson } = require("../.agent/skills/read-cotiza/reader");

async function run() {
  const dirs = [
    { name: "tareas", path: path.join(__dirname, "../tareas") },
    { name: "fakes", path: path.join(__dirname, "../fakes") }
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir.path)) continue;
    const files = fs.readdirSync(dir.path).filter(f => f.endsWith(".pdf"));
    
    for (const file of files) {
      const pdfPath = path.join(dir.path, file);
      const outputPath = path.join(__dirname, `parsed_${dir.name}_${path.basename(file, ".pdf")}.json`);
      console.log(`\n--- Parsing ${dir.name}/${file} ---`);
      try {
        const res = await parsePdfToJson(pdfPath, outputPath);
        console.log("Success! Totales:");
        console.log(JSON.stringify(res.totales, null, 2));
        console.log("Items parsed:", res.detalles.length);
      } catch (e) {
        console.error("Failed parsing:", e);
      }
    }
  }
}

run();
