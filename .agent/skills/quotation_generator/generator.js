const fs = require("fs");
const path = require("path");

// Load material prices compendium
const PRICES_PATH = path.join(__dirname, "..", "..", "memory", "material_prices.json");
let materialPrices = [];
try {
  const data = JSON.parse(fs.readFileSync(PRICES_PATH, "utf8"));
  materialPrices = data.materials;
} catch (error) {
  console.warn("Could not load material prices compendium:", error.message);
}

/**
 * Validates a Chilean RUT (Disabled as per user request)
 * @param {string} rut - The RUT string
 * @returns {boolean} - Always true
 */
function validateRut(rut) {
  return true;
}

/**
 * Helper to format numbers to Chilean CLP style ($X.XXX.XXX)
 * @param {number} val - The numeric value
 * @returns {string} - Formatted currency string
 */
function formatCLP(val) {
  return "$" + Math.round(val).toLocaleString("es-CL").replace(/,/g, ".");
}

/**
 * Finds a material price by name or keyword
 * @param {string} query - Keyword to search
 * @returns {Object|null} - The material object or null
 */
function findMaterialPrice(query) {
  if (!query || materialPrices.length === 0) return null;
  const cleanQuery = query.toLowerCase();
  return materialPrices.find(m => m.name.toLowerCase().includes(cleanQuery)) || null;
}

/**
 * Generates a structured quotation object
 */
function createQuotation(data) {

  // Set default dates
  let emissionDate;
  if (data.fecha_emision) {
    const parts = String(data.fecha_emision).split("-");
    if (parts.length === 3) {
      emissionDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      emissionDate = new Date(data.fecha_emision);
    }
  } else {
    emissionDate = new Date();
  }

  let vencimientoDate;
  if (data.fecha_vencimiento) {
    const parts = String(data.fecha_vencimiento).split("-");
    if (parts.length === 3) {
      vencimientoDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    } else {
      vencimientoDate = new Date(data.fecha_vencimiento);
    }
  } else {
    vencimientoDate = new Date(emissionDate.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  const formatChileDate = (d) => {
    const months = [
      "enero", "febrero", "marzo", "abril", "mayo", "junio",
      "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ];
    return `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
  };

  // Process details and calculate totals
  let subtotalNeto = 0;
  let subtotalExento = 0;

  const processedDetails = data.detalles.map((d, index) => {
    const qty = d.cantidad || 1;
    const unitPrice = d.precio_unitario || 0;
    const totalItem = qty * unitPrice;
    const imp = d.impuesto || "AF"; // AF = Afecto, EX = Exento

    if (imp === "AF") {
      subtotalNeto += totalItem;
    } else {
      subtotalExento += totalItem;
    }

    return {
      item: d.item || (index + 1),
      descripcion_resumen: d.descripcion_resumen || "",
      descripcion_detallada: d.descripcion_detallada || "",
      cantidad: qty,
      unidad: d.unidad || "UNID",
      precio_unitario: unitPrice,
      impuesto: imp,
      total: totalItem
    };
  });

  const iva = Math.round(subtotalNeto * 0.19);
  const total = subtotalNeto + subtotalExento + iva;

  return {
    documento: "COTIZACIÓN",
    numero: data.numero || 1000,
    emisor: {
      razon_social: data.emisor.razon_social || "",
      giro: data.emisor.giro || "",
      direccion: data.emisor.direccion || "",
      fono: data.emisor.fono || "",
      email: data.emisor.email || "",
      rut: data.emisor.rut || ""
    },
    receptor: {
      razon_social: data.receptor.razon_social || "",
      rut: data.receptor.rut || "",
      direccion: data.receptor.direccion || "",
      comuna: data.receptor.comuna || ""
    },
    fechas: {
      emision_iso: emissionDate.toISOString().split("T")[0],
      vencimiento_iso: vencimientoDate.toISOString().split("T")[0],
      emision_texto: formatChileDate(emissionDate),
      vencimiento_texto: formatChileDate(vencimientoDate)
    },
    detalles: processedDetails,
    observaciones: data.observaciones || [],
    totales: {
      monto_neto: subtotalNeto,
      monto_exento: subtotalExento,
      iva_19: iva,
      monto_total: total
    }
  };
}

/**
 * Formats a quotation object to a standard text document identical to reference files
 * @param {Object} cot - The quotation object
 * @returns {string} - Formatted plain text
 */
function formatQuotationText(cot) {
  let lines = [];
  lines.push("Página 1 de 1");
  lines.push(cot.emisor.razon_social.toUpperCase());
  if (cot.emisor.giro) {
    lines.push(`Giro: ${cot.emisor.giro.toUpperCase()}`);
  }
  lines.push(cot.emisor.direccion);
  if (cot.emisor.fono) {
    lines.push(`Fono: ${cot.emisor.fono}`);
  }
  if (cot.emisor.email) {
    lines.push(`Email: ${cot.emisor.email}`);
  }
  lines.push(`RUT: ${cot.emisor.rut}`);
  lines.push("COTIZACIÓN");
  lines.push(`Nº ${cot.numero}`);
  lines.push(`Cliente${cot.receptor.razon_social}RUT${cot.receptor.rut}`);
  lines.push(`Fecha Emisión${cot.fechas.emision_texto}Fecha`);
  lines.push("Vencimiento");
  lines.push(cot.fechas.vencimiento_texto);
  lines.push(`Dirección${cot.receptor.direccion}Comuna${cot.receptor.comuna}`);
  lines.push("DETALLES");
  lines.push("NºDescripciónCant/UnidadPrecio Unit.Imp/RetIndTotal");

  cot.detalles.forEach(d => {
    lines.push(`${d.item}${d.descripcion_resumen}`);
    if (d.descripcion_detallada) {
      // Split into long lines or dump as is
      lines.push(d.descripcion_detallada);
    }
    lines.push(`${d.cantidad} ${d.unidad}${formatCLP(d.precio_unitario)}${d.impuesto}${formatCLP(d.total)}`);
  });

  lines.push("Observaciones");
  cot.observaciones.forEach(obs => {
    lines.push(obs);
  });

  lines.push("TOTALES");
  lines.push("Monto Neto");
  lines.push(formatCLP(cot.totales.monto_neto));
  lines.push("Monto Exento");
  lines.push(formatCLP(cot.totales.monto_exento));
  lines.push("19% IVA");
  lines.push(formatCLP(cot.totales.iva_19));
  lines.push("MONTO TOTAL");
  lines.push(formatCLP(cot.totales.monto_total));

  return lines.join("\n");
}

module.exports = {
  validateRut,
  createQuotation,
  formatQuotationText,
  findMaterialPrice
};
