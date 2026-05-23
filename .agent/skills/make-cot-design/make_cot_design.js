const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const PDFDocument = require("pdfkit");
const { parsePdfToJson } = require("../read-cotiza/reader");

/**
 * Clean and extract a brand name from logo path/filename
 * @param {string} logoPath 
 * @returns {string}
 */
function getBrandNameFromLogo(logoPath) {
  const base = path.basename(logoPath, path.extname(logoPath));
  return base
    .replace(/^logo[_-]/i, "")
    .replace(/[-_]/g, " ")
    .toUpperCase();
}

/**
 * Converts r, g, b components to Hex string
 */
function rgbToHex(r, g, b) {
  const toHex = (c) => {
    const hex = Math.max(0, Math.min(255, Math.round(c))).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return "#" + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Calculates Euclidean distance between two colors
 */
function getColorDistance(c1, c2) {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Darkens/Lightens a color by a factor
 */
function adjustColor(color, factor) {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r * factor))),
    g: Math.max(0, Math.min(255, Math.round(color.g * factor))),
    b: Math.max(0, Math.min(255, Math.round(color.b * factor)))
  };
}

/**
 * Extracts dominant colors from a PNG file using zlib.
 * Pure JS — no native binary dependencies.
 * @param {string} filePath 
 * @returns {Array<{r:number, g:number, b:number}>|null}
 */
