const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const { parsePdfToJson } = require("../skills/read-cotiza/reader");
const { analyzeAndMarkupQuotation } = require("../skills/analiza-cotiza/analyzer");

function formatCLP(val) {
  return "$" + Math.round(val).toLocaleString("es-CL").replace(/,/g, ".");
}

/**
 * Renders a structured quotation object to a beautiful PDF using PDFKit
 */
function renderPDF(quote, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "LETTER" });
      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Main Theme Colors
      const primaryColor = "#1a365d"; // Deep blue
      const secondaryColor = "#2b6cb0"; // Medium blue
      const textColor = "#2d3748"; // Dark gray
      const lightGray = "#edf2f7";

      // 1. Header (Emisor)
      doc.fillColor(primaryColor).fontSize(16).text(quote.emisor.razon_social.toUpperCase(), 50, 50, { bold: true });
      doc.fillColor(secondaryColor).fontSize(9).text(`Giro: ${quote.emisor.giro || ""}`, 50, 70);
      doc.fillColor(textColor).text(`Dirección: ${quote.emisor.direccion || ""}`, 50, 82);
      doc.text(`Fono: ${quote.emisor.fono || ""} | Email: ${quote.emisor.email || ""}`, 50, 94);
      doc.text(`RUT: ${quote.emisor.rut || ""}`, 50, 106);

      // Quote title & metadata
      doc.fillColor(primaryColor).fontSize(14).text(`COTIZACIÓN Nº ${quote.numero}`, 380, 50, { align: "right" });
      doc.fillColor(textColor).fontSize(9);
      doc.text(`Fecha Emisión: ${quote.fechas.emision_texto || quote.fechas.emision_iso || ""}`, 380, 70, { align: "right" });
      doc.text(`Fecha Vencimiento: ${quote.fechas.vencimiento_texto || quote.fechas.vencimiento_iso || ""}`, 380, 82, { align: "right" });

      doc.moveTo(50, 125).lineTo(562, 125).strokeColor("#cbd5e0").lineWidth(1).stroke();

      // 2. Client Info
      let y = 140;
      doc.fillColor(primaryColor).fontSize(11).text("DATOS DEL CLIENTE", 50, y, { bold: true });
      y += 18;
      doc.fillColor(textColor).fontSize(9);
      doc.text(`Señor(es): ${quote.receptor.razon_social || ""}`, 50, y);
      doc.text(`RUT: ${quote.receptor.rut || "N/A"}`, 350, y);
      y += 14;
      doc.text(`Dirección Obra: ${quote.receptor.direccion || ""}`, 50, y);
      doc.text(`Comuna: ${quote.receptor.comuna || ""}`, 350, y);

      doc.moveTo(50, y + 20).lineTo(562, y + 20).strokeColor("#cbd5e0").lineWidth(1).stroke();
      y += 30;

      // 3. Table Header
      doc.fillColor(primaryColor).fontSize(11).text("DETALLE DE LA PROPUESTA TÉCNICO-ECONÓMICA", 50, y, { bold: true });
      y += 18;

      const colItem = 50;
      const colDesc = 85;
      const colQty = 350;
      const colUnit = 390;
      const colPrice = 430;
      const colTotal = 495;

      // Draw header background
      doc.rect(50, y, 512, 18).fill(primaryColor);
      doc.fillColor("#ffffff").fontSize(8);
      doc.text("ITEM", colItem + 5, y + 5);
      doc.text("DESCRIPCIÓN DE PARTIDAS", colDesc, y + 5);
      doc.text("CANT", colQty, y + 5);
      doc.text("UNID", colUnit, y + 5);
      doc.text("P. UNIT", colPrice, y + 5);
      doc.text("TOTAL (CLP)", colTotal, y + 5);
      y += 24;

      // Draw rows
      doc.fillColor(textColor).fontSize(8);
      quote.detalles.forEach((d, idx) => {
        // Multi-line description calculation
        const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : "");
        const descHeight = doc.heightOfString(descText, { width: 250 });
        
        // Draw row background tint for alternate lines
        if (idx % 2 === 0) {
          doc.rect(50, y - 4, 512, descHeight + 8).fill(lightGray);
          doc.fillColor(textColor); // Restore fill color
        }

        // Page check
        if (y + descHeight > 700) {
          doc.addPage();
          y = 50;
          // Re-draw table header on new page
          doc.rect(50, y, 512, 18).fill(primaryColor);
          doc.fillColor("#ffffff").fontSize(8);
          doc.text("ITEM", colItem + 5, y + 5);
          doc.text("DESCRIPCIÓN DE PARTIDAS", colDesc, y + 5);
          doc.text("CANT", colQty, y + 5);
          doc.text("UNID", colUnit, y + 5);
          doc.text("P. UNIT", colPrice, y + 5);
          doc.text("TOTAL (CLP)", colTotal, y + 5);
          y += 24;
          doc.fillColor(textColor).fontSize(8);
        }

        doc.text(String(d.item), colItem + 5, y);
        doc.text(descText, colDesc, y, { width: 250 });

        if (d.total > 0) {
          doc.text(String(d.cantidad), colQty, y);
          doc.text(String(d.unidad), colUnit, y);
          doc.text(formatCLP(d.precio_unitario), colPrice, y);
          doc.text(formatCLP(d.total), colTotal, y);
        }

        y += descHeight + 10;
      });

      doc.moveTo(50, y).lineTo(562, y).strokeColor("#cbd5e0").lineWidth(1).stroke();
      y += 15;

      // Page check for totals
      if (y > 650) {
        doc.addPage();
        y = 50;
      }

      // 4. Totals (Right Column)
      const totalsX = 350;
      const valX = 475;
      doc.fillColor(primaryColor).fontSize(9);
      doc.text("SUBTOTAL NETO:", totalsX, y);
      doc.fillColor(textColor).text(formatCLP(quote.totales.monto_neto), valX, y, { align: "right" });
      y += 15;

      doc.fillColor(primaryColor).text("19% IVA:", totalsX, y);
      doc.fillColor(textColor).text(formatCLP(quote.totales.iva_19), valX, y, { align: "right" });
      y += 15;

      doc.moveTo(totalsX, y).lineTo(562, y).strokeColor("#cbd5e0").lineWidth(0.5).stroke();
      y += 5;

      doc.fillColor(primaryColor).fontSize(11).text("TOTAL GENERAL:", totalsX, y, { bold: true });
      doc.fillColor(primaryColor).text(formatCLP(quote.totales.monto_total), valX, y, { align: "right", bold: true });
      y += 30;

      // Page check for conditions
      if (y > 620) {
        doc.addPage();
        y = 50;
      }

      // 5. Conditions & Payment Details
      doc.moveTo(50, y).lineTo(562, y).strokeColor("#cbd5e0").lineWidth(1).stroke();
      y += 15;

      doc.fillColor(primaryColor).fontSize(10).text("CONDICIONES COMERCIALES Y GENERALES", 50, y, { bold: true });
      y += 15;
      doc.fillColor(textColor).fontSize(8);
      
      const condList = quote.observaciones || [];
      condList.forEach(c => {
        const textHeight = doc.heightOfString(`• ${c}`, { width: 500 });
        if (y + textHeight > 750) {
          doc.addPage();
          y = 50;
        }
        doc.text(`• ${c}`, 50, y, { width: 500 });
        y += textHeight + 4;
      });

      y += 10;
      if (y + 60 > 750) {
        doc.addPage();
        y = 50;
      }

      // Bank Details block
      if (quote.emisor.datos_pago) {
        doc.rect(50, y, 512, 55).fill("#f7fafc");
        doc.fillColor(primaryColor).fontSize(8).text("DATOS PARA TRANSFERENCIA BANCARIA:", 60, y + 8, { bold: true });
        doc.fillColor(textColor);
        doc.text(`Banco: ${quote.emisor.datos_pago.banco} | Tipo: ${quote.emisor.datos_pago.tipo_cuenta}`, 60, y + 20);
        doc.text(`Nº Cuenta: ${quote.emisor.datos_pago.numero_cuenta} | Titular: ${quote.emisor.datos_pago.titular}`, 60, y + 32);
        doc.text(`RUT: ${quote.emisor.datos_pago.rut} | Aviso: ${quote.emisor.datos_pago.email_aviso}`, 60, y + 44);
      }

      doc.end();

      writeStream.on("finish", () => resolve(outputPath));
      writeStream.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Derives a safe filesystem suffix from ANY pdf file path.
 * Pure sanitization — no pattern-matching on document naming conventions.
 * @param {string} filePath
 * @returns {string}
 */
