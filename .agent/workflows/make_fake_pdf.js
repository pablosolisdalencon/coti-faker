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
/**
 * Resolves logo path imperatively for a company profile.
 * Priority: logoPath field -> logoFileName field -> glob search by company name in empresas dir.
 */
function resolveLogoPath(emisor) {
  const empresasDir = path.resolve(__dirname, '../../empresas');
  const imgExts = ['.png', '.jpg', '.jpeg', '.webp', '.avif'];

  // 1. Direct logoPath
  if (emisor.logoPath && fs.existsSync(emisor.logoPath)) return emisor.logoPath;

  // 2. By logoFileName base name
  if (emisor.logoFileName) {
    for (const ext of imgExts) {
      const candidate = path.join(empresasDir, emisor.logoFileName + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // 3. Targeted search: any image starting with 'logo' that contains a word from razon_social
  // (deliberately excludes 'diseño-*' and other reference/asset files)
  if (emisor.razon_social) {
    const words = emisor.razon_social.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const all = fs.readdirSync(empresasDir);
    for (const file of all) {
      const lower = file.toLowerCase();
      if (!lower.startsWith('logo')) continue;          // ONLY logo files
      const isImage = imgExts.some(e => lower.endsWith(e));
      if (!isImage) continue;
      if (words.some(w => lower.includes(w))) return path.join(empresasDir, file);
    }
  }

  return null;
}

function renderHeader(doc, quote, layout) {
  const pColor = quote.emisor.primaryColor || "#1a365d";
  const sColor = quote.emisor.secondaryColor || "#2b6cb0";
  const textColor = "#2d3748";

  if (layout === 'minimalist-invoice') {
    const resolvedLogoJyS = resolveLogoPath(quote.emisor);
    if (resolvedLogoJyS) {
      doc.image(resolvedLogoJyS, 50, 28, { width: 90, fit: [90, 90] });
    }
    doc.fillColor('#000000').fontSize(11).text(quote.emisor.razon_social.toUpperCase(), 155, 32, { bold: true });
    doc.fontSize(8).fillColor('#333333');
    doc.text(quote.emisor.rut ? `RUT: ${quote.emisor.rut}` : '', 155, 47);
    doc.text(quote.emisor.direccion || '', 155, 58, { width: 180 });
    const addrH = doc.heightOfString(quote.emisor.direccion || '', { width: 180 });
    doc.text(`Tel: ${quote.emisor.fono || ''}`, 155, 58 + addrH + 2);
    doc.text(`Contacto: ${quote.emisor.contacto?.nombre || ''}`, 155, 58 + addrH + 14);

    doc.fillColor('#000000').fontSize(16).text('COTIZACIÓN', 370, 40, { align: 'right', width: 192 });

    const numStr = String(quote.numero);
    const dateStr = quote.fechas?.fecha_emision || 'N/A';
    const boxTop = 95;
    doc.rect(370, boxTop, 192, 14).strokeColor('#000000').lineWidth(0.5).stroke();
    doc.rect(370, boxTop + 14, 192, 20).strokeColor('#000000').lineWidth(0.5).stroke();
    doc.moveTo(481, boxTop).lineTo(481, boxTop + 34).stroke();
    doc.fontSize(7).fillColor('#000000');
    doc.text('FECHA', 370, boxTop + 3, { width: 111, align: 'center', bold: true });
    doc.text('NÚMERO', 481, boxTop + 3, { width: 81, align: 'center', bold: true });
    doc.fontSize(8);
    doc.text(dateStr, 370, boxTop + 17, { width: 111, align: 'center' });
    doc.text(numStr, 481, boxTop + 17, { width: 81, align: 'center' });

    doc.moveTo(50, 140).lineTo(562, 140).strokeColor('#000000').lineWidth(0.5).stroke();
    return 145;
  } else if (layout === 'green-estimate') {
    const resolvedLogoDFS = resolveLogoPath(quote.emisor);
    if (resolvedLogoDFS) {
      doc.image(resolvedLogoDFS, 450, 25, { width: 100, fit: [100, 60] });
    }
    doc.fillColor('#000000').fontSize(22).text('Propuesta de', 50, 30, { bold: true });
    doc.fontSize(22).text('Cotización Técnica', 50, 56, { bold: true });
    return 95;
  } else if (layout === 'minimalist') {
    doc.fillColor('#000000').fontSize(24).text('COTIZACIÓN', 350, 50, { align: 'right' });
    const resolvedLogo = resolveLogoPath(quote.emisor);
    let headerX = 50, headerY = 45;
    if (resolvedLogo) {
      doc.image(resolvedLogo, 50, 30, { width: 100, height: 70, fit: [100, 70] });
      headerX = 165; headerY = 40;
    }
    doc.fontSize(10).text(quote.emisor.razon_social.toUpperCase(), headerX, headerY, { bold: true });
    headerY += 15;
    doc.fontSize(8);
    doc.text(quote.emisor.direccion || '', headerX, headerY);
    doc.text(`Fono: ${quote.emisor.fono || ''} | Contacto: ${quote.emisor.contacto?.nombre || ''}`, headerX, headerY + 12);
    
    const numStr = String(quote.numero);
    const dateStr = quote.fechas?.fecha_emision || 'N/A';
    doc.fontSize(7);
    const bottomBoxHeight = Math.max(15, 19);
    doc.rect(400, 85, 162, 15 + bottomBoxHeight).strokeColor('#000000').lineWidth(1).stroke();
    doc.moveTo(400, 100).lineTo(562, 100).stroke();
    doc.moveTo(481, 85).lineTo(481, 85 + 15 + bottomBoxHeight).stroke();
    doc.text('FECHA', 400, 90, { width: 81, align: 'center', bold: true });
    doc.text('NÚMERO', 481, 90, { width: 81, align: 'center', bold: true });
    doc.text(dateStr, 400, 103, { width: 81, align: 'center' });
    doc.text(numStr, 481, 103, { width: 81, align: 'center' });
    return 130;
  } else {
    doc.fillColor(pColor).fontSize(16).text(quote.emisor.razon_social.toUpperCase(), 50, 50, { bold: true });
    doc.fillColor(sColor).fontSize(9).text(`Giro: ${quote.emisor.giro || ""}`, 50, 70);
    doc.fillColor(textColor).text(`Dirección: ${quote.emisor.direccion || ""}`, 50, 82);
    doc.text(`Fono: ${quote.emisor.fono || ""} | Email: ${quote.emisor.email || ""}`, 50, 94);
    doc.text(`RUT: ${quote.emisor.rut || ""}`, 50, 106);

    doc.fillColor(pColor).fontSize(14).text(`COTIZACIÓN Nº ${quote.numero}`, 380, 50, { align: "right" });
    doc.fillColor(textColor).fontSize(9);
    doc.text(`Fecha Emisión: ${quote.fechas?.fecha_emision || ""}`, 380, 70, { align: "right" });
    doc.moveTo(50, 125).lineTo(562, 125).strokeColor("#cbd5e0").lineWidth(1).stroke();
    return 140;
  }
}

function renderCondicionesServicio(doc, condiciones, quote, layout, primaryColor, secondaryColor) {
  doc.addPage();
  let condY = renderHeader(doc, quote, layout);
  condY += 15;
  
  const lines = condiciones.split('\n');
  const firstLine = lines[0].trim();
  
  doc.fillColor(primaryColor || '#000000').fontSize(12).text(firstLine, 50, condY, { bold: true });
  condY += 18;
  
  // Underline
  doc.moveTo(50, condY).lineTo(562, condY).strokeColor(secondaryColor || '#000000').lineWidth(0.8).stroke();
  condY += 12;
  
  const headings = [
    'BASES GENERALES DEL SERVICIO',
    'TÉRMINOS Y CONDICIONES DEL SERVICIO',
    'Sobre los Trabajos',
    'Ejecución de los Trabajos',
    'Pagos',
    'Condiciones de Pago',
    'Cosas a Tener en Cuenta',
    'Aspectos Generales',
    'Lo Que No Incluye',
    'Servicios No Incluidos',
    'Garantías y Revisiones',
    'Garantía',
    'Información Adicional',
    'Disposiciones Finales',
    'Programación'
  ];
  
  doc.fillColor('#333333').fontSize(8.5);
  
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') {
      condY += 4;
      continue;
    }
    
    const isHeading = headings.includes(trimmed);
    if (isHeading) {
      if (condY > 50) {
        condY += 8;
      }
      if (condY > 680) {
        doc.addPage();
        condY = renderHeader(doc, quote, layout) + 15;
      }
      doc.fillColor(primaryColor || '#000000').fontSize(9.5).text(trimmed, 50, condY, { bold: true });
      doc.fillColor('#333333').fontSize(8.5);
      condY += 14;
    } else {
      const textH = doc.heightOfString(trimmed, { width: 512, lineGap: 2 });
      if (condY + textH > 680) {
        doc.addPage();
        condY = renderHeader(doc, quote, layout) + 15;
      }
      doc.text(trimmed, 50, condY, { width: 512, align: 'left', lineGap: 2 });
      condY += textH + 4;
    }
  }
}

function renderPDF(quote, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: "LETTER" });
      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Theme settings
      const layout = quote.emisor.themeLayout || 'default';
      const pColor = quote.emisor.primaryColor || "#1a365d";
      const sColor = quote.emisor.secondaryColor || "#2b6cb0";
      const aColor = quote.emisor.accentColor || "#e2e8f0";
      const textColor = "#2d3748";
      const lightGray = "#edf2f7";

      if (layout === 'minimalist-invoice') {
        // ============================================================
        // JyS LAYOUT — Basado en: diseño-jys-arquitectura-y-construccion.jpg
        // Blanco puro, logo grande arriba-izquierda, datos empresa a la derecha
        // del logo. "COTIZACIÓN" enorme arriba-derecha. FECHA/NÚMERO con bordes.
        // Sección cliente con líneas suaves. Tabla con header negro.
        // ============================================================

        renderHeader(doc, quote, layout);

        // -- SECCIÓN CLIENTE --
        let cy = 148;
        doc.fontSize(8).fillColor('#000000');
        doc.text('Preparado para:', 50, cy, { bold: true });
        cy += 14;

        doc.text('Cliente:', 50, cy);
        doc.text(quote.receptor.razon_social || '', 105, cy, { width: 220 });
        doc.moveTo(100, cy + 10).lineTo(325, cy + 10).strokeColor('#000000').lineWidth(0.5).stroke();

        doc.text('Email:', 345, cy);
        doc.text(quote.receptor.email || 'N/A', 378, cy);
        doc.moveTo(373, cy + 10).lineTo(562, cy + 10).strokeColor('#000000').lineWidth(0.5).stroke();
        cy += 18;

        doc.text('Teléfono:', 50, cy);
        doc.text(quote.receptor.fono || 'N/A', 105, cy);
        doc.moveTo(100, cy + 10).lineTo(210, cy + 10).strokeColor('#000000').lineWidth(0.5).stroke();

        doc.text('Dirección:', 220, cy);
        doc.text(quote.receptor.direccion || '', 270, cy, { width: 292 });
        doc.moveTo(265, cy + 10).lineTo(562, cy + 10).strokeColor('#000000').lineWidth(0.5).stroke();
        cy += 18;

        doc.text('Contacto:', 50, cy);
        doc.text(quote.receptor.contacto || 'N/A', 105, cy);
        doc.moveTo(100, cy + 10).lineTo(210, cy + 10).strokeColor('#000000').lineWidth(0.5).stroke();
        cy += 22;

        // -- TABLA SERVICIOS --
        const colNo = 50; const colDesc = 100; const colQty = 360; const colUnit = 400; const colPrice = 440; const colTotal = 508;
        const headerH = 18;

        doc.rect(50, cy, 512, headerH).fill(quote.emisor.tableBg || '#1a1a1a');
        doc.fillColor(quote.emisor.tableFg || '#ffffff').fontSize(8);
        doc.text('ITEM', colNo, cy + 5, { width: 45, align: 'center', bold: true });
        doc.text('DESCRIPCIÓN', colDesc, cy + 5, { width: 255, align: 'center', bold: true });
        doc.text('CANT.', colQty, cy + 5, { width: 35, align: 'center', bold: true });
        doc.text('UNID.', colUnit, cy + 5, { width: 35, align: 'center', bold: true });
        doc.text('PRECIO U.', colPrice, cy + 5, { width: 60, align: 'center', bold: true });
        doc.text('TOTAL', colTotal, cy + 5, { width: 54, align: 'right', bold: true });
        cy += headerH;

        const tableStartY = cy;
        doc.fillColor('#000000').fontSize(8);
        quote.detalles.forEach((d, idx) => {
          const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : '');
          const rowH = Math.max(24, doc.heightOfString(descText, { width: 255 }) + 12);
          if (cy + rowH > 700) { doc.addPage(); cy = 50; }
          if (idx % 2 === 0) doc.rect(50, cy, 512, rowH).fill(quote.emisor.rowAlt || '#f8f8f8');
          doc.fillColor('#000000');
          doc.text(String(d.item), colNo, cy + 6, { width: 45, align: 'center' });
          doc.text(descText, colDesc, cy + 6, { width: 255 });
          if (d.total > 0) {
            doc.text(String(d.cantidad), colQty, cy + 6, { width: 35, align: 'center' });
            doc.text(String(d.unidad), colUnit, cy + 6, { width: 35, align: 'center' });
            doc.text(formatCLP(d.precio_unitario), colPrice, cy + 6, { width: 60, align: 'right' });
            doc.text(formatCLP(d.total), colTotal, cy + 6, { width: 54, align: 'right' });
          }
          cy += rowH;
        });

        // Table border
        doc.rect(50, tableStartY, 512, cy - tableStartY).strokeColor('#000000').lineWidth(0.5).stroke();
        [colDesc - 5, colQty - 5, colUnit - 5, colPrice - 5, colTotal - 5].forEach(x => {
          doc.moveTo(x, tableStartY - headerH).lineTo(x, cy).stroke();
        });

        // -- TOTALES --
        cy += 15;
        doc.moveTo(50, cy).lineTo(562, cy).strokeColor('#cccccc').lineWidth(0.5).stroke();
        cy += 10;
        doc.fontSize(8).fillColor('#000000');
        doc.text('SUB TOTAL', 400, cy, { bold: true });
        doc.text(formatCLP(quote.totales.monto_neto), 480, cy, { align: 'right', width: 82 });
        cy += 14;
        doc.text('IVA', 400, cy, { bold: true });
        doc.text(formatCLP(quote.totales.iva_19), 480, cy, { align: 'right', width: 82 });
        cy += 14;
        doc.rect(390, cy, 172, 18).fill('#000000');
        doc.fillColor('#ffffff').fontSize(9);
        doc.text('TOTAL', 400, cy + 4, { bold: true });
        doc.text(formatCLP(quote.totales.monto_total), 480, cy + 4, { align: 'right', width: 82 });

        if (quote.emisor.condiciones_del_servicio) {
          renderCondicionesServicio(doc, quote.emisor.condiciones_del_servicio, quote, layout, '#000000', '#000000');
        }

      } else if (layout === 'green-estimate') {
        // ============================================================
        // DFS LAYOUT — Basado en: diseño-dfs-maderas.webp
        // Header: título grande "Propuesta Técnica" arriba-izquierda.
        // Logo mediano arriba-derecha. Barras verdes diagonales de sección.
        // Tabla header verde oscuro + filas alternadas verde-claro.
        // Footer verde oscuro con datos empresa.
        // ============================================================
        const hBg   = quote.emisor.headerBg  || '#2d6a2e';
        const hFg   = quote.emisor.headerFg  || '#8dc63f';
        const tBg   = quote.emisor.tableBg   || '#2d6a2e';
        const tFg   = quote.emisor.tableFg   || '#ffffff';
        const rowAlt= quote.emisor.rowAlt    || '#f5f9f0';
        const fBg   = quote.emisor.footerBg  || '#2d6a2e';
        const fFg   = quote.emisor.footerFg  || '#ffffff';

        renderHeader(doc, quote, layout);

        // -- BARRA DE SECCIÓN: Cliente --
        let sy = 100;
        doc.rect(50, sy, 512, 20).fill(hBg);
        // diagonal accent
        doc.save().translate(50, sy).polygon([0,0],[20,0],[0,20]).fill(hFg).restore();
        doc.fillColor(hFg).fontSize(9).text('Información del Cliente', 75, sy + 5, { bold: true });
        doc.fillColor('#555555').fontSize(8);
        doc.text(`Fecha Estimación: ${quote.fechas?.fecha_emision || 'N/A'}`, 400, sy + 5, { align: 'right', width: 162 });
        sy += 28;

        doc.fillColor('#000000').fontSize(8);
        doc.text('Nombre:', 50, sy, { bold: true });
        doc.text(quote.receptor.razon_social || '', 105, sy);
        doc.text('Teléfono:', 350, sy, { bold: true });
        doc.text(quote.receptor.fono || 'N/A', 400, sy);
        sy += 14;
        doc.text('Empresa:', 50, sy, { bold: true });
        doc.text(quote.receptor.razon_social || '', 105, sy);
        doc.text('Email:', 350, sy, { bold: true });
        doc.text(quote.receptor.email || 'N/A', 400, sy);
        sy += 14;
        doc.text('Dirección:', 50, sy, { bold: true });
        doc.text(quote.receptor.direccion || '', 105, sy, { width: 220 });
        sy += 22;

        // -- BARRA DE SECCIÓN: Servicios --
        doc.rect(50, sy, 512, 20).fill(hBg);
        doc.save().translate(50, sy).polygon([0,0],[20,0],[0,20]).fill(hFg).restore();
        doc.fillColor(hFg).fontSize(9).text('Servicios Prestados', 75, sy + 5, { bold: true });
        sy += 28;

        // -- TABLA --
        const colNo2 = 50; const colDesc2 = 90; const colEst = 360; const colPU = 410; const colP = 480;
        const hdrH2 = 20;

        doc.rect(50, sy, 512, hdrH2).fill(tBg);
        doc.fillColor(tFg).fontSize(8);
        doc.text('No.', colNo2, sy + 6, { width: 35, align: 'center', bold: true });
        doc.text('Descripción', colDesc2, sy + 6, { width: 260, align: 'center', bold: true });
        doc.text('Cant.', colEst, sy + 6, { width: 45, align: 'center', bold: true });
        doc.text('Precio U.', colPU, sy + 6, { width: 65, align: 'center', bold: true });
        doc.text('Total', colP, sy + 6, { width: 82, align: 'right', bold: true });
        sy += hdrH2;

        const tableStart2 = sy;
        doc.fillColor('#000000').fontSize(8);
        quote.detalles.forEach((d, idx) => {
          const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : '');
          const rowH = Math.max(22, doc.heightOfString(descText, { width: 260 }) + 12);
          if (sy + rowH > 680) { doc.addPage(); sy = 50; }
          if (idx % 2 === 0) doc.rect(50, sy, 512, rowH).fill(rowAlt);
          doc.fillColor('#000000');
          doc.text(String(d.item), colNo2, sy + 5, { width: 35, align: 'center' });
          doc.text(descText, colDesc2, sy + 5, { width: 260 });
          if (d.total > 0) {
            doc.text(String(d.cantidad), colEst, sy + 5, { width: 45, align: 'center' });
            doc.text(formatCLP(d.precio_unitario), colPU, sy + 5, { width: 65, align: 'right' });
            doc.text(formatCLP(d.total), colP, sy + 5, { width: 82, align: 'right' });
          }
          sy += rowH;
        });

        // Total row (green)
        doc.rect(50, sy, 512, 20).fill(tBg);
        doc.fillColor(tFg).fontSize(9).text('Total', colDesc2, sy + 5, { bold: true });
        doc.rect(colP, sy, 82, 20).fill(hFg);
        doc.fillColor('#000000').text(formatCLP(quote.totales.monto_total), colP, sy + 5, { width: 82, align: 'right', bold: true });
        sy += 28;

        // Table outer border
        doc.rect(50, tableStart2, 512, sy - tableStart2 - 8).strokeColor('#cccccc').lineWidth(0.5).stroke();

        // -- TOTALES secundarios --
        sy += 10;
        doc.fontSize(8).fillColor('#000000');
        doc.text('Sub Total:', 390, sy);
        doc.text(formatCLP(quote.totales.monto_neto), 470, sy, { align: 'right', width: 92 });
        sy += 12;
        doc.text('IVA (19%):', 390, sy);
        doc.text(formatCLP(quote.totales.iva_19), 470, sy, { align: 'right', width: 92 });
        sy += 12;
        doc.fontSize(10).fillColor(hBg);
        doc.text(`TOTAL: ${formatCLP(quote.totales.monto_total)}`, 390, sy, { bold: true, align: 'right', width: 172 });

        if (quote.emisor.condiciones_del_servicio) {
          renderCondicionesServicio(doc, quote.emisor.condiciones_del_servicio, quote, layout, hBg, hFg);
        }

        // -- FOOTER VERDE --
        const footerY = 720;
        doc.rect(0, footerY, 612, 72).fill(fBg);
        const resolvedLogoDFSFooter = resolveLogoPath(quote.emisor);
        if (resolvedLogoDFSFooter) {
          doc.image(resolvedLogoDFSFooter, 50, footerY + 8, { width: 70, fit: [70, 45] });
        }
        doc.fillColor(fFg).fontSize(8);
        doc.text(quote.emisor.razon_social || '', 135, footerY + 10, { bold: true });
        doc.text(quote.emisor.direccion || '', 135, footerY + 23);
        doc.text(`Tel: ${quote.emisor.fono || ''}`, 135, footerY + 36);

        doc.text(`Nº Cotización: ${quote.numero}`, 400, footerY + 10, { align: 'right', width: 162 });
        doc.text(`Fecha: ${quote.fechas?.fecha_emision || 'N/A'}`, 400, footerY + 23, { align: 'right', width: 162 });

      } else if (layout === 'minimalist') {
        // Legacy fallback minimalist
        renderHeader(doc, quote, layout);
        let y = 200;
        const colItem = 50; const colDesc = 85; const colQty = 350; const colUnit = 390; const colPrice = 430; const colTotal = 495;
        doc.rect(50, y, 512, 20).strokeColor('#000000').stroke();
        doc.fontSize(8).fillColor('#000000');
        ['ITEM','DESCRIPCIÓN','CANT.','UNID.','PRECIO U.','TOTAL'].forEach((h,i) => {
          const xs = [colItem+5,colDesc,colQty,colUnit,colPrice,colTotal];
          doc.text(h, xs[i], y + 6, { bold: true });
        });
        y += 20;
        const tableStartY = y;
        quote.detalles.forEach(d => {
          const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : '');
          const descHeight = doc.heightOfString(descText, { width: 250 });
          if (y + descHeight > 700) { doc.addPage(); y = 50; }
          doc.fillColor('#000000');
          doc.text(String(d.item), colItem + 5, y + 5);
          doc.text(descText, colDesc, y + 5, { width: 250 });
          if (d.total > 0) {
            doc.text(String(d.cantidad), colQty, y + 5);
            doc.text(String(d.unidad), colUnit, y + 5);
            doc.text(formatCLP(d.precio_unitario), colPrice, y + 5);
            doc.text(formatCLP(d.total), colTotal, y + 5);
          }
          y += descHeight + 15;
        });
        doc.rect(50, tableStartY, 512, y - tableStartY).stroke();
        y += 10;
        doc.rect(430, y, 132, 60).stroke();
        doc.moveTo(430,y+20).lineTo(562,y+20).stroke();
        doc.moveTo(430,y+40).lineTo(562,y+40).stroke();
        doc.moveTo(490,y).lineTo(490,y+60).stroke();
        doc.fontSize(8).text('SUB TOTAL', 435, y+6, { bold: true });
        doc.text(formatCLP(quote.totales.monto_neto), 495, y+6);
        doc.text('IVA', 435, y+26, { bold: true });
        doc.text(formatCLP(quote.totales.iva_19), 495, y+26);
        doc.text('TOTAL', 435, y+46, { bold: true });
        doc.text(formatCLP(quote.totales.monto_total), 495, y+46);

        if (quote.emisor.condiciones_del_servicio) {
          renderCondicionesServicio(doc, quote.emisor.condiciones_del_servicio, quote, layout, '#000000', '#000000');
        }

      } else {
        // Default layout (Original)
        renderHeader(doc, quote, layout);

        let y = 140;
        doc.fillColor(pColor).fontSize(11).text("DATOS DEL CLIENTE", 50, y, { bold: true });
        y += 18;
        doc.fillColor(textColor).fontSize(9);
        doc.text(`Señor(es): ${quote.receptor.razon_social || ""}`, 50, y);
        doc.text(`RUT: ${quote.receptor.rut || "N/A"}`, 350, y);
        y += 14;
        doc.text(`Dirección Obra: ${quote.receptor.direccion || ""}`, 50, y);
        doc.moveTo(50, y + 20).lineTo(562, y + 20).strokeColor("#cbd5e0").lineWidth(1).stroke();
        y += 30;

        doc.fillColor(pColor).fontSize(11).text("DETALLE DE LA PROPUESTA TÉCNICO-ECONÓMICA", 50, y, { bold: true });
        y += 18;

        const colItem = 50; const colDesc = 85; const colQty = 350; const colUnit = 390; const colPrice = 430; const colTotal = 495;

        doc.rect(50, y, 512, 18).fill(pColor);
        doc.fillColor("#ffffff").fontSize(8);
        doc.text("ITEM", colItem + 5, y + 5);
        doc.text("DESCRIPCIÓN DE PARTIDAS", colDesc, y + 5);
        doc.text("CANT", colQty, y + 5);
        doc.text("UNID", colUnit, y + 5);
        doc.text("P. UNIT", colPrice, y + 5);
        doc.text("TOTAL", colTotal, y + 5);
        y += 24;

        doc.fillColor(textColor).fontSize(8);
        quote.detalles.forEach((d, idx) => {
          const descText = d.descripcion_resumen + (d.descripcion_detallada ? `\n${d.descripcion_detallada}` : "");
          const descHeight = doc.heightOfString(descText, { width: 250 });
          
          if (idx % 2 === 0) {
            doc.rect(50, y - 4, 512, descHeight + 8).fill(lightGray);
            doc.fillColor(textColor);
          }

          if (y + descHeight > 700) { doc.addPage(); y = 50; }

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

        const totalsX = 350; const valX = 475;
        doc.fillColor(pColor).fontSize(9);
        doc.text("SUBTOTAL NETO:", totalsX, y);
        doc.fillColor(textColor).text(formatCLP(quote.totales.monto_neto), valX, y, { align: "right" });
        y += 15;

        doc.fillColor(pColor).text("19% IVA:", totalsX, y);
        doc.fillColor(textColor).text(formatCLP(quote.totales.iva_19), valX, y, { align: "right" });
        y += 15;

        doc.moveTo(totalsX, y).lineTo(562, y).strokeColor("#cbd5e0").lineWidth(0.5).stroke();
        y += 5;

        doc.fillColor(pColor).fontSize(11).text("TOTAL GENERAL:", totalsX, y, { bold: true });
        doc.fillColor(pColor).text(formatCLP(quote.totales.monto_total), valX, y, { align: "right", bold: true });

        if (quote.emisor.condiciones_del_servicio) {
          renderCondicionesServicio(doc, quote.emisor.condiciones_del_servicio, quote, layout, pColor, sColor);
        }
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
  let base = path.basename(filePath, ".pdf");
  // Remove "Ppta BAT XXX" prefix
  base = base.replace(/^Ppta\s*BAT\s*\d+\s*/i, "");
  
  return base
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
// Added function to generate fake PDF for a specific company profile
/**
 * Generates a fake PDF for a specific company profile.
 * @param {string} inputPdfPath - Path to the source PDF.
 * @param {object} companyProfile - Emisor profile object.
 * @param {string} companyLabel - Label used in output filename.
 * @param {string} outputDir - Directory where the PDF will be saved.
 */
async function generateFakePdfForCompany(inputPdfPath, companyProfile, companyLabel, outputDir) {
  // Parse original PDF to JSON (no need to write intermediate file)
  const rawQuotation = await parsePdfToJson(inputPdfPath);
  const numericId = getNumericId(rawQuotation.numero);
  // Usar "diferencia_precio" del perfil de empresa como % de aumento sobre el original.
  // Fallback a 20% si no está definido en el JSON de la empresa.
  const markupPct = (typeof companyProfile.diferencia_precio === 'number' && !isNaN(companyProfile.diferencia_precio))
    ? companyProfile.diferencia_precio
    : 20;
  const quote = analyzeAndMarkupQuotation(rawQuotation, markupPct);
  quote.emisor = companyProfile;
  // Use a simple identifier combining company label and numeric ID
  if (companyProfile.n_cotizacion !== undefined) {
    quote.numero = companyProfile.n_cotizacion;
  } else {
    quote.numero = `${companyLabel.toUpperCase().replace(/\s+/g, '_')}-${numericId}`;
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const baseName = getCleanSuffix(inputPdfPath);
  const safeLabel = companyLabel.replace(/\s+/g, '_');
  const outPath = path.join(outputDir, `${baseName}_${safeLabel}.pdf`);

  await renderPDF(quote, outPath);
  console.log(`✅ PDF generado para ${companyLabel}: ${outPath}`);
  return outPath;
}

async function processAllTareas() {
  const tareasDir = path.resolve(__dirname, "../../tareas");
  const empresasDir = path.resolve(__dirname, "../../empresas");
  const resultadosDir = path.resolve(__dirname, "../../resultados");

  console.log(`\n=== INICIANDO AUTO-WORKFLOW MAKE-FAKE-PDF ===`);
  
  if (!fs.existsSync(resultadosDir)) {
    fs.mkdirSync(resultadosDir, { recursive: true });
  }

  const pdfFiles = fs.readdirSync(tareasDir).filter(f => f.toLowerCase().endsWith('.pdf'));
  const jsonFiles = fs.readdirSync(empresasDir).filter(f => f.toLowerCase().endsWith('.json'));

  const mapProfile = (profile) => ({
    // Correlativo y markup de precio
    n_cotizacion: profile.n_cotizacion,
    diferencia_precio: typeof profile.diferencia_precio === 'number' ? profile.diferencia_precio : 20,
    // Datos de identidad
    razon_social: profile.Razon || profile.razon_social || '',
    rut: profile.Rut || profile.rut || '',
    direccion: profile.Direccion || profile.direccion || '',
    contacto: {
      nombre: profile.Contacto || (profile.contacto ? profile.contacto.nombre : '') || '',
    },
    fono: profile.Fono || profile.fono || '',
    // Diseño
    themeLayout: profile.themeLayout || 'default',
    primaryColor: profile.primaryColor || '#1a365d',
    secondaryColor: profile.secondaryColor || '#2b6cb0',
    accentColor: profile.accentColor || '#e2e8f0',
    headerBg: profile.headerBg || null,
    headerFg: profile.headerFg || null,
    tableBg: profile.tableBg || null,
    tableFg: profile.tableFg || null,
    rowAlt: profile.rowAlt || null,
    footerBg: profile.footerBg || null,
    footerFg: profile.footerFg || null,
    // Logo
    logoPath: profile.logoPath || null,
    logoFileName: profile.logoFileName || null,
    condiciones_del_servicio: profile.condiciones_del_servicio || null,
  });

  const profiles = [];
  for (const file of jsonFiles) {
    const raw = fs.readFileSync(path.join(empresasDir, file), 'utf8');
    try {
      const profile = JSON.parse(raw);
      if (profile.Razon || profile.razon_social) {
        profiles.push({
          file: path.join(empresasDir, file),
          rawProfile: profile,
          label: profile.Razon ? profile.Razon.replace(/\s+/g, '_') : profile.razon_social.replace(/\s+/g, '_'),
          data: mapProfile(profile)
        });
      }
    } catch (e) {
      console.error(`Error parsing ${file}:`, e);
    }
  }

  if (pdfFiles.length === 0) {
    console.log("No se encontraron PDFs en el directorio de tareas.");
    return;
  }

  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(tareasDir, pdfFile);
    console.log(`\n-> Procesando archivo original: ${pdfFile}`);
    for (const p of profiles) {
      p.data.n_cotizacion = p.rawProfile.n_cotizacion || 1;
      await generateFakePdfForCompany(pdfPath, p.data, p.label, resultadosDir);
      
      // Auto-incrementar y guardar en el JSON de la empresa después de usar el número
      p.rawProfile.n_cotizacion = p.data.n_cotizacion + 1;
      fs.writeFileSync(p.file, JSON.stringify(p.rawProfile, null, 2), 'utf8');
    }
  }

  console.log(`\n✅ Proceso completado exitosamente. Documentos generados en: ${resultadosDir}`);
}

module.exports = {
  executeWorkflow,
  renderPDF,
  generateFakePdfForCompany,
  processAllTareas
};

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    // Si se pasa un argumento, ejecutamos sobre un único archivo (modo legacy)
    const targetPdf = path.resolve(args[0]);
    if (!fs.existsSync(targetPdf)) {
      console.error(`\n❌ ERROR: Archivo no encontrado: ${targetPdf}`);
      process.exit(1);
    }
    executeWorkflow(targetPdf).then(() => {
      console.log("\n=== WORKFLOW COMPLETADO ===");
    }).catch(err => {
      console.error("\n❌ Workflow falló:", err.message || err);
      process.exit(1);
    });
  } else {
    // Modo automático: escanear directorios y procesar todo
    processAllTareas().catch(err => {
      console.error("\n❌ Workflow falló en modo automático:", err.message || err);
      process.exit(1);
    });
  }
}
