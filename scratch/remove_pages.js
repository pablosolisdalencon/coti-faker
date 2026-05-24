module.paths.push('d:/EPIC/coti-faker/.agent/node_modules');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function removePages() {
  const filePath = 'd:\\EPIC\\coti-faker\\resultados\\Cierre_Perimetral_para_Bicicletero_Torre_DFS_maderas_spa.pdf';
  const pdfBytes = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  const pageCount = pdfDoc.getPageCount();
  console.log(`Original page count: ${pageCount}`);
  
  // Remove pages from end to beginning to avoid index shifting issues
  if (pageCount >= 5) {
    pdfDoc.removePage(4);
    pdfDoc.removePage(3);
    pdfDoc.removePage(2);
    console.log("Removed pages index 4, 3, and 2.");
  } else {
    console.log("PDF does not have at least 5 pages.");
  }
  
  const modifiedPdfBytes = await pdfDoc.save();
  fs.writeFileSync(filePath, modifiedPdfBytes);
  console.log("Pages modified successfully.");
}

removePages().catch(err => {
  console.error("Error modifying PDF:", err);
  process.exit(1);
});
