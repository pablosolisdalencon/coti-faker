const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");

function cleanNumber(str) {
  if (!str) return 0;
  return parseInt(str.replace(/[^0-9]/g, ""), 10) || 0;
}

/**
 * Parses raw text extracted from a PDF quotation and structures it
 * @param {string} text - Raw text from the PDF
 * @returns {Object} - Structured JSON object of the quotation
 */
function parseQuotationText(text) {
  const result = {
    tipo_documento: "COTIZACIÓN",
    numero: null,
    emisor: {
      razon_social: null,
      rut: null,
      giro: null,
      direccion: null,
      fono: null,
      email: null
    },
    receptor: {
      razon_social: null,
      rut: null,
      direccion: null,
      comuna: null
    },
    fechas: {
      fecha_emision: null,
      fecha_vencimiento: null
    },
    detalles: [],
    observaciones: [],
    totales: {
      monto_neto: 0,
      monto_exento: 0,
      iva_19: 0,
      monto_total: 0
    }
  };

  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const isBat = text.toLowerCase().includes("bat ingenieria") || text.toLowerCase().includes("bat ingeniería");
  const isPaez = text.toLowerCase().includes("páez spa") || text.toLowerCase().includes("paez spa");

  if (isBat) {
    result.emisor.razon_social = "BAT INGENIERIA Y CONSTRUCCION SPA";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/Presupuesto\s*(\d+(?:\/\d+)?)/i)) {
        result.numero = line.match(/Presupuesto\s*(\d+(?:\/\d+)?)/i)[1];
      }
      if (line.match(/Mandante:\s*(.*)/i)) {
        result.receptor.razon_social = line.match(/Mandante:\s*(.*)/i)[1].trim();
      }
      if (line.match(/Fecha\s*:\s*([\d\-]+)/i)) {
        result.fechas.fecha_emision = line.match(/Fecha\s*:\s*([\d\-]+)/i)[1].trim();
      }
      if (line.match(/Rut\s*:\s*([\d\.\-]+)/i) && !result.emisor.rut) {
        result.emisor.rut = line.match(/Rut\s*:\s*([\d\.\-]+)/i)[1].trim();
      }
      if (line.match(/Dirección\s*:\s*(.*)/i) && !result.emisor.direccion) {
        result.emisor.direccion = line.match(/Dirección\s*:\s*(.*)/i)[1].trim();
      }
      if (line.match(/Contacto Empresa\.\s*(.*)/i)) {
        result.emisor.fono = line.match(/fono\s*([\+\d\s]+)/i)?.[1]?.trim() || null;
      }
      if (line.match(/UBICACIÓN DE LOS TRABAJOS:/i)) {
        if (lines[i+1]) result.receptor.direccion = lines[i+1].trim();
      }
    }

    let items = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match main item: e.g. "1" (must be followed by description, quantity, unit, price)
      if (line.match(/^\d+$/)) {
        const itemNum = line;
        const desc = lines[i+1] || "";
        const qtyStr = lines[i+2] || "";
        const unitStr = (lines[i+3] || "").trim();
        const priceStr = (lines[i+4] || "").trim();
        
        if (qtyStr.match(/^\d+$/) && 
            unitStr.match(/^(Global|mt2|mt3|ml|kg|UNID|un|saco|sacos)$/i) && 
            priceStr.match(/^\d{1,3}(\.\d{3})+$/)) {
          
          items.push({
            item: itemNum,
            descripcion_resumen: desc,
            descripcion_detallada: "",
            cantidad: parseInt(qtyStr, 10),
            unidad: unitStr,
            precio_unitario: cleanNumber(priceStr),
            total: parseInt(qtyStr, 10) * cleanNumber(priceStr)
          });
          i += 4;
          continue;
        }
      }
      
      // Match sub-item: e.g. "1.1" (max 2 decimal places to avoid matching totals like 661.200)
      if (line.match(/^\d+\.\d{1,2}$/)) {
        const itemNum = line;
        let desc = lines[i+1] || "";
        if (lines[i+2] && !lines[i+2].match(/^\d+(\.\d+)?$/) && !lines[i+2].includes("$") && !lines[i+2].includes("SUBTOTAL")) {
          desc += " " + lines[i+2];
          i++;
        }
        items.push({
          item: itemNum,
          descripcion_resumen: desc,
          descripcion_detallada: "",
          cantidad: 1,
          unidad: "Global",
          precio_unitario: 0,
          total: 0
        });
        i++;
        continue;
      }
    }
    result.detalles = items;

    // Find Totals by scanning backwards from SUBTOTAL NETO
    const subtotalLineIdx = lines.findIndex(l => l.toUpperCase().includes("SUBTOTAL NETO"));
    if (subtotalLineIdx !== -1) {
      const foundNumbers = [];
      for (let j = subtotalLineIdx - 1; j >= 0 && foundNumbers.length < 3; j--) {
        const lineVal = lines[j];
        if (lineVal.match(/^\d{1,3}(\.\d{3})+$/)) {
          foundNumbers.push(cleanNumber(lineVal));
        }
      }
      if (foundNumbers.length === 3) {
        result.totales.monto_total = foundNumbers[0];
        result.totales.iva_19 = foundNumbers[1];
        result.totales.monto_neto = foundNumbers[2];
      }
    }
  } else if (isPaez) {
    result.emisor.razon_social = "SERVICIOS DE MANTENIMIENTO INDUSTRIAL PÁEZ SPA";
    result.emisor.giro = "COMERCIALIZADORA DE INSUMOS DE ASEO, GASFITERIA Y REPARACIONES EN GRAL";
    result.emisor.direccion = "Carlos Ditborn 0702 , Ñuñoa , XIII Metropolitana de Santiago";
    result.emisor.fono = "+56 9 4239 5271";
    result.emisor.email = "primeservice.chile@gmail.com";
    result.emisor.rut = "77.141.881-3";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/Nº\s*(\d+)/i)) {
        result.numero = parseInt(line.match(/Nº\s*(\d+)/i)[1], 10);
      }
      if (line.match(/Cliente\s*(.*?)\s*RUT\s*([\d\.\-]+)/i)) {
        const m = line.match(/Cliente\s*(.*?)\s*RUT\s*([\d\.\-]+)/i);
        result.receptor.razon_social = m[1].trim();
        result.receptor.rut = m[2].trim();
      }
      if (line.match(/Fecha Emisión\s*(.*?)\s*Fecha/i)) {
        result.fechas.fecha_emision = line.match(/Fecha Emisión\s*(.*?)\s*Fecha/i)[1].trim();
      }
      if (line.match(/Vencimiento/i) && lines[i+1]) {
        result.fechas.fecha_vencimiento = lines[i+1].trim();
      }
      if (line.match(/Dirección\s*(.*?)\s*Comuna\s*(.*)/i)) {
        const m = line.match(/Dirección\s*(.*?)\s*Comuna\s*(.*)/i);
        result.receptor.direccion = m[1].trim();
        result.receptor.comuna = m[2].trim();
      }
    }

    let detailsStarted = false;
    let currentItem = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/DETALLES/i)) {
        detailsStarted = true;
        continue;
      }
      if (line.match(/Observaciones/i) || line.match(/TOTALES/i)) {
        detailsStarted = false;
        if (currentItem) {
          result.detalles.push(currentItem);
          currentItem = null;
        }
        continue;
      }

      if (detailsStarted) {
        const numbersMatch = line.match(/^(\d+)\s+(\w+)\s*\$?([\d\.]+)\s*(AF|EX)\s*\$?([\d\.]+)/i);
        if (numbersMatch && currentItem) {
          currentItem.cantidad = parseInt(numbersMatch[1], 10);
          currentItem.unidad = numbersMatch[2];
          currentItem.precio_unitario = cleanNumber(numbersMatch[3]);
          currentItem.impuesto = numbersMatch[4].toUpperCase();
          currentItem.total = cleanNumber(numbersMatch[5]);
        } else {
          const itemStartMatch = line.match(/^(\d+)([A-ZÑa-zñ\s].*)/);
          if (itemStartMatch) {
            if (currentItem) {
              result.detalles.push(currentItem);
            }
            currentItem = {
              item: parseInt(itemStartMatch[1], 10),
              descripcion_resumen: itemStartMatch[2].trim(),
              descripcion_detallada: "",
              cantidad: 1,
              unidad: "UNID",
              precio_unitario: 0,
              impuesto: "AF",
              total: 0
            };
          } else if (currentItem) {
            if (currentItem.descripcion_detallada) {
              currentItem.descripcion_detallada += " " + line;
            } else {
              currentItem.descripcion_detallada = line;
            }
          }
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/Monto Neto/i) && lines[i+1]) {
        result.totales.monto_neto = cleanNumber(lines[i+1]);
      }
      if (line.match(/Monto Exento/i) && lines[i+1]) {
        result.totales.monto_exento = cleanNumber(lines[i+1]);
      }
      if (line.match(/19% IVA/i) && lines[i+1]) {
        result.totales.iva_19 = cleanNumber(lines[i+1]);
      }
      if (line.match(/MONTO TOTAL/i) && lines[i+1]) {
        result.totales.monto_total = cleanNumber(lines[i+1]);
      }
    }
  }

  let obsStarted = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/Observaciones/i) || line.match(/Condiciones Generales/i) || line.match(/Condiciones Comerciales/i)) {
      obsStarted = true;
      continue;
    }
    if (line.match(/TOTALES/i) || line.match(/Orden de compra/i) || line.match(/ATTE\./i)) {
      obsStarted = false;
    }
    if (obsStarted) {
      result.observaciones.push(line);
    }
  }

  return result;
}

/**
 * Main function to load PDF, parse it, and save it as JSON
 * @param {string} pdfPath - Path to PDF file
 * @param {string} jsonPath - Path to output JSON file
 */
async function parsePdfToJson(pdfPath, jsonPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await pdfParse(dataBuffer);
    const structured = parseQuotationText(data.text);
    
    if (jsonPath) {
      fs.writeFileSync(jsonPath, JSON.stringify(structured, null, 2), "utf8");
      console.log(`Success: Structurized ${path.basename(pdfPath)} -> ${path.basename(jsonPath)}`);
    } else {
      console.log(`Success: Structurized ${path.basename(pdfPath)} (in-memory)`);
    }
    return structured;
  } catch (error) {
    console.error(`Error parsing PDF:`, error);
    throw error;
  }
}

module.exports = {
  parseQuotationText,
  parsePdfToJson
};
