const fs = require("fs");
const path = require("path");

const UPGRADES = [
  {
    keyword: "malla",
    replacement: "malla electrosoldada galvanizada de alta resistencia (grado estructural ACMA C139)"
  },
  {
    keyword: "perfil de acero",
    replacement: "perfil de acero estructural galvanizado ASTM A36 con protección anticorrosiva"
  },
  {
    keyword: "chapas de seguridad",
    replacement: "cerraduras de seguridad de alta gama marca Scanavini con llaves multipunto incopiables"
  },
  {
    keyword: "soldadura",
    replacement: "soldadura de arco con electrodo penetrante clase AWS E6011 de alta resistencia estructural"
  },
  {
    keyword: "pintura",
    replacement: "pintura poliuretano de alta resistencia a la intemperie y protección contra rayos UV"
  },
  {
    keyword: "cemento",
    replacement: "cemento Melón Especial Extra de alta resistencia y fraguado controlado"
  },
  {
    keyword: "cierre perimetral",
    replacement: "cierre perimetral de seguridad reforzado con perfiles laminados y malla soldada de alta densidad"
  }
];

/**
 * Upgrades descriptions for 2 or 3 materials to premium/technical terms
 * @param {Array} items - Original items list
 * @returns {Array} - Upgraded items list
 */
function upgradeMaterials(items) {
  let upgradedCount = 0;
  const upgradedItems = items.map(item => {
    let newItem = { ...item };
    if (upgradedCount >= 3) return newItem;

    for (const up of UPGRADES) {
      const regex = new RegExp(up.keyword, "i");
      
      let matched = false;
      if (newItem.descripcion_resumen && newItem.descripcion_resumen.match(regex) && !newItem.descripcion_resumen.includes("grado estructural")) {
        newItem.descripcion_resumen = newItem.descripcion_resumen.replace(regex, up.replacement);
        matched = true;
      }
      if (newItem.descripcion_detallada && newItem.descripcion_detallada.match(regex) && !newItem.descripcion_detallada.includes("grado estructural")) {
        newItem.descripcion_detallada = newItem.descripcion_detallada.replace(regex, up.replacement);
        matched = true;
      }
      
      if (matched) {
        upgradedCount++;
        break;
      }
    }
    return newItem;
  });

  // If less than 2 upgrades were made, force a premium spec upgrade on the first 2 non-zero items
  if (upgradedCount < 2 && upgradedItems.length > 0) {
    let forced = 0;
    for (let i = 0; i < upgradedItems.length && forced < 2; i++) {
      if (upgradedItems[i].total > 0) {
        if (upgradedItems[i].descripcion_resumen && !upgradedItems[i].descripcion_resumen.includes("Premium")) {
          upgradedItems[i].descripcion_resumen += " (Materiales Premium con certificación de resistencia)";
          forced++;
        }
      }
    }
  }

  return upgradedItems;
}

/**
 * Distributes a target percentage surcharge across items
 * @param {Array} items - Original items list
 * @param {number} markupPercent - Target overall markup percentage (20 to 30)
 * @returns {Array} - Recalculated items list with markup applied
 */
function distributeMarkup(items, markupPercent) {
  const S = items.reduce((acc, curr) => acc + curr.total, 0);
  if (S === 0) return items;

  const factors = items.map(item => {
    if (item.total === 0) return 0;
    // Random factor between 1.15 (15%) and 1.35 (35%)
    return 1.15 + Math.random() * 0.20;
  });

  const proposedNewTotals = items.map((item, idx) => {
    if (item.total === 0) return 0;
    return item.total * factors[idx];
  });
  
  const proposedSum = proposedNewTotals.reduce((acc, curr) => acc + curr, 0);
  const targetSum = S * (1 + markupPercent / 100);
  const adjustmentFactor = targetSum / proposedSum;

  let finalTotals = proposedNewTotals.map(val => {
    if (val === 0) return 0;
    return Math.round(val * adjustmentFactor);
  });

  let finalSum = finalTotals.reduce((acc, curr) => acc + curr, 0);
  let diff = Math.round(targetSum) - finalSum;

  if (diff !== 0) {
    let maxIdx = -1;
    let maxVal = -1;
    for (let i = 0; i < finalTotals.length; i++) {
      if (finalTotals[i] > maxVal) {
        maxVal = finalTotals[i];
        maxIdx = i;
      }
    }
    if (maxIdx !== -1) {
      finalTotals[maxIdx] += diff;
    }
  }

  return items.map((item, idx) => {
    if (item.total === 0) return item;
    const newTotal = finalTotals[idx];
    const newUnitPrice = Math.round(newTotal / item.cantidad);
    return {
      ...item,
      precio_unitario: newUnitPrice,
      total: newUnitPrice * item.cantidad
    };
  });
}

/**
 * Analyzes a quotation and generates an upgraded and marked up version
 * @param {Object} originalQuotation - The original parsed quotation JSON
 * @param {number} [markupPercent] - Overall markup percentage (20 to 30)
 * @returns {Object} - Upgraded quotation
 */
function analyzeAndMarkupQuotation(originalQuotation, markupPercent = 25) {
  if (markupPercent < 20 || markupPercent > 30) {
    throw new Error("Markup percentage must be between 20 and 30.");
  }

  const result = JSON.parse(JSON.stringify(originalQuotation));
  
  // 1. Upgrade materials specs
  result.detalles = upgradeMaterials(result.detalles);
  
  // 2. Distribute markup across items
  result.detalles = distributeMarkup(result.detalles, markupPercent);
  
  // 3. Recalculate totals
  let newNeto = 0;
  let newExento = 0;
  result.detalles.forEach(d => {
    if (d.impuesto === "EX" || d.impuesto === "EXENTO") {
      newExento += d.total;
    } else {
      newNeto += d.total;
    }
  });

  const newIva = Math.round(newNeto * 0.19);
  const newTotal = newNeto + newExento + newIva;

  result.totales = {
    monto_neto: newNeto,
    monto_exento: newExento,
    iva_19: newIva,
    monto_total: newTotal
  };

  // Increment proposal number or add revision suffix
  if (typeof result.numero === "number") {
    result.numero += 1; // Increment quote number
  } else if (typeof result.numero === "string" && result.numero.includes("/")) {
    const parts = result.numero.split("/");
    const num = parseInt(parts[0], 10) + 1;
    result.numero = `${num}/${parts[1]}`;
  }

  return result;
}

module.exports = {
  analyzeAndMarkupQuotation,
  upgradeMaterials,
  distributeMarkup
};