function extractPngColors(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    
    // Validate PNG signature
    if (buf.readUInt32BE(0) !== 0x89504E47 || buf.readUInt32BE(4) !== 0x0D0A1A0A) {
      return null;
    }
    
    let pos = 8;
    let width = 0, height = 0, colorType = 0, depth = 0;
    let plteBuffer = null;
    let idatBuffers = [];
    
    while (pos < buf.length) {
      if (pos + 8 > buf.length) break;
      const length = buf.readUInt32BE(pos);
      const type = buf.toString("ascii", pos + 4, pos + 8);
      pos += 8;
      
      if (pos + length > buf.length) break;
      const chunkData = buf.subarray(pos, pos + length);
      pos += length;
      
      // Skip CRC (4 bytes)
      pos += 4;
      
      if (type === "IHDR") {
        width = chunkData.readUInt32BE(0);
        height = chunkData.readUInt32BE(4);
        depth = chunkData[8];
        colorType = chunkData[9];
      } else if (type === "PLTE") {
        plteBuffer = chunkData;
      } else if (type === "IDAT") {
        idatBuffers.push(chunkData);
      } else if (type === "IEND") {
        break;
      }
    }
    
    if (idatBuffers.length === 0) return null;
    
    // If indexed color (PLTE chunk exists)
    if (colorType === 3 && plteBuffer) {
      const colors = [];
      for (let i = 0; i < plteBuffer.length; i += 3) {
        colors.push({
          r: plteBuffer[i],
          g: plteBuffer[i+1],
          b: plteBuffer[i+2]
        });
      }
      return colors;
    }
    
    // Otherwise decompress pixel stream
    const compressed = Buffer.concat(idatBuffers);
    const uncompressed = zlib.inflateSync(compressed);
    
    let bytesPerPixel = 3;
    if (colorType === 6) bytesPerPixel = 4;
    else if (colorType === 0) bytesPerPixel = 1;
    else if (colorType === 4) bytesPerPixel = 2;
    
    const scanlineLength = 1 + width * bytesPerPixel;
    const colorCounts = {};
    
    // Sample scanlines to optimize speed
    const step = Math.max(1, Math.floor(height / 40));
    for (let y = 0; y < height; y += step) {
      const offset = y * scanlineLength;
      if (offset + scanlineLength > uncompressed.length) break;
      const row = uncompressed.subarray(offset + 1, offset + scanlineLength);
      
      for (let x = 0; x < width; x += 4) {
        const pxIdx = x * bytesPerPixel;
        if (pxIdx + bytesPerPixel > row.length) break;
        
        let r, g, b, a = 255;
        if (bytesPerPixel === 4) {
          r = row[pxIdx];
          g = row[pxIdx + 1];
          b = row[pxIdx + 2];
          a = row[pxIdx + 3];
        } else if (bytesPerPixel === 3) {
          r = row[pxIdx];
          g = row[pxIdx + 1];
          b = row[pxIdx + 2];
        } else {
          r = g = b = row[pxIdx];
        }
        
        // Filter out transparent, white and near-black colors
        if (a < 50) continue;
        if (r > 240 && g > 240 && b > 240) continue;
        if (r < 20 && g < 20 && b < 20) continue;
        
        const key = `${r},${g},${b}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
      }
    }
    
    return Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .map(entry => {
        const [r, g, b] = entry[0].split(",").map(Number);
        return { r, g, b, count: entry[1] };
      });
  } catch (err) {
    console.warn(`PNG extraction failed for file: ${path.basename(filePath)} - ${err.message}`);
    return null;
  }
}

/**
 * Standard corporate palettes for known brands/fallbacks
 */
const PRESETS = {
  CONSTRUMAX: { primary: "#D32F2F", secondary: "#37474F" },
  CONVECTOR: { primary: "#1B5E20", secondary: "#E65100" },
  PRIMESERVICE: { primary: "#0D47A1", secondary: "#FFB300" },
  DEFAULT: { primary: "#1A365D", secondary: "#2B6CB0" }
};

/**
 * Resolve colors for a logo path
 */
function resolveColorsForLogo(logoPath) {
  const brand = getBrandNameFromLogo(logoPath);
  
  // 1. Check if we have preset matching
  const presetKey = Object.keys(PRESETS).find(k => brand.includes(k));
  if (presetKey && PRESETS[presetKey]) {
    return PRESETS[presetKey];
  }
  
  // 2. Try raw extraction
  const extracted = extractPngColors(logoPath);
  if (extracted && extracted.length > 0) {
    const primaryRGB = extracted[0];
    let secondaryRGB = null;
    
    // Find secondary with enough contrast/distance
    for (let i = 1; i < extracted.length; i++) {
      if (getColorDistance(primaryRGB, extracted[i]) > 80) {
        secondaryRGB = extracted[i];
        break;
      }
    }
    
    // Fallback if no contrasting secondary color found
    if (!secondaryRGB) {
      secondaryRGB = adjustColor(primaryRGB, primaryRGB.r + primaryRGB.g + primaryRGB.b > 380 ? 0.6 : 1.4);
    }
    
    return {
      primary: rgbToHex(primaryRGB.r, primaryRGB.g, primaryRGB.b),
      secondary: rgbToHex(secondaryRGB.r, secondaryRGB.g, secondaryRGB.b)
    };
  }
  
  // 3. Fallback based on deterministic hash of the filename
  let hash = 0;
  for (let i = 0; i < brand.length; i++) {
    hash = brand.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const fallbackColors = [
    { primary: "#2c3e50", secondary: "#18bc9c" }, // Slate / Teal
    { primary: "#8e44ad", secondary: "#3498db" }, // Purple / Blue
    { primary: "#d35400", secondary: "#2c3e50" }, // Orange / Dark Gray
    { primary: "#27ae60", secondary: "#2980b9" }, // Green / Blue
    { primary: "#c0392b", secondary: "#7f8c8d" }  // Red / Slate
  ];
  
  const index = Math.abs(hash) % fallbackColors.length;
  return fallbackColors[index];
}

/**
 * Resolve/load corporate profile for a logo path
 */
function resolveProfileForLogo(logoPath) {
  const brand = getBrandNameFromLogo(logoPath).toLowerCase().replace(/\s+/g, "");
  
  // Try to find matching profile in empresas directory
  const empresasDir = path.join(__dirname, "../../../empresas");
  const possiblePaths = [
    path.join(empresasDir, `${brand}.json`),
    path.join(empresasDir, `logo-${brand}.json`),
    path.join(empresasDir, `logo_${brand}.json`)
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch (err) {
        console.warn(`Error reading profile file ${p}: ${err.message}`);
      }
    }
  }
  
  // Mock fallback profile if no JSON exists
  const cleanBrand = getBrandNameFromLogo(logoPath);
  return {
    razon_social: `${cleanBrand} SPA`,
    rut: "76.999.888-K",
    giro: "MANTENCIÓN, OBRAS CIVILES Y SERVICIOS ESTRUCTURALES GENERALES",
    direccion: "Av. Industrial 4550, Las Condes, Santiago",
    fono: "+56 2 2888 7777",
    email: `contacto@${cleanBrand.toLowerCase().replace(/\s+/g, "")}.cl`,
    sitio_web: `www.${cleanBrand.toLowerCase().replace(/\s+/g, "")}.cl`,
    datos_pago: {
      titular: `${cleanBrand} SPA`,
      rut: "76.999.888-K",
      banco: "Banco del Estado de Chile",
      tipo_cuenta: "Cuenta Corriente",
      numero_cuenta: "22-888-44444-9",
      email_aviso: `finanzas@${cleanBrand.toLowerCase().replace(/\s+/g, "")}.cl`
    }
  };
}

/**
 * Format CLP Currency
 */
function formatCLP(val) {
  return "$" + Math.round(val).toLocaleString("es-CL").replace(/,/g, ".");
}

/**
 * Helper to draw a circular approval stamp
 */
function drawApprovalStamp(doc, x, y, color) {
  doc.save();
  doc.translate(x, y);
  doc.rotate(-12); // Slightly tilted stamp

  // Outer circles
  doc.strokeColor(color).lineWidth(1.5);
  doc.circle(0, 0, 26).stroke();
  doc.lineWidth(0.5);
  doc.circle(0, 0, 23).stroke();

  // Text
  doc.fillColor(color);
  doc.fontSize(5.5).text("DOCUMENTO", -22, -14, { width: 44, align: "center", bold: true });
  doc.fontSize(7.5).text("APROBADO", -22, -3, { width: 44, align: "center", bold: true });
  doc.fontSize(5.5).text("PROYECTOS", -22, 8, { width: 44, align: "center" });

  doc.restore();
}

/**
 * ---------------------------------------------------------
 * LAYOUT 1: MINIMALIST LINE FORM (Inspirado en cotizacion-webdesign-sample-01)
 * ---------------------------------------------------------
 */
function renderMinimalistDesign(quote, logoPath, colors, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 45, size: "LETTER" });
      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const pColor = colors.primary;
      const sColor = colors.secondary;
      const tColor = "#2d3748";
      const lightBorder = "#cbd5e0";

      let y = 40;

      // 1. Header Row
      // Logo and emisor name (Left)
      if (logoPath && fs.existsSync(logoPath)) {
        doc.image(logoPath, 45, y, { fit: [95, 32] });
        doc.fillColor(tColor).fontSize(7.5).text(quote.emisor.razon_social, 150, y + 5, { width: 170, bold: true });
        doc.fontSize(6.5).text(`Email: ${quote.emisor.email} | Web: ${quote.emisor.sitio_web || "N/A"}`, 150, y + 15);
        doc.text(`Dirección: ${quote.emisor.direccion}`, 150, y + 23, { width: 170 });
      } else {
        doc.fillColor(pColor).fontSize(12).text(quote.emisor.razon_social, 45, y, { bold: true });
        doc.fillColor(tColor).fontSize(7).text(`RUT: ${quote.emisor.rut} | Giro: ${quote.emisor.giro}`, 45, y + 15);
      }

      // Title and Metadata Grid Table (Right)
      doc.fillColor(pColor).fontSize(20).text("COTIZACIÓN", 350, y - 5, { align: "right", bold: true });
      
      // Draw small metadata grid
      const gridX = 407;
      const gridY = y + 16;
      doc.rect(gridX, gridY, 160, 26).strokeColor(lightBorder).lineWidth(0.5).stroke();
      doc.moveTo(gridX + 80, gridY).lineTo(gridX + 80, gridY + 26).stroke();
      doc.moveTo(gridX, gridY + 12).lineTo(gridX + 160, gridY + 12).stroke();
      
      doc.fillColor(pColor).fontSize(6.5);
      doc.text("FECHA", gridX, gridY + 3, { width: 80, align: "center", bold: true });
      doc.text("NÚMERO", gridX + 80, gridY + 3, { width: 80, align: "center", bold: true });
      
      doc.fillColor(tColor).fontSize(7);
      doc.text(quote.fechas.emision_texto.split(" de ").slice(0, 3).join("/"), gridX, gridY + 15, { width: 80, align: "center" });
      doc.text(quote.numero.toString().replace(/[^0-9]/g, "") || "159", gridX + 80, gridY + 15, { width: 80, align: "center" });

      y += 65;

      // 2. Client form-fill fields (Horizontal lines)
      doc.fillColor(pColor).fontSize(8).text("PREPARADO PARA:", 45, y, { bold: true });
      y += 12;

      // Draw client rows
      doc.fillColor(tColor).fontSize(7.5);
      
      // Line 1: Cliente & Email
      doc.text("Cliente:", 45, y);
      doc.text(quote.receptor.razon_social, 90, y, { bold: true });
      doc.moveTo(90, y + 8).lineTo(340, y + 8).strokeColor(lightBorder).lineWidth(0.5).stroke();
      
      doc.text("Email:", 355, y);
      doc.text(quote.emisor.email, 390, y);
      doc.moveTo(390, y + 8).lineTo(567, y + 8).stroke();

      y += 18;

      // Line 2: Teléfono & Dirección
      doc.text("Teléfono:", 45, y);
      doc.text(quote.emisor.fono, 90, y);
      doc.moveTo(90, y + 8).lineTo(220, y + 8).stroke();

      doc.text("Dirección:", 235, y);
      doc.text(`${quote.receptor.direccion}, ${quote.receptor.comuna}`, 290, y, { width: 277 });
      doc.moveTo(290, y + 8).lineTo(567, y + 8).stroke();

      y += 28;

      // 3. Project Description box
      doc.fillColor(pColor).fontSize(8).text("DESCRIPCIÓN DEL PROYECTO / ALCANCE", 45, y, { bold: true });
      y += 10;
      doc.rect(45, y, 522, 36).strokeColor(lightBorder).lineWidth(0.5).stroke();
      
      doc.fillColor(tColor).fontSize(7.5);
      const descPartidas = quote.detalles.map(d => d.descripcion_resumen).join(", ");
      doc.text(`Servicios de mantención integral considerando: ${descPartidas}. Todos los trabajos consideran personal técnico, materiales y herramientas necesarias.`, 52, y + 6, { width: 508 });

      y += 55;

      // 4. Closed layout Table
      const colItem = 45;
      const colDesc = 80;
      const colQty = 370;
      const colPrice = 415;
      const colTotal = 495;

      const tableHeaderY = y;
      doc.rect(45, y, 522, 16).strokeColor(tColor).lineWidth(1).stroke();
      
      doc.fillColor(tColor).fontSize(7.5);
      doc.text("CANT.", colItem + 5, y + 4, { bold: true });
      doc.text("DESCRIPCIÓN DE PARTIDAS", colDesc, y + 4, { bold: true });
      doc.text("PRECIO U.", colPrice, y + 4, { align: "right", width: 70, bold: true });
      doc.text("TOTAL", colTotal, y + 4, { align: "right", width: 67, bold: true });

      y += 16;
      const tableBodyStartY = y;

      // Draw rows
      quote.detalles.forEach((d, idx) => {
        const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : "");
        const descHeight = doc.heightOfString(descText, { width: 280 }) + 8;

        if (y + descHeight > 620) {
          // Draw bottom of current table block
          doc.rect(45, tableBodyStartY, 522, y - tableBodyStartY).strokeColor(tColor).lineWidth(0.5).stroke();
          // Draw vertical split lines
          doc.moveTo(colDesc - 2, tableBodyStartY).lineTo(colDesc - 2, y).stroke();
          doc.moveTo(colPrice - 2, tableBodyStartY).lineTo(colPrice - 2, y).stroke();
          doc.moveTo(colTotal - 2, tableBodyStartY).lineTo(colTotal - 2, y).stroke();

          doc.addPage();
          y = 45;
          doc.rect(45, y, 522, 16).strokeColor(tColor).lineWidth(1).stroke();
          doc.fillColor(tColor).fontSize(7.5);
          doc.text("CANT.", colItem + 5, y + 4, { bold: true });
          doc.text("DESCRIPCIÓN DE PARTIDAS", colDesc, y + 4, { bold: true });
          doc.text("PRECIO U.", colPrice, y + 4, { align: "right", width: 70, bold: true });
          doc.text("TOTAL", colTotal, y + 4, { align: "right", width: 67, bold: true });
          y += 16;
        }

        doc.fillColor(tColor).fontSize(7.5);
        doc.text(String(d.cantidad), colItem + 5, y + 4, { align: "center", width: 25 });
        doc.text(descText, colDesc, y + 4, { width: 280 });
        doc.text(formatCLP(d.precio_unitario), colPrice, y + 4, { align: "right", width: 70 });
        doc.text(formatCLP(d.total), colTotal, y + 4, { align: "right", width: 67 });

        y += descHeight;
      });

      // Draw table borders & vertical grid lines extending down to bottom of table
      doc.rect(45, tableBodyStartY, 522, y - tableBodyStartY).strokeColor(tColor).lineWidth(0.5).stroke();
      doc.moveTo(colDesc - 2, tableBodyStartY).lineTo(colDesc - 2, y).stroke();
      doc.moveTo(colPrice - 2, tableBodyStartY).lineTo(colPrice - 2, y).stroke();
      doc.moveTo(colTotal - 2, tableBodyStartY).lineTo(colTotal - 2, y).stroke();

      y += 15;

      // 5. Footer and Totals Grid
      if (y > 620) {
        doc.addPage();
        y = 45;
      }

      const footerStartY = y;

      // Left terms
      doc.fillColor(tColor).fontSize(7);
      doc.text("Esta cotización está sujeta a los siguientes términos:", 45, y, { bold: true });
      y += 10;
      doc.text("• Se requiere un depósito del 50% para comenzar las obras.", 45, y);
      doc.text("• Oferta válida por los próximos 30 días corridos.", 45, y + 10);
      doc.text("• Garantía de 12 meses sobre zonas intervenidas.", 45, y + 20);

      // Right totals grid matching the columns
      y = footerStartY;
      const totalsGridX = colPrice - 2;
      const cellW1 = colTotal - colPrice; // ~80
      const cellW2 = 567 - colTotal;     // ~72
      
      doc.rect(totalsGridX, y, 120, 42).strokeColor(tColor).lineWidth(0.5).stroke();
      doc.moveTo(totalsGridX, y + 14).lineTo(totalsGridX + 120, y + 14).stroke();
      doc.moveTo(totalsGridX, y + 28).lineTo(totalsGridX + 120, y + 28).stroke();
      doc.moveTo(colTotal - 2, y).lineTo(colTotal - 2, y + 42).stroke();

      doc.fillColor(tColor).fontSize(7);
      doc.text("SUB TOTAL", totalsGridX + 5, y + 4, { bold: true });
      doc.text(formatCLP(quote.totales.monto_neto), colTotal + 5, y + 4, { align: "right", width: 62 });

      doc.text("IVA (19%)", totalsGridX + 5, y + 18, { bold: true });
      doc.text(formatCLP(quote.totales.iva_19), colTotal + 5, y + 18, { align: "right", width: 62 });

      doc.text("TOTAL", totalsGridX + 5, y + 32, { bold: true });
      doc.text(formatCLP(quote.totales.monto_total), colTotal + 5, y + 32, { align: "right", width: 62, bold: true });

      y += 55;

      // 6. Signatures and rotative seal stamp
      doc.text("Recibido y Aceptado:", 45, y);
      doc.moveTo(45, y + 30).lineTo(180, y + 30).strokeColor(lightBorder).lineWidth(0.5).stroke();
      
      doc.text("Aprobado por Emisor:", 250, y);
      doc.moveTo(250, y + 30).lineTo(380, y + 30).stroke();

      // Dynamic rotated stamp!
      drawApprovalStamp(doc, 480, y + 15, sColor);

      doc.end();
      writeStream.on("finish", () => resolve(outputPath));
      writeStream.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * ---------------------------------------------------------
 * LAYOUT 2: DIAGONAL RIBBON EXECUTIVE (Inspirado en b6769c01-3a08)
 * ---------------------------------------------------------
 */
function renderBoldExecutiveDesign(quote, logoPath, colors, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 45, size: "LETTER" });
      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const pColor = colors.primary;
      const sColor = colors.secondary;
      const tColor = "#2d3748";
      const lightBG = "#f8fafc";
      const lightBorder = "#cbd5e0";

      let y = 35;

      // 1. Split Header (Title left, logo right)
      doc.fillColor(pColor).fontSize(16).text("Propuesta Comercial de Cotización", 45, y, { bold: true });
      doc.fillColor(tColor).fontSize(8).text("SERVICIOS DE CONSTRUCCIÓN Y OBRAS MENORES", 45, y + 18);

      if (logoPath && fs.existsSync(logoPath)) {
        doc.image(logoPath, 420, y - 5, { fit: [147, 40] });
      } else {
        doc.fillColor(sColor).fontSize(12).text(quote.emisor.razon_social, 420, y, { align: "right", bold: true });
      }

      y += 45;

      // 2. Diagonal Cut Banners for Info Headers
      // Left ribbon: CLIENTE
      doc.save();
      doc.fillColor(pColor);
      // Draw bisel-cut banner: polygon [(45, y), (280, y), (265, y+16), (45, y+16)]
      doc.polygon([45, y], [270, y], [255, y + 16], [45, y + 16]);
      doc.fill();
      doc.fillColor("#ffffff").fontSize(7.5).text("INFORMACIÓN DEL CLIENTE", 52, y + 4, { bold: true });
      doc.restore();

      // Right ribbon: DATE
      doc.save();
      doc.fillColor(sColor);
      // Draw bisel-cut banner: polygon [(285, y), (567, y), (567, y+16), (270, y+16)]
      doc.polygon([280, y], [567, y], [567, y + 16], [265, y + 16]);
      doc.fill();
      doc.fillColor("#ffffff").fontSize(7.5).text(`FECHA DE EMISIÓN: ${quote.fechas.emision_texto}`, 290, y + 4, { bold: true });
      doc.restore();

      y += 24;

      // Info Fields
      const fieldY = y;
      doc.fillColor(tColor).fontSize(8);
      doc.text(`Nombre: ${quote.receptor.razon_social}`, 45, y);
      doc.text(`RUT: ${quote.receptor.rut}`, 45, y + 12);
      doc.text(`Dirección Obra: ${quote.receptor.direccion}`, 45, y + 24);

      doc.text(`Fono Cliente: ${quote.emisor.fono}`, 310, y);
      doc.text(`Email: ${quote.emisor.email}`, 310, y + 12);
      doc.text(`Comuna: ${quote.receptor.comuna}`, 310, y + 24);

      y += 45;

      // 3. Diagonal Cut Banner for Table
      doc.save();
      doc.fillColor(pColor);
      doc.polygon([45, y], [320, y], [305, y + 16], [45, y + 16]);
      doc.fill();
      doc.fillColor("#ffffff").fontSize(7.5).text("SERVICIOS Y PARTIDAS CONTRATADAS", 52, y + 4, { bold: true });
      doc.restore();

      y += 24;

      // Table (with colored index column)
      const colItem = 45;
      const colDesc = 80;
      const colQty = 360;
      const colUnit = 405;
      const colPrice = 450;
      const colTotal = 510;

      // Table Header (Solid Dark)
      doc.rect(45, y, 522, 18).fill("#1a202c");
      doc.fillColor("#ffffff").fontSize(8);
      doc.text("No.", colItem + 5, y + 5, { bold: true });
      doc.text("DESCRIPCIÓN DETALLADA", colDesc, y + 5, { bold: true });
      doc.text("CANT", colQty, y + 5, { align: "right", width: 35, bold: true });
      doc.text("UNID", colUnit, y + 5, { align: "center", width: 35, bold: true });
      doc.text("PRECIO", colPrice, y + 5, { align: "right", width: 50, bold: true });
      doc.text("TOTAL", colTotal, y + 5, { align: "right", width: 52, bold: true });

      y += 18;

      quote.detalles.forEach((d, idx) => {
        const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : "");
        const descHeight = doc.heightOfString(descText, { width: 270 }) + 8;

        if (y + descHeight > 620) {
          doc.addPage();
          y = 45;
          doc.rect(45, y, 522, 18).fill("#1a202c");
          doc.fillColor("#ffffff").fontSize(8);
          doc.text("No.", colItem + 5, y + 5, { bold: true });
          doc.text("DESCRIPCIÓN DETALLADA", colDesc, y + 5, { bold: true });
          doc.text("CANT", colQty, y + 5, { align: "right", width: 35, bold: true });
          doc.text("UNID", colUnit, y + 5, { align: "center", width: 35, bold: true });
          doc.text("PRECIO", colPrice, y + 5, { align: "right", width: 50, bold: true });
          doc.text("TOTAL", colTotal, y + 5, { align: "right", width: 52, bold: true });
          y += 18;
        }

        // Draw light horizontal divider
        doc.moveTo(45, y).lineTo(567, y).strokeColor(lightBorder).lineWidth(0.5).stroke();

        // Shaded column for Item Number (using secondary color tint)
        doc.rect(colItem, y, 30, descHeight).fill(lightBG);
        
        doc.fillColor(pColor).fontSize(8).text(String(d.item), colItem + 5, y + 4, { align: "center", width: 20, bold: true });
        
        doc.fillColor(tColor).fontSize(7.5);
        doc.text(descText, colDesc, y + 4, { width: 270 });
        doc.text(String(d.cantidad), colQty, y + 4, { align: "right", width: 35 });
        doc.text(String(d.unidad), colUnit, y + 4, { align: "center", width: 35 });
        doc.text(formatCLP(d.precio_unitario), colPrice, y + 4, { align: "right", width: 50 });
        
        // Highlight Total Column
        doc.fillColor(pColor).text(formatCLP(d.total), colTotal, y + 4, { align: "right", width: 52, bold: true });

        y += descHeight;
      });

      doc.moveTo(45, y).lineTo(567, y).strokeColor(pColor).lineWidth(1).stroke();
      y += 15;

      if (y > 630) {
        doc.addPage();
        y = 45;
      }

      // Totals
      const totalColX = 350;
      const totalValX = 470;
      
      doc.fillColor(tColor).fontSize(8);
      doc.text("SUBTOTAL NETO:", totalColX, y);
      doc.text(formatCLP(quote.totales.monto_neto), totalValX, y, { align: "right", width: 92 });
      y += 14;

      doc.text("19% IVA:", totalColX, y);
      doc.text(formatCLP(quote.totales.iva_19), totalValX, y, { align: "right", width: 92 });
      y += 16;

      // Bold highlight total bar
      doc.rect(totalColX - 5, y - 4, 227, 20).fill(sColor);
      doc.fillColor("#ffffff").fontSize(9).text("TOTAL COTIZADO:", totalColX, y, { bold: true });
      doc.text(formatCLP(quote.totales.monto_total), totalValX, y, { align: "right", width: 92, bold: true });

      y += 30;

      // T&C Section
      doc.fillColor(pColor).fontSize(8.5).text("Términos y Condiciones Comerciales", 45, y, { bold: true });
      y += 12;
      doc.fillColor(tColor).fontSize(7.5);
      quote.observaciones.forEach(obs => {
        doc.text(`• ${obs}`, 45, y, { width: 522 });
        y += doc.heightOfString(`• ${obs}`, { width: 522 }) + 2;
      });

      // Split footer (solid left block for emisor, signatures right)
      y = 695;
      doc.rect(0, y, 612, 72).fill("#f1f5f9"); // light bottom bar
      doc.rect(45, y + 10, 220, 52).fill(pColor); // emisor block
      
      // Emisor Info
      doc.fillColor("#ffffff").fontSize(7.5).text(quote.emisor.razon_social.toUpperCase(), 55, y + 16, { bold: true });
      doc.fontSize(6.5);
      doc.text(`Email: ${quote.emisor.email}`, 55, y + 28);
      doc.text(`Tel: ${quote.emisor.fono}`, 55, y + 38);
      doc.text(`Web: ${quote.emisor.sitio_web || "www.primeservice.cl"}`, 55, y + 48);

      // Signatures
      doc.fillColor(tColor).fontSize(7);
      doc.text("Firma Cliente", 310, y + 16, { bold: true });
      doc.moveTo(310, y + 44).lineTo(420, y + 44).strokeColor(lightBorder).lineWidth(0.5).stroke();
      
      doc.text("Firma Emisor", 455, y + 16, { bold: true });
      doc.moveTo(455, y + 44).lineTo(565, y + 44).stroke();

      doc.end();
      writeStream.on("finish", () => resolve(outputPath));
      writeStream.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * ---------------------------------------------------------
 * LAYOUT 3: TIMELINE SPLIT HEADER (Inspirado en 3826b05897)
 * ---------------------------------------------------------
 */
function renderTechnicalGridDesign(quote, logoPath, colors, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 45, size: "LETTER" });
      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      const pColor = colors.primary;
      const sColor = colors.secondary;
      const tColor = "#2d3748";
      const lightBorder = "#cbd5e0";

      // 1. Dark Top Header Block (covers top 1/3, y=0 to y=125)
      doc.rect(0, 0, 612, 125).fill("#1a202c"); // Dark charcoal

      // Logo
      if (logoPath && fs.existsSync(logoPath)) {
        doc.image(logoPath, 45, 20, { fit: [120, 36] });
      } else {
        doc.fillColor("#ffffff").fontSize(12).text(quote.emisor.razon_social, 45, 20, { bold: true });
      }

      // Emisor Info in white text
      doc.fillColor("#ffffff").fontSize(7.5);
      doc.text(quote.emisor.razon_social.toUpperCase(), 45, 65, { bold: true, width: 220 });
      doc.text(`RUT: ${quote.emisor.rut}`, 45, 77);
      doc.text(`Giro: ${quote.emisor.giro || "Obras Menores"}`, 45, 87, { width: 220 });
      doc.text(`Fono: ${quote.emisor.fono} | Mail: ${quote.emisor.email}`, 45, 107);

      // Payment Timeline milestones block (Vertical connected line in yellow/secondary)
      const tlX = 380;
      doc.strokeColor(sColor).lineWidth(1.5);
      doc.moveTo(tlX, 22).lineTo(tlX, 98).stroke();

      // Milestone circles and text
      const milestones = [
        { y: 22, text: "Aprobación", sub: "Inicio Obras (50%)" },
        { y: 60, text: "Ejecución", sub: "Monitoreo Técnico" },
        { y: 98, text: "Entrega", sub: "Conformidad (50%)" }
      ];

      milestones.forEach(m => {
        doc.fillColor(sColor);
        doc.circle(tlX, m.y, 4).fill();
        doc.fillColor("#ffffff").fontSize(7.5).text(m.text, tlX + 12, m.y - 6, { bold: true });
        doc.fontSize(6).text(m.sub, tlX + 12, m.y + 3);
      });

      let y = 138;

      // 2. Client & Document Info Grid
      doc.fillColor(pColor).fontSize(8.5).text("RECEPTOR DEL PROYECTO", 45, y, { bold: true });
      doc.fillColor(sColor).fontSize(8.5).text(`COTIZACIÓN Nª ${quote.numero}`, 330, y, { align: "right", width: 237, bold: true });
      
      doc.moveTo(45, y + 10).lineTo(567, y + 10).strokeColor(lightBorder).lineWidth(0.5).stroke();
      y += 16;

      doc.fillColor(tColor).fontSize(8);
      doc.text(`Señor(es): ${quote.receptor.razon_social}`, 45, y, { bold: true });
      doc.text(`Dirección Obra: ${quote.receptor.direccion}, ${quote.receptor.comuna}`, 45, y + 12);
      doc.text(`RUT Receptor: ${quote.receptor.rut}`, 45, y + 24);

      doc.text(`Fecha Emisión: ${quote.fechas.emision_texto}`, 330, y);
      doc.text(`Vencimiento: ${quote.fechas.vencimiento_texto}`, 330, y + 12);
      doc.text(`Validez Comercial: 30 días`, 330, y + 24);

      y += 42;

      // 3. Horizontal Transition Banner highlighting quote type
      doc.roundedRect(45, y, 522, 22, 3).fill(sColor);
      doc.fillColor("#ffffff").fontSize(8.5).text("PROPUESTA DE PARTIDAS E ITEMIZADO GENERAL", 55, y + 7, { bold: true });
      doc.text(`TOTAL GENERAL NETO: ${formatCLP(quote.totales.monto_neto)}`, 350, y + 7, { align: "right", width: 200, bold: true });

      y += 32;

      // 4. Grid Table
      const colItem = 45;
      const colDesc = 80;
      const colQty = 360;
      const colUnit = 405;
      const colPrice = 450;
      const colTotal = 510;

      // Table Header (Styled Gray)
      doc.rect(45, y, 522, 16).fill("#edf2f7");
      doc.fillColor(pColor).fontSize(8);
      doc.text("ITEM", colItem + 5, y + 4, { bold: true });
      doc.text("DESCRIPCIÓN DE PARTIDAS", colDesc, y + 4, { bold: true });
      doc.text("CANT", colQty, y + 4, { align: "right", width: 35, bold: true });
      doc.text("UNID", colUnit, y + 4, { align: "center", width: 35, bold: true });
      doc.text("P. UNIT", colPrice, y + 4, { align: "right", width: 50, bold: true });
      doc.text("TOTAL", colTotal, y + 4, { align: "right", width: 52, bold: true });

      y += 16;

      doc.fillColor(tColor).fontSize(7.5);
      quote.detalles.forEach((d, idx) => {
        const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : "");
        const descHeight = doc.heightOfString(descText, { width: 270 }) + 8;

        if (y + descHeight > 620) {
          doc.addPage();
          y = 45;
          doc.rect(45, y, 522, 16).fill("#edf2f7");
          doc.fillColor(pColor).fontSize(8);
          doc.text("ITEM", colItem + 5, y + 4, { bold: true });
          doc.text("DESCRIPCIÓN DE PARTIDAS", colDesc, y + 4, { bold: true });
          doc.text("CANT", colQty, y + 4, { align: "right", width: 35, bold: true });
          doc.text("UNID", colUnit, y + 4, { align: "center", width: 35, bold: true });
          doc.text("P. UNIT", colPrice, y + 4, { align: "right", width: 50, bold: true });
          doc.text("TOTAL", colTotal, y + 4, { align: "right", width: 52, bold: true });
          y += 16;
          doc.fillColor(tColor).fontSize(7.5);
        }

        // Draw horizontal divider line
        doc.moveTo(45, y).lineTo(567, y).strokeColor(lightBorder).lineWidth(0.5).stroke();

        doc.text(String(d.item), colItem + 5, y + 4);
        doc.text(descText, colDesc, y + 4, { width: 270 });
        doc.text(String(d.cantidad), colQty, y + 4, { align: "right", width: 35 });
        doc.text(String(d.unidad), colUnit, y + 4, { align: "center", width: 35 });
        doc.text(formatCLP(d.precio_unitario), colPrice, y + 4, { align: "right", width: 50 });
        doc.text(formatCLP(d.total), colTotal, y + 4, { align: "right", width: 52 });

        y += descHeight;
      });

      doc.moveTo(45, y).lineTo(567, y).strokeColor(pColor).lineWidth(1).stroke();
      y += 15;

      if (y > 630) {
        doc.addPage();
        y = 45;
      }

      // Totals (Split Box)
      const totalColX = 350;
      const totalValX = 470;
      
      doc.fillColor(tColor).fontSize(8);
      doc.text("SUBTOTAL NETO:", totalColX, y);
      doc.text(formatCLP(quote.totales.monto_neto), totalValX, y, { align: "right", width: 92 });
      y += 14;

      doc.text("19% IVA:", totalColX, y);
      doc.text(formatCLP(quote.totales.iva_19), totalValX, y, { align: "right", width: 92 });
      y += 16;

      // Solid color Total block box
      doc.rect(totalColX - 5, y - 4, 227, 20).fill(pColor);
      doc.fillColor("#ffffff").fontSize(9).text("MONTO TOTAL GENERAL:", totalColX, y, { bold: true });
      doc.text(formatCLP(quote.totales.monto_total), totalValX, y, { align: "right", width: 92, bold: true });
      
      y += 35;

      // Wavy/Angled dark bottom footer for legal details & signatures
      if (y > 580) {
        doc.addPage();
        y = 45;
      }

      // Draw dark footer block: polygon [(0, 690), (612, 670), (612, 792), (0, 792)]
      const footY = 680;
      doc.rect(0, footY, 612, 112).fill("#1a202c");
      doc.rect(0, footY, 612, 4).fill(sColor); // Divider

      doc.fillColor("#ffffff").fontSize(8).text("Términos & Condiciones Generales de Obra", 45, footY + 14, { bold: true });
      doc.fontSize(6.5);
      let obsY = footY + 28;
      quote.observaciones.slice(0, 3).forEach(obs => {
        doc.text(`• ${obs}`, 45, obsY, { width: 300 });
        obsY += 10;
      });

      // Signature area inside dark footer
      doc.fillColor("#ffffff").fontSize(7.5);
      doc.text("Firma de Conformidad Cliente", 390, footY + 20, { align: "center", width: 150 });
      doc.moveTo(390, footY + 65).lineTo(540, footY + 65).strokeColor("#ffffff").lineWidth(0.5).stroke();
      doc.fontSize(6).text(`RUT Receptor: ${quote.receptor.rut}`, 390, footY + 70, { align: "center", width: 150 });

      doc.end();
      writeStream.on("finish", () => resolve(outputPath));
      writeStream.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Dispatcher to render dynamic layout designs
 */
function renderPremiumDesignPDF(quote, logoPath, colors, outputPath, style = "minimalist") {
  if (style === "bold") {
    return renderBoldExecutiveDesign(quote, logoPath, colors, outputPath);
  } else if (style === "technical") {
    return renderTechnicalGridDesign(quote, logoPath, colors, outputPath);
  } else {
    return renderMinimalistDesign(quote, logoPath, colors, outputPath);
  }
}

/**
 * Main function of the make-cot-design skill.
 * Generates N designs for N logo inputs.
 * 
 * @param {Array<string>|string} logosInput - Single logo path or array of logo paths
 * @param {string} outputDir                - Directory where generated PDFs will be stored (default is "diseños")
 * @param {Object} [customQuotationData]    - Optional custom quotation details
 */
async function generateQuotationDesigns(logosInput, outputDir, customQuotationData = null) {
  // Validate and parse logos input
  let logosList = [];
  if (Array.isArray(logosInput)) {
    logosList = logosInput;
  } else if (typeof logosInput === "string") {
    logosList = [logosInput];
  } else {
    throw new Error("[make-cot-design] Invalid logos input. Must be a logo file path or an array of logo paths.");
  }

  if (logosList.length === 0) {
    throw new Error("[make-cot-design] Logos list cannot be empty.");
  }

  // Resolve output directory
  const resolvedOutputDir = outputDir ? path.resolve(outputDir) : path.resolve(__dirname, "../../../diseños");
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  // Load quotation data
  let baseQuote;
  if (customQuotationData && typeof customQuotationData === "object") {
    baseQuote = customQuotationData;
  } else {
    // Attempt to load from reference PDF parsing or scratch JSON
    const refPdfPath = path.join(__dirname, "../../../fakes/COT_1216_65108391-5 (1).pdf");
    const scratchParsedPath = path.join(__dirname, "../../../scratch/parsed_fakes_COT_1216_65108391-5 (1).json");

    if (fs.existsSync(refPdfPath)) {
      try {
        console.log(`[make-cot-design] Parsing reference PDF structure: ${refPdfPath}`);
        const tempJsonPath = path.join(__dirname, "../../../scratch/temp_ref_quote.json");
        baseQuote = await parsePdfToJson(refPdfPath, tempJsonPath);
      } catch (err) {
        console.warn(`[make-cot-design] Failed to parse reference PDF, trying JSON: ${err.message}`);
      }
    }

    if (!baseQuote && fs.existsSync(scratchParsedPath)) {
      try {
        console.log(`[make-cot-design] Loading parsed reference quotation from JSON: ${scratchParsedPath}`);
        baseQuote = JSON.parse(fs.readFileSync(scratchParsedPath, "utf8"));
      } catch (err) {
        console.warn(`[make-cot-design] Failed to load parsed reference JSON: ${err.message}`);
      }
    }

    if (!baseQuote) {
      console.log("[make-cot-design] Using default fallback corporate quotation data.");
      baseQuote = {
        tipo_documento: "COTIZACIÓN",
        numero: 1216,
        emisor: {
          razon_social: "SERVICIOS DE MANTENIMIENTO INDUSTRIAL PÁEZ SPA",
          rut: "77.141.881-3",
          giro: "COMERCIALIZADORA DE INSUMOS DE ASEO, GASFITERIA Y REPARACIONES EN GRAL",
          direccion: "Carlos Ditborn 0702 , Ñuñoa , XIII Metropolitana de Santiago",
          fono: "+56 9 4239 5271",
          email: "primeservice.chile@gmail.com"
        },
        receptor: {
          razon_social: "CONDOMINIO ANDES lll",
          rut: "65.108.391-5",
          direccion: "AV ESCUELA AGRICOLA 1710",
          comuna: "Macul"
        },
        fechas: {
          emision_iso: "2026-05-07",
          vencimiento_iso: "2026-06-07",
          emision_texto: "7 de mayo de 2026",
          vencimiento_texto: "7 de junio de 2026"
        },
        detalles: [
          {
            item: 1,
            descripcion_resumen: "Reparación de muro trizado con terminación completa",
            descripcion_detallada: "Reparación de muro de 3,50 x 3,33 mts con fisuras, incluyendo apertura de grietas, aplicación de malla de refuerzo, afinado completo del paño, sellado y pintura de terminación.",
            cantidad: 1,
            unidad: "UNID",
            precio_unitario: 1200000,
            impuesto: "AF",
            total: 1200000
          }
        ],
        observaciones: [
          "Garantía solo sobre zona intervenida.",
          "No cubre movimientos estructurales.",
          "Incluye limpieza final del área.",
          "Tiempo estimado: 1 a 3 días. Pago:",
          "50% inicio / 50% entrega."
        ],
        totales: {
          monto_neto: 1200000,
          monto_exento: 0,
          iva_19: 228000,
          monto_total: 1428000
        }
      };
    }
  }

  const results = [];

  // Generate design proposal for each logo
  for (const logoRelativePath of logosList) {
    const logoPath = path.resolve(logoRelativePath);
    if (!fs.existsSync(logoPath)) {
      console.warn(`\u26A0 [make-cot-design] Logo path not found, skipping: ${logoPath}`);
      continue;
    }

    const brandName = getBrandNameFromLogo(logoPath);
    console.log(`\n--- PROCESANDO LOGOTIPO: ${path.basename(logoPath)} [${brandName}] ---`);

    // 1. Resolve dynamic palette (primary/secondary)
    const colors = resolveColorsForLogo(logoPath);
    console.log(`   Color Primario: ${colors.primary} | Color Secundario: ${colors.secondary}`);

    // 2. Resolve company profile details
    const profile = resolveProfileForLogo(logoPath);

    // 3. Build quotation data object with brand-specific emisor & custom quote number formatting
    const localQuote = JSON.parse(JSON.stringify(baseQuote));
    localQuote.emisor = profile;
    localQuote.numero = `COT-${brandName.replace(/\s+/g, "")}-${localQuote.numero}`;

    // 4. Render N designs (all three structures) for this logo
    const layouts = ["minimalist", "bold", "technical"];
    for (const style of layouts) {
      const fileBaseName = `cotizacion_diseno_${brandName.toLowerCase().replace(/\s+/g, "_")}_${style}.pdf`;
      const outputPath = path.join(resolvedOutputDir, fileBaseName);

      await renderPremiumDesignPDF(localQuote, logoPath, colors, outputPath, style);
      console.log(`\u2705 [make-cot-design] Diseño PDF (${style}) generado con éxito: ${outputPath}`);

      results.push({
        logo: logoPath,
        brand: brandName,
        colors,
        style,
        outputPath
      });
    }
  }

  return results;
}

module.exports = {
  generateQuotationDesigns,
  resolveColorsForLogo,
  resolveProfileForLogo,
  extractPngColors
};