function getCleanSuffix(filePath) {
  return path.basename(filePath, ".pdf")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .substring(0, 40);
}

function getNumericId(quoteNum) {
  if (!quoteNum) return Date.now();
  const match = String(quoteNum).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Date.now();
}

/**
 * Orchestrates the full make-fake-pdf workflow
 */
async function executeWorkflow(inputPdfPath) {
  console.log(`\n=== INICIANDO WORKFLOW MAKE-FAKE-PDF ===`);
  console.log(`Archivo PDF Entrada: ${path.basename(inputPdfPath)}`);

  const suffix = getCleanSuffix(inputPdfPath);

  // Paths
  const scratchDir = path.join(__dirname, "../../scratch");
  const parsedJsonPath = path.join(scratchDir, `parsed_quote_${suffix}.json`);
  const construmaxProfilePath = path.join(__dirname, "../../empresas/construmax.json");
  const convectorProfilePath = path.join(__dirname, "../../empresas/convector.json");

  const construmaxPdfOutput = path.join(scratchDir, `Propuesta_Economica_CONSTRUMAX_${suffix}.pdf`);
  const convectorPdfOutput = path.join(scratchDir, `Propuesta_Economica_CONVECTOR_${suffix}.pdf`);

  // 1. Read PDF
  console.log("\n[Fase 1] Extrayendo y estructurando cotización de entrada...");
  const rawQuotation = await parsePdfToJson(inputPdfPath, parsedJsonPath);

  const numericId = getNumericId(rawQuotation.numero);

  // 2. Generate Construmax Alternative
  console.log("\n[Fase 2-3] Generando propuesta alternativa para CONSTRUMAX...");
  const construmaxProfile = JSON.parse(fs.readFileSync(construmaxProfilePath, "utf8"));
  
  // Apply 22% Surcharge and upgrade specs
  let construmaxQuote = analyzeAndMarkupQuotation(rawQuotation, 22);
  construmaxQuote.emisor = construmaxProfile;
  construmaxQuote.numero = `CM-2026-${numericId}`; // Custom document format for Construmax
  
  // Format bank payment terms
  construmaxQuote.observaciones = [
    "Validez de la oferta: 15 días corridos a partir de la emisión.",
    "Forma de Pago: 50% Anticipo contra aprobación y 50% Recepción Conforme.",
    `Plazo de entrega estimado: 5 días hábiles.`,
    `Todos los trabajos consideran personal calificado con Ley de Accidentes del Trabajo al día.`
  ];

  await renderPDF(construmaxQuote, construmaxPdfOutput);
  console.log(`✅ PDF Construmax generado: ${construmaxPdfOutput}`);

  // 3. Generate Convector Alternative
  console.log("\n[Fase 4-5] Generando propuesta alternativa para CONVECTOR...");
  const convectorProfile = JSON.parse(fs.readFileSync(convectorProfilePath, "utf8"));
  
  // Apply 28% Surcharge (diferente) and upgrade specs
  let convectorQuote = analyzeAndMarkupQuotation(rawQuotation, 28);
  convectorQuote.emisor = convectorProfile;
  convectorQuote.numero = `CV-${String(numericId).padStart(4, '0')}/2026`; // Custom document format for Convector

  // Format different bank payment terms
  convectorQuote.observaciones = [
    "Validez de la oferta: 30 días corridos.",
    "Forma de Pago: Estado de Pago único contra recepción municipal o aprobación técnica 100%.",
    `Plazo de entrega estimado: 4 días hábiles de corrido.`,
    `Garantía de las obras: 12 meses contra defectos de fabricación o montaje.`
  ];

  await renderPDF(convectorQuote, convectorPdfOutput);
  console.log(`✅ PDF Convector generado: ${convectorPdfOutput}`);

  return {
    success: true,
    files: [construmaxPdfOutput, convectorPdfOutput],
    construmaxTotal: construmaxQuote.totales.monto_total,
    convectorTotal: convectorQuote.totales.monto_total
  };
}

module.exports = {
  executeWorkflow,
  renderPDF
};

// Only executes when invoked directly with an explicit PDF path argument.
// No auto-discovery, no default targets. Zero action without explicit invocation.
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("\n❌ ERROR: Se requiere la ruta al PDF como argumento.");
    console.error("   Uso: node make_fake_pdf.js <ruta_absoluta_al_pdf>");
    process.exit(1);
  }

  const targetPdf = path.resolve(args[0]);

  if (!fs.existsSync(targetPdf)) {
    console.error(`\n❌ ERROR: Archivo no encontrado: ${targetPdf}`);
    process.exit(1);
  }

  executeWorkflow(targetPdf).then(res => {
    console.log("\n=== WORKFLOW COMPLETADO ===");
    console.log(`Construmax Total: ${formatCLP(res.construmaxTotal)}`);
    console.log(`Convector Total: ${formatCLP(res.convectorTotal)}`);
  }).catch(err => {
    console.error("\n❌ Workflow falló:", err.message || err);
    process.exit(1);
  });
}
