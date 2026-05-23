const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

const TAREAS_DIR = path.join(__dirname, "..", "tareas");
const FAKES_DIR = path.join(__dirname, "..", "fakes");
const OUTPUT_DIR = path.join(__dirname, "..", "scratch");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function extractPdfText(pdfPath, txtPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    fs.writeFileSync(txtPath, data.text, "utf8");
    console.log(`Extracted: ${path.basename(pdfPath)} -> ${path.basename(txtPath)}`);
  } catch (error) {
    console.error(`Error parsing ${pdfPath}:`, error);
  }
}

async function main() {
  console.log("Starting PDF text extraction...");
  
  const dirs = [
    { dir: TAREAS_DIR, prefix: "tarea_" },
    { dir: FAKES_DIR, prefix: "fake_" }
  ];

  for (const item of dirs) {
    if (!fs.existsSync(item.dir)) {
      console.log(`Directory does not exist: ${item.dir}`);
      continue;
    }
    const files = fs.readdirSync(item.dir);
    for (const file of files) {
      if (path.extname(file).toLowerCase() === ".pdf") {
        const pdfPath = path.join(item.dir, file);
        const txtName = item.prefix + path.basename(file, ".pdf") + ".txt";
        const txtPath = path.join(OUTPUT_DIR, txtName);
        await extractPdfText(pdfPath, txtPath);
      }
    }
  }
  console.log("Text extraction complete.");
}

main();
